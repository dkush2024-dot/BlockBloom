const mongoose = require('mongoose');

const electionSchema = new mongoose.Schema({
  contractAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  treasuryAddress: {
    type: String,
    lowercase: true,
    trim: true,
  },
  orgId: {
    type: String, // String ID mapping to organization
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  timelockDelay: {
    type: Number,
    required: true,
  },
  quorumVotes: {
    type: Number,
    required: true,
  },
  creator: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  merkleRoot: {
    type: String,
  },
  proposalCount: {
    type: Number,
    default: 0,
  },
  totalVotes: {
    type: Number,
    default: 0,
  },
  blockNumber: {
    type: Number,
  },
  transactionHash: {
    type: String,
  },
}, { timestamps: true });

module.exports = mongoose.model('Election', electionSchema);
