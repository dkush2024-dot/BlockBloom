/**
 * DAO Model
 *
 * Represents a single DAO (Decentralized Autonomous Organization) deployed
 * via the DAOFactory contract. Each DAO has its own Governance contract
 * on-chain; this model is the off-chain index of that data.
 *
 * WHY WE INDEX THIS OFF-CHAIN:
 * Querying the blockchain for "all DAOs" is expensive — you'd have to call
 * getDeployedDAOs() and then individually read each contract's storage.
 * By storing an indexed copy in MongoDB, the REST API can return paginated,
 * filtered, sorted results in milliseconds.
 */

const mongoose = require('mongoose');

const daoSchema = new mongoose.Schema(
  {
    // On-chain address of the deployed Governance contract
    contractAddress: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    // Human-readable DAO name (from the DAOCreated event)
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Address of the ERC-20 governance token used by this DAO
    tokenAddress: {
      type: String,
      required: true,
      lowercase: true,
    },

    // Treasury contract address assigned to this DAO
    treasuryAddress: {
      type: String,
      required: true,
      lowercase: true,
    },

    // Minimum tokens required to create a proposal
    proposalThreshold: {
      type: String, // Stored as string to avoid JS number precision loss on uint256
      required: true,
    },

    // Timelock delay for financial proposals (in seconds)
    timelockDelay: {
      type: Number,
      required: true,
    },

    // Wallet address of the account that called createDAO()
    creator: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    // Minimum vote percentage required for a proposal to pass (Phase 2)
    quorumPercentage: {
      type: Number,
      default: 0,
    },

    // Number of proposals created inside this DAO (denormalized for fast queries)
    proposalCount: {
      type: Number,
      default: 0,
    },

    // Total number of votes cast across all proposals (denormalized)
    totalVotes: {
      type: Number,
      default: 0,
    },

    // Blockchain metadata for audit / replay
    blockNumber: {
      type: Number,
      required: true,
    },
    transactionHash: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt, updatedAt automatically
  }
);

// Compound index for queries like "all DAOs created by wallet X, sorted by date"
daoSchema.index({ creator: 1, createdAt: -1 });

module.exports = mongoose.model('DAO', daoSchema);
