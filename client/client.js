const ethers = require("ethers")
const Web3 = require("web3")
const BigNumber = require('big-number')
const InputDataDecoder = require('ethereum-input-data-decoder')

const ERC20_ABI = require('./src/abi_erc20')

const QIDAO_VAULT_ABI = require("./src/qidao_vault_abi.json")
const QIDAO_VAULT_ABI_WETH = require("./src/qidao_vault_abi_weth.json")

USDC_CONTRACT_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
MIMATIC_CONTRACT_ADDRESS = "0xa3Fa99A148fA48D14Ed51d610c367C61876997F1"

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY
if (!WALLET_PRIVATE_KEY) {
  throw "Provide wallet key as export WALLET_PRIVATE_KEY='KEY'"
}

let DECODER = new InputDataDecoder(ERC20_ABI)
require('console-stamp')(console, '[HH:MM:ss.l]');

const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY);
console.log(wallet.address)

let GAS_PRICE_MIN = 100 * (10 ** 9)
let GAS_PRICE_MAX = 1000 * (10 ** 9)
let GAS_PRICE = parseInt((GAS_PRICE_MIN  + GAS_PRICE_MAX) / 2)

const HTTP_PROVIDER = process.env.PRIVATE_POLYGON_RPC || "https://polygon-rpc.com/"

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
  if (pool_contract_address == "0x595b3e98641c4d66900a24aa6ada590b41ef85aa") {
    abi = QIDAO_VAULT_ABI
    tokenName = "Matic"
  } else {
    max_vault_nr = await pool_contract.vaultCount()
    tokenName = await pool_contract.symbol()
  }
  for (let i = 0; i < max_vault_nr; i++) {
    try {
      let is_liquidable = await pool_contract.checkLiquidation(i);
      if (is_liquidable) {
        let check_extract = (parseInt(await pool_contract.checkExtract(i)) / 10 ** 18).toFixed(4)
        let check_cost = (parseInt(await pool_contract.checkCost(i)) / 10 ** 18).toFixed(4)
        let check_collateral_percentage = 0
        if (pool_contract_address == "0x595b3e98641c4d66900a24aa6ada590b41ef85aa") {
          check_collateral_percentage =  (parseInt(await pool_contract.checkCollat(i))).toFixed(4)
        } else {
          check_collateral_percentage = (parseInt(await pool_contract.checkCollateralPercentage(i))).toFixed(4)
        }
        if (check_cost >= cost_value) {
          console.log(`Vault ${i} is liquidable ${is_liquidable}. Cost and extract: ${check_cost} MAI, ${check_extract} ${tokenName}, collat % ${check_collateral_percentage}`)
        } else {
          //console.log(`Vault ${i} is not worth it ${check_cost} < ${cost_value}`)
        }
      }
    } catch (ex) {}
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

  let VAULT_CONTRACTS = {
    "matic" : "0x595b3e98641c4d66900a24aa6ada590b41ef85aa",
    "WEMVT": "0x3fd939b017b31eaadf9ae50c7ff7fa5c0661d47c",
    "GMVT": "0xF086dEdf6a89e7B16145b03a6CB0C0a9979F1433",
    "camDAIMVT": "0xD2FE44055b5C874feE029119f70336447c8e8827",
    "SDAM3CRVMVT": "0x57Cbf36788113237D64E46f25A88855c3dff1691",
    "camWEMVT": "0x11A33631a5B5349AF3F165d2B7901A4d67e561ad",
    "camAMVT": "0x578375c3af7d61586c2C3A7BA87d2eEd640EFA40",
    "dQMVT": "0x649Aa6E6b6194250C077DF4fB37c23EE6c098513",
    "BMVT": "0x701A1824e5574B0b6b1c8dA808B184a7AB7A2867",
    "CMVT": "0x98B5F32dd9670191568b661a3e847Ed764943875",
    "AMVT": "0x87ee36f780ae843A78D5735867bc1c13792b7b11",
    "camWBMVT": "0x7dDA5e1A389E0C1892CaF55940F5fcE6588a9ae0",
    "cMVT": "0x88d84a85A87ED12B8f098e8953B322fF789fCD1a",
    "LMVT": "0x61167073E31b1DAd85a3E531211c7B8F1E5cAE72",
    "WBMVT": "0x37131aEDd3da288467B6EBe9A77C523A700E6Ca1",
  }

  if (process.argv[2] == 'find_liquidations') {
    let vaults = Object.keys(VAULT_CONTRACTS)
    let cost_value = process.argv[3] || 0
    for (let i = 0; i < vaults.length; i++) {
      let vault_name = vaults[i]
      let pool_contract = VAULT_CONTRACTS[vault_name]
      console.log(`Getting all pools for ${pool_contract} ${vault_name} with cost value higher than ${cost_value} MAI`)
      get_all_qidao_vaults(pool_contract, cost_value)
    }
  }

}

main()
