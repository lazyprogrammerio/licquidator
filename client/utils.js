const ethers = require("ethers")
const Web3 = require("web3")
const BigNumber = require('big-number')
const InputDataDecoder = require('ethereum-input-data-decoder')
const sleep = require('sleep-promise')

const ERC20_ABI = require('./src/abi_erc20')
const QIDAO_VAULT_ABI = require("./src/qidao_vault_abi.json")
const QIDAO_VAULT_ABI_WETH = require("./src/qidao_vault_abi_weth.json")
const NETWORKS = require("./src/networks.json")

let DECODER = new InputDataDecoder(ERC20_ABI)
require('console-stamp')(console, '[HH:MM:ss.l]');

let GAS_PRICE_MIN = 100 * (10 ** 9)
let GAS_PRICE_MAX = 1000 * (10 ** 9)
let GAS_PRICE = parseInt((GAS_PRICE_MIN  + GAS_PRICE_MAX) / 2)

function hex_to_ascii(str1) {
    var hex = str1.toString();
    var str = '';
    for (var n = 0; n < hex.length; n += 2) {
        str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
    }
    return str;
}

async function reason(provider, hash) {

    let tx = await provider.getTransaction(hash)
    if (!tx) {
        console.log('tx not found')
    } else {
        let code = await provider.call(tx, tx.blockNumber)
        return hex_to_ascii(code.substr(138))
    }
}

async function get_all_qidao_vaults(network_name, pool_contract_address, signer, cost_value, vault_name) {
  let NETWORK = NETWORKS[network_name]
  if (!NETWORK) {
    throw (`Network <${network_name}> not supported`)
  }
  const NETWORK_CONTRACTS = NETWORK["constracts"]
  const QIDAO_VAULTS = NETWORK["qidao_vaults"]
  const QIDAO_URL_SLUGS = NETWORK["qidao_vaults_url_slug"]

  let abi = QIDAO_VAULT_ABI_WETH
  let max_vault_nr = 100
  let tokenName = ''
  let pool_contract = await new ethers.Contract(pool_contract_address, abi, signer)
  if (pool_contract_address == NETWORKS["matic"]["qidao_vaults"]["matic"]) {
    abi = QIDAO_VAULT_ABI
    tokenName = "Matic"
  } else {
    max_vault_nr = await pool_contract.vaultCount()
    tokenName = await pool_contract.symbol()
  }
  for (let i = 0; i < max_vault_nr; i++) {
    try {
      let is_liquidable = await pool_contract.checkLiquidation(i);
      if (i % 50 == 0 && i > 0) {
        console.log(`Checked ${i} ${tokenName} vaults so far...`)
      }
      if (is_liquidable) {
        let check_extract = (parseInt(await pool_contract.checkExtract(i)) / 10 ** 18).toFixed(4)
        let check_cost = (parseInt(await pool_contract.checkCost(i)) / 10 ** 18).toFixed(4)
        let check_collateral_percentage = 0
        if (pool_contract_address == NETWORKS["matic"]["qidao_vaults"]["matic"]) {
          check_collateral_percentage =  (parseInt(await pool_contract.checkCollat(i))).toFixed(4)
        } else {
          check_collateral_percentage = (parseInt(await pool_contract.checkCollateralPercentage(i))).toFixed(4)
        }
        if (check_cost >= cost_value) {
          let slug = QIDAO_URL_SLUGS[vault_name] || vault_name
          console.log(`Vault ${vault_name} ${i} is liquidable ${is_liquidable}. Cost and extract: ${check_cost} MAI, ${check_extract} ${tokenName}, collat % ${check_collateral_percentage}. app.mai.finance/vaults/${slug}/${i}`)
        }
      }
    } catch (ex) {
      console.log(`${ex}`)
    }
  }
}

async function get_vault_info(network_name, signer, vault_type, vault_id) {
  let NETWORK = NETWORKS[network_name]
  if (!NETWORK) {
    throw (`Network <${network_name}> not supported`)
  }
  const NETWORK_CONTRACTS = NETWORK["constracts"]
  const QIDAO_VAULTS = NETWORK["qidao_vaults"]

  let vault_contract_address = QIDAO_VAULTS[vault_type]

  let vault_info = {
    "id": vault_id,
    "name": vault_type,
    "contract": vault_contract_address,
  }
  
  let abi = QIDAO_VAULT_ABI_WETH
  let vault_contract = await new ethers.Contract(vault_contract_address, abi, signer)
  let collateral_decimals = 18

  try {
    vault_info.collateral_decimals = parseInt(await vault_contract.collateralDecimals())
    // this is the chainlink decimal I think
    //collateral_decimals = vault_info.collateral_decimals
  } catch (ex) {
    console.log(ex)
    throw (`Vault ${vault_type}:${vault_id} does not exist`)
  }

  try {
    vault_info.collateral = (await vault_contract.vaultCollateral(vault_id) / 10 ** collateral_decimals).toString()
  } catch {}

  try {
    vault_info.cost = (await vault_contract.checkCost(vault_id) / 10 ** collateral_decimals).toString()
  } catch {}

  try {
    vault_info.collateral_percentage = (await vault_contract.checkCollateralPercentage(vault_id)).toString()
  } catch {}

  try {
    vault_info.extract = (await vault_contract.checkExtract(vault_id) / 10 ** collateral_decimals).toString()
  } catch {}

  try {
    vault_info.is_liquidable = await vault_contract.checkLiquidation(vault_id)
  } catch {}

  return vault_info
}

module.exports = {
     get_all_qidao_vaults,
     get_vault_info
}

