const ethers = require("ethers")
const Web3 = require("web3")
const BigNumber = require('big-number')
const InputDataDecoder = require('ethereum-input-data-decoder')
const sleep = require('sleep-promise')

const ERC20_ABI = require('./src/abi_erc20')
const QIDAO_VAULT_ABI = require("./src/qidao_vault_abi.json")
const QIDAO_VAULT_ABI_WETH = require("./src/qidao_vault_abi_weth.json")

const CHAINLINK_PRICE_SOURCE_ABI = require("./src/chainlink_price_source_abi.json")
const CHAINLINK_PRICE_SOURCE_CAM_ABI = require("./src/chainlink_price_source_cam_abi.json")

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
    console.log(`Vault vault_info.collateral_decimals cannot be retrieved`)
    //throw (`Vault ${vault_type}:${vault_id} does not exist`)
  }

  try {
    vault_info.min_collateral_percentage = (await vault_contract._minimumCollateralPercentage()).toString()
  } catch (ex){
    console.log(`Vault vault_info.min_collateral_percentage cannot be retrieved`)
  }

  try {
    vault_info.price_source_address = (await vault_contract.ethPriceSource())
  } catch (ex) {
    console.log(`Vault vault_info.price_source_address cannot be retrieved`)
  }

  try {
    let chainlink_price_source_contract = await new ethers.Contract(vault_info.price_source_address, CHAINLINK_PRICE_SOURCE_ABI, signer)
    vault_info.price_source_aggregator_address = await chainlink_price_source_contract.aggregator()
  } catch (ex) {
    console.log(`Vault vault_info.price_source_aggregator_address cannot be retrieved, maybe a wrapped token.`)
    // if there is no aggregator, it means this is a CAM token
    // with underlying shares
    try {
      let chainlink_price_source_cam_contract = await new ethers.Contract(vault_info.price_source_address, CHAINLINK_PRICE_SOURCE_CAM_ABI, signer)
      vault_info.price_source_aggregator_address_intermediate = await chainlink_price_source_cam_contract.priceSource()
      let chainlink_price_source_contract_last = await new ethers.Contract(vault_info.price_source_aggregator_address_intermediate, CHAINLINK_PRICE_SOURCE_ABI, signer)
      vault_info.price_source_aggregator_address = await chainlink_price_source_contract_last.aggregator()
    } catch(ex) {
      console.log(`Vault vault_info.price_source_aggregator_address cannot be retrieved, maybe a double wrapped token.`)
    }
  }

  try {
    vault_info.collateral_address = (await vault_contract.collateral())
  } catch {
    console.log(`Vault vault_info.collateral_address cannot be retrieved`)
  }

  try {
    vault_info.collateral_raw = await vault_contract.vaultCollateral(vault_id)
    vault_info.collateral = (vault_info.collateral_raw / 10 ** collateral_decimals).toString()
  } catch {
    console.log(`Vault vault_info.collateral cannot be retrieved`)
  }

  try {
    vault_info.cost = (await vault_contract.checkCost(vault_id) / 10 ** collateral_decimals).toString()
  } catch {
    console.log(`Vault vault_info.cost cannot be retrieved`)
  }

  try {
    vault_info.collateral_percentage = (await vault_contract.checkCollateralPercentage(vault_id)).toString()
  } catch {
    console.log(`Vault vault_info.collateral_percentage cannot be retrieved`)
  }

  try {
    vault_info.extract = (await vault_contract.checkExtract(vault_id) / 10 ** collateral_decimals).toString()
  } catch {
    console.log(`Vault vault_info.extract cannot be retrieved`)
  }

  try {
    vault_info.is_liquidable = await vault_contract.checkLiquidation(vault_id)
  } catch {
    console.log(`Vault vault_info.is_liquidable cannot be retrieved`)
  }

 try {
   vault_info.mai_debt_raw = await vault_contract.vaultDebt(vault_id)
   vault_info.mai_debt = (await vault_contract.vaultDebt(vault_id) / 10 ** collateral_decimals).toString()
 } catch {
   console.log(`Vault vault_info.mai_debt cannot be retrieved`)
 }

 try {
   vault_info.mai_contract = (await vault_contract.mai())
 } catch {
   console.log(`Vault vault_info.mai_contract cannot be retrieved`)
 }
 if (vault_info.mai_contract.toLowerCase() != "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1".toLowerCase()) {
   throw (`MAI contract does not match the correct one ${vault_info.mai_contract}`)
 }

 try {
   vault_info.collateral_usdc_price = (await vault_contract.getEthPriceSource() / 10 ** 8).toString()
   vault_info.collateral_usdc_price_raw = parseInt(await vault_contract.getEthPriceSource())
 } catch {
   console.log(`Vault vault_info.vault_info.collateral_usdc_price cannot be retrieved`)
 }
 
  vault_info.debt_usdc = vault_info.mai_debt
  vault_info.collateral_usdc_raw = vault_info.collateral_usdc_price_raw * vault_info.collateral_raw
  vault_info.collateral_usdc = vault_info.collateral_usdc_raw / 10 ** 18 / 10 ** 8
  vault_info.collateral_to_debt = vault_info.collateral_usdc_raw / vault_info.debt_usdc / 10 ** (18 + 8 - 2)

  vault_info.liquidation_collateral_price_raw = parseInt(vault_info.min_collateral_percentage) * (vault_info.debt_usdc * 10 ** (18 + 8 - 2)) / vault_info.collateral_raw
  vault_info.liquidation_collateral_price = vault_info.liquidation_collateral_price_raw / 10 ** (8)

 return vault_info
}

module.exports = {
     get_all_qidao_vaults,
     get_vault_info
}

