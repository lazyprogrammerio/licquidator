const UTILS = require("./utils")

const ethers = require("ethers")
const Web3 = require("web3")
const BigNumber = require('big-number')
const InputDataDecoder = require('ethereum-input-data-decoder')
const sleep = require('sleep-promise')

const NETWORKS = require("./src/networks.json")

let WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY
if (!WALLET_PRIVATE_KEY) {
  console.log("Provide wallet key as export WALLET_PRIVATE_KEY='KEY'. Using a dummy key now.")
  WALLET_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001"
}

require('console-stamp')(console, '[HH:MM:ss.l]');

const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY);
console.log(wallet.address)

let GAS_PRICE_MIN = 100 * (10 ** 9)
let GAS_PRICE_MAX = 1000 * (10 ** 9)
let GAS_PRICE = parseInt((GAS_PRICE_MIN  + GAS_PRICE_MAX) / 2)

const NETWORK_NAME = process.env.NETWORK_NAME || "matic"
if (!NETWORKS[NETWORK_NAME]) {
  throw (`Network <${NETWORK_NAME}> not supported`)
}
const NETWORK = NETWORKS[NETWORK_NAME]
const QIDAO_VAULTS = NETWORK["qidao_vaults"]

const HTTP_PROVIDER = process.env.PRIVATE_POLYGON_RPC || NETWORK.rpc.url

let connectionInfo = {
  "url": process.env.PRIVATE_POLYGON_RPC_ETHERS || HTTP_PROVIDER,
  "user": process.env.PRIVATE_POLYGON_RPC_USER,
  "password": process.env.PRIVATE_POLYGON_RPC_PASSWORD
}

const provider = new ethers.providers.JsonRpcProvider(connectionInfo)
const tx_getter = new Web3(new Web3.providers.HttpProvider(HTTP_PROVIDER))
const signer = new ethers.Wallet(WALLET_PRIVATE_KEY).connect(provider)


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
    let vaults = Object.keys(QIDAO_VAULTS)
    let cost_value = process.argv[3] || 0
    for (let i = 0; i < vaults.length; i++) {
      let vault_name = vaults[i]
      let pool_contract = QIDAO_VAULTS[vault_name]
      console.log(`Getting all pools for ${pool_contract} ${vault_name} with cost value higher than ${cost_value} MAI`)
      UTILS.get_all_qidao_vaults(NETWORK_NAME, pool_contract, signer, cost_value, vault_name)
    }
  }

  if (process.argv[2] == 'get_vault') {
    vaultType = process.argv[3]
    vaultId = process.argv[4]

    console.log(`Getting information for vault type ${vaultType} and id ${vaultId}`)

    let vaultInfo = await UTILS.get_vault_info(NETWORK_NAME, signer, vaultType, vaultId)

    console.log(vaultInfo)
  }

  if (process.argv[2] == 'find_big_liquidations') {
    let vaultType = process.argv[3]
    let max_vaults = parseInt(process.argv[4])
    let vaults = []
    let concurrentJobs = []
    for (let i = 0; i < max_vaults; i++) {
      concurrentJobs.push(UTILS.get_vault_info(NETWORK_NAME, signer, vaultType, i))
    }
    for (let i = 0; i < max_vaults; i++) {
      vaults.push(await(concurrentJobs[i]))
    }
    let orderedVaults = vaults.filter(function(a) {
      return a.mai_debt > 1000 && a.collateral_to_debt < 175
    })
    orderedVaults = orderedVaults.sort(function(a, b) {
      return a.mai_debt - b.mai_debt
    })

    console.log(orderedVaults)
  }

}

main()
