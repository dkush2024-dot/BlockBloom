/**
 * Vote Model
 *
 * Records individual vote-cast actions. Each document corresponds to
 * one VoteCast event from the Governance contract.
 *
 * WHY A SEPARATE COLLECTION:
 *   - Embedding votes inside Proposal would cause the Proposal document to
 *     grow without bound — a popular proposal could have thousands of votes.
 *   - A separate collection lets us paginate, filter by voter, and run
 *     aggregate queries (e.g., "top voters leaderboard") efficiently.
 *   - The trade-off: to get a proposal + its votes, the service layer does
 *     two queries. This is acceptable because the API rarely needs both.
 */

const mongoose = require('mongoose');

const voteSchema = new mongoose.Schema(
  {
    // The DAO this vote belongs to
    daoAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    // On-chain proposal ID
    proposalId: {
      type: String,
      required: true,
    },

    // Wallet that cast the vote
    voter: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    // Index of the chosen option (maps to Proposal.options[optionIndex])
    optionIndex: {
      type: Number,
      required: true,
    },

    // Token-weighted vote power (uint256 as string)
    weight: {
      type: String,
      required: true,
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

// A wallet can only vote once per proposal per DAO
voteSchema.index({ daoAddress: 1, proposalId: 1, voter: 1 }, { unique: true });

// Query: "all votes on proposal X in DAO Y"
voteSchema.index({ daoAddress: 1, proposalId: 1 });

module.exports = mongoose.model('Vote', voteSchema);
