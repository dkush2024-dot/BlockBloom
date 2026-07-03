const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      index: true,
    },
    performedBy: {
      type: String, // Wallet address
      required: true,
      index: true,
    },
    targetResource: {
      type: String, // e.g., 'Election:0x123', 'Organization:456'
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Flexible payload for arbitrary data
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We already use 'timestamp' field
  }
);

// TTL index to automatically clear logs older than 90 days if desired
// auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
