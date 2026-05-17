const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("DAOModule", (m) => {
  // Deploy the DAO Factory
  const daoFactory = m.contract("DAOFactory");

  // Deploy the Governance Token (BloomToken)
  // Initial supply is given to the deployer so they can test voting power
  const bloomToken = m.contract("BloomToken", ["1000000"]); // 1 million initial tokens

  return { daoFactory, bloomToken };
});
