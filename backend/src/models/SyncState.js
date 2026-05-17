/**
 * SyncState Model
 *
 * Tracks the last block number the event indexer has processed for each
 * contract. This is critical for crash recovery:
 *   - If the server restarts, the indexer reads the last synced block
 *     and resumes from there — no duplicate processing, no missed events.
 *
 * Without this, you'd either re-process the entire blockchain history
 * on every restart (slow + wasteful) or miss events that happened while
 * the server was down.
 */

const mongoose = require('mongoose');

const syncStateSchema = new mongoose.Schema(
  {
    // Identifier for the contract being tracked (e.g., "daoFactory" or a DAO address)
    contractId: {
      type: String,
      required: true,
      unique: true,
    },

    // The last block number that was successfully processed
    lastSyncedBlock: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SyncState', syncStateSchema);
