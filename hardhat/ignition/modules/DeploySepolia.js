const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

module.exports = buildModule("SepoliaDeployModule", (m) => {
  // 1. Deploy the Governance Token (BloomToken)
  // Initial supply of 10,000,000 BLOOM (represented with 18 decimals)
  // 10,000,000 * 10^18 = 10000000000000000000000000
  const initialSupply = m.getParameter("initialSupply", "10000000000000000000000000");
  const bloomToken = m.contract("BloomToken", [initialSupply]);

  // 2. Deploy the DAO Factory
  const daoFactory = m.contract("DAOFactory");

  return { bloomToken, daoFactory };
});
