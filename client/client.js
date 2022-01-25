const ethers = require("ethers")
const Web3 = require("web3")
const BigNumber = require('big-number')
const InputDataDecoder = require('ethereum-input-data-decoder')
const sleep = require('sleep-promise')

const ERC20_ABI = require('./src/abi_erc20')
const QIDAO_VAULT_ABI = require("./src/qidao_vault_abi.json")
const QIDAO_VAULT_ABI_WETH = require("./src/qidao_vault_abi_weth.json")
const NETWORKS = require("./src/networks.json")

let WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY
if (!WALLET_PRIVATE_KEY) {
  console.log("Provide wallet key as export WALLET_PRIVATE_KEY='KEY'. Using a dummy key now.")
  WALLET_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001"
}

let DECODER = new InputDataDecoder(ERC20_ABI)
require('console-stamp')(console, '[HH:MM:ss.l]');

const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY);
console.log(wallet.address)

let GAS_PRICE_MIN = 100 * (10 ** 9)
let GAS_PRICE_MAX = 1000 * (10 ** 9)
let GAS_PRICE = parseInt((GAS_PRICE_MIN  + GAS_PRICE_MAX) / 2)

const NETWORK_NAME = process.env.NETWORK_NAME || "matic"
const NETWORK = NETWORKS[NETWORK_NAME]
if (!NETWORK) {
  throw (`Network <${NETWORK_NAME}> not supported`)
}
const NETWORK_CONTRACTS = NETWORK["constracts"]
const QIDAO_VAULTS = NETWORK["qidao_vaults"]

const HTTP_PROVIDER = process.env.PRIVATE_POLYGON_RPC || NETWORK.rpc.url

let connectionInfo = {
  "url": HTTP_PROVIDER
}

const provider = new ethers.providers.JsonRpcProvider(connectionInfo)
const tx_getter = new Web3(new Web3.providers.HttpProvider(HTTP_PROVIDER))
const signer = new ethers.Wallet(WALLET_PRIVATE_KEY).connect(provider)


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

async function get_all_qidao_vaults(pool_contract_address, cost_value) {
  let abi = QIDAO_VAULT_ABI_WETH
  let max_vault_nr = 100
  let tokenName = ''
  let pool_contract = await new ethers.Contract(pool_contract_address, abi, signer)
  if (pool_contract_address == QIDAO_VAULTS["matic"]) {
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
        if (pool_contract_address == QIDAO_VAULTS["matic"]) {
          check_collateral_percentage =  (parseInt(await pool_contract.checkCollat(i))).toFixed(4)
        } else {
          check_collateral_percentage = (parseInt(await pool_contract.checkCollateralPercentage(i))).toFixed(4)
        }
        if (check_cost >= cost_value) {
          console.log(`Vault ${i} is liquidable ${is_liquidable}. Cost and extract: ${check_cost} MAI, ${check_extract} ${tokenName}, collat % ${check_collateral_percentage}`)
        }
      }
    } catch (ex) {
      console.log(`${ex}`)
    }
  }
}

async function main() {
  let gasPrice = await provider.getGasPrice()
  GAS_PRICE = parseInt(parseInt(gasPrice.toString()) * 120 / 100)
  if (GAS_PRICE > GAS_PRICE_MAX) {
    GAS_PRICE = GAS_PRICE_MAX
  } else {
    if (GAS_PRICE < GAS_PRICE_MIN) {
      GAS_PRICE = GAS_PRICE_MIN
    }
  }
  let gasPriceHuman = parseInt(GAS_PRICE / 10 ** 9)
  console.log(`Gas price used: ${gasPriceHuman} gwei.`)

  if (process.argv[2] == 'find_liquidations') {
    let vaults = Object.keys(QIDAO_VAULTS).slice(0, 2)
    let cost_value = process.argv[3] || 0
    for (let i = 0; i < vaults.length; i++) {
      let vault_name = vaults[i]
      let pool_contract = QIDAO_VAULTS[vault_name]
      console.log(`Getting all pools for ${pool_contract} ${vault_name} with cost value higher than ${cost_value} MAI`)
      get_all_qidao_vaults(pool_contract, cost_value)
    }
  }

}

main()
