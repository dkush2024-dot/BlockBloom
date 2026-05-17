/**
 * Proposal Model
 *
 * Represents a governance proposal inside a specific DAO.
 * Created when the backend detects a ProposalCreated event on a
 * Governance contract that it is tracking.
 *
 * DESIGN DECISIONS:
 *   - `options` is an embedded array of { name, voteCount } objects because
 *     proposals have a fixed, small number of options (usually 2–5).
 *     Embedding avoids a separate collection + JOIN-like $lookup.
 *   - `status` is a derived/computed field. We update it to "closed" once
 *     endTime has passed. A cron job or a scheduled check can handle this.
 *   - BigNumber-scale values (proposalId, snapshotBlock) are stored as
 *     strings to prevent JavaScript floating-point issues.
 */

const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    voteCount: { type: String, default: '0' }, // uint256-safe
  },
  { _id: false } // No need for separate _id on sub-documents
);

const proposalSchema = new mongoose.Schema(
  {
    // On-chain proposal ID (uint256 as string)
    proposalId: {
      type: String,
      required: true,
    },

    // The DAO this proposal belongs to (Governance contract address)
    daoAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    // Wallet address that created the proposal
    proposer: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    // Proposal description text
    description: {
      type: String,
      required: true,
    },

    // Block number at which voting-power snapshot was taken
    snapshotBlock: {
      type: String,
      required: true,
    },

    // Unix timestamp (seconds) when voting ends
    endTime: {
      type: Date,
      required: true,
      index: true,
    },

    // Whether the proposal result has been executed on-chain
    executed: {
      type: Boolean,
      default: false,
    },

    // Voting options with their current tallies
    options: {
      type: [optionSchema],
      required: true,
      validate: {
        validator: (arr) => arr.length >= 2,
        message: 'A proposal must have at least 2 options.',
      },
    },

    // Financial Proposal details (optional)
    target: {
      type: String,
      lowercase: true,
      default: null, // Address(0) will map to null or Address(0) string
    },
    value: {
      type: String, // Stored as string to avoid uint256 precision loss
      default: '0',
    },
    timelockTxId: {
      type: String,
      default: null,
    },

    // Computed status: active | closed | executed | queued | finalized
    status: {
      type: String,
      enum: ['active', 'closed', 'executed', 'queued', 'finalized'],
      default: 'active',
      index: true,
    },

    // Total votes cast on this proposal (denormalized)
    totalVotesCast: {
      type: Number,
      default: 0,
    },

    // Blockchain metadata
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
    timestamps: true,
  }
);

// Compound unique index — a proposal ID is unique within a DAO
proposalSchema.index({ daoAddress: 1, proposalId: 1 }, { unique: true });

// Query: "all active proposals, newest first"
proposalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Proposal', proposalSchema);
