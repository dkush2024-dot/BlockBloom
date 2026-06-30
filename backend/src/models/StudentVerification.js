const mongoose = require('mongoose');

const studentVerificationSchema = new mongoose.Schema({
  election: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Election',
    required: true,
  },
  walletAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  proof: {
    type: [String],
    default: [],
  }
}, { timestamps: true });

studentVerificationSchema.index({ election: 1, walletAddress: 1 }, { unique: true });

module.exports = mongoose.model('StudentVerification', studentVerificationSchema);
