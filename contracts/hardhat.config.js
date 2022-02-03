require("@nomiclabs/hardhat-waffle");
module.exports = {
  defaultNetwork: "matic",
  networks: {
    hardhat: {
    },
    matic: {
      url: "https://polygon-rpc.com/",
      chainId: 137,
      accounts: [process.env.ETHEREUM_WALLET_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001"]
    }
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
              enabled: true,
              runs: 200,
          }
        }
      },
    ]
  }
};

