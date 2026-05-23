/**
 * GovernanceDoc Model — Tracks Uploaded Governance Documents (Phase 6)
 *
 * Stores metadata about documents that have been indexed into the RAG system.
 * The actual document content is stored as vectors in Qdrant — this model
 * just tracks what documents exist, their source, and indexing status.
 */

const mongoose = require('mongoose');

const governanceDocSchema = new mongoose.Schema({
  // Unique document identifier (used as documentId in Qdrant)
  documentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Human-readable title
  title: {
    type: String,
    required: true,
  },
  // Document type
  type: {
    type: String,
    enum: ['bylaws', 'proposal', 'meeting_notes', 'treasury_report', 'policy', 'other'],
    default: 'other',
  },
  // Where the document came from
  source: {
    type: String,
    default: 'upload',
  },
  // Original text content (for re-indexing)
  content: {
    type: String,
    required: true,
  },
  // Which DAO this document belongs to (optional)
  daoAddress: {
    type: String,
    lowercase: true,
  },
  // Who uploaded it
  uploadedBy: {
    type: String,
    lowercase: true,
  },
  // Indexing metadata
  chunksIndexed: {
    type: Number,
    default: 0,
  },
  indexedAt: {
    type: Date,
  },
  indexStatus: {
    type: String,
    enum: ['pending', 'indexed', 'failed'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('GovernanceDoc', governanceDocSchema);
