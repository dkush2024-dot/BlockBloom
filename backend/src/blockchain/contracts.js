/**
 * Contract Instances Module
 *
 * Pre-configures ethers.js Contract objects for every contract the backend
 * needs to interact with. Other modules import from here instead of
 * constructing contracts themselves.
 *
 * DATA FLOW:
 *   config (addresses) + ABI files + provider → Contract instances
 */

const config = require('../config');
const { getContract } = require('./provider');

// ABIs
const DAOFactoryABI = require('./abi/DAOFactory.json').abi;
const GovernanceABI = require('./abi/Governance.json').abi;
const TreasuryABI = require('./abi/Treasury.json').abi;

/**
 * Returns the DAOFactory contract instance.
 */
function getDAOFactoryContract() {
  if (!config.daoFactoryAddress) return null;
  return getContract(config.daoFactoryAddress, DAOFactoryABI);
}

/**
 * Returns a Governance contract instance for a specific DAO address.
 * Used dynamically — each DAO deploys its own Governance contract.
 *
 * @param {string} daoAddress - The deployed Governance contract address
 */
function getGovernanceContract(daoAddress) {
  return getContract(daoAddress, GovernanceABI);
}

/**
 * Returns a Treasury contract instance for a specific Treasury address.
 * Used dynamically.
 *
 * @param {string} treasuryAddress - The deployed Treasury contract address
 */
function getTreasuryContract(treasuryAddress) {
  return getContract(treasuryAddress, TreasuryABI);
}

module.exports = {
  getDAOFactoryContract,
  getGovernanceContract,
  getTreasuryContract,
  GovernanceABI,
  DAOFactoryABI,
  TreasuryABI,
};
