/**
 * Blockchain module barrel export.
 */

const { getProvider, getContract } = require('./provider');
const {
  getDAOFactoryContract,
  getGovernanceContract,
  getTreasuryContract,
  GovernanceABI,
  DAOFactoryABI,
  TreasuryABI,
} = require('./contracts');

module.exports = {
  getProvider,
  getContract,
  getDAOFactoryContract,
  getGovernanceContract,
  getTreasuryContract,
  GovernanceABI,
  DAOFactoryABI,
  TreasuryABI,
};
