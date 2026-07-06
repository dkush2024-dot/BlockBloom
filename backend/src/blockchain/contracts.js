/**
 * Contract Instances Module
 */

const config = require('../config');
const { getContract, getProvider } = require('./provider');
const { ethers } = require('ethers');

// ABIs
const ElectionFactoryABI = require('./abis/ElectionFactory.json');
const ElectionABI = require('./abis/Election.json');
const TreasuryABI = require('./abis/Treasury.json');

function getElectionFactoryContract() {
  if (!config.electionFactoryAddress) return null;
  return getContract(config.electionFactoryAddress, ElectionFactoryABI);
}

function getElectionContract(electionAddress) {
  return getContract(electionAddress, ElectionABI);
}

function getTreasuryContract(treasuryAddress) {
  return getContract(treasuryAddress, TreasuryABI);
}

// Phase 4: Admin wallet instance
function getAdminWallet() {
  const provider = getProvider();
  if (!provider || !config.adminPrivateKey) return null;
  return new ethers.Wallet(config.adminPrivateKey, provider);
}

function getElectionContractWithSigner(electionAddress) {
  const adminWallet = getAdminWallet();
  if (!adminWallet) return null;
  return new ethers.Contract(electionAddress, ElectionABI, adminWallet);
}

module.exports = {
  getElectionFactoryContract,
  getElectionContract,
  getTreasuryContract,
  getAdminWallet,
  getElectionContractWithSigner,
  ElectionFactoryABI,
  ElectionABI,
  TreasuryABI,
};
