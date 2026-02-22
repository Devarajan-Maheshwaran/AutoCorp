require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

const PK = process.env.PRIVATE_KEY;

module.exports = {
  solidity: "0.8.19",
  networks: {
    hardhat: { chainId: 31337 },
    sepolia: {
      url:      process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
      accounts: PK ? [PK] : [],
      chainId:  11155111
    }
  }
};
