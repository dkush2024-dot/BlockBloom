require("@nomicfoundation/hardhat-toolbox");

require("dotenv").config()


const{API_URL, PRIVATE_KEY}= process.env;
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
    },
  },
  networks:{
    sepolia:{
      url: API_URL || "https://eth-sepolia.g.alchemy.com/v2/demo",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : ["0x0000000000000000000000000000000000000000000000000000000000000000"],
    }
  }
};
