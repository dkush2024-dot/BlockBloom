const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  creatorAddress: {
    type: String,
    required: true,
    lowercase: true,
  },
  adminAddress: {
    type: String,
    required: true,
    lowercase: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('Organization', organizationSchema);
