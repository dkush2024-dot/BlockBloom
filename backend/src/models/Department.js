const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
  },
  description: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

// Prevent duplicate department names within the same organization
departmentSchema.index({ name: 1, organization: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);
