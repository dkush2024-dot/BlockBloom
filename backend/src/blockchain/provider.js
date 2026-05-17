/**
 * Blockchain Provider Module
 *
 * Creates a single ethers.js v6 JsonRpcProvider connected to the configured
 * RPC endpoint (Alchemy/Infura/local Hardhat node).
 *
 * WHAT IS A PROVIDER?
 *   In Ethers.js, a Provider is a read-only connection to the blockchain.
 *   It can query blocks, read contract state, and listen for events.
 *   It CANNOT send transactions (that requires a Signer with a private key).
 *   Our backend only needs read access — it indexes data, not writes.
 *
 * WHY A SINGLETON:
 *   Creating multiple providers to the same RPC wastes connections and can
 *   hit rate limits. We create one here and share it everywhere.
 */

const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../config/logger');

let provider = null;

/**
 * Returns the singleton JsonRpcProvider instance.
 * Creates it on first call (lazy initialization).
 */
function getProvider() {
  if (!provider) {
    if (!config.rpcUrl) {
      logger.warn('No RPC_URL configured — blockchain features disabled.');
      return null;
    }

    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    logger.info(`🔗 Blockchain provider initialized: ${config.rpcUrl.substring(0, 40)}…`);
  }
  return provider;
}

/**
 * Creates an ethers.js Contract instance for reading data / listening to events.
 *
 * @param {string} address - Deployed contract address
 * @param {Array}  abi     - Contract ABI array
 * @returns {ethers.Contract|null}
 */
function getContract(address, abi) {
  const prov = getProvider();
  if (!prov) return null;

  return new ethers.Contract(address, abi, prov);
}

module.exports = { getProvider, getContract };
