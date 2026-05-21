const mongoose = require('mongoose');

const draftProposalSchema = new mongoose.Schema(
  {
    daoAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    proposer: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    options: {
      type: [String],
      default: ['Option 1', 'Option 2'],
    },
    isFinancial: {
      type: Boolean,
      default: false,
    },
    target: {
      type: String,
      lowercase: true,
      default: '',
    },
    value: {
      type: String,
      default: '0',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('DraftProposal', draftProposalSchema);
