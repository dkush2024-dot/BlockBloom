/**
 * ChatSession Model — Persistent Chat History (Phase 5)
 *
 * Stores copilot chat sessions in MongoDB for permanent history.
 * Each session contains an array of messages (user + assistant).
 *
 * WHY MONGODB (not Redis)?
 * - Redis is great for short-term session memory (TTL-based, fast)
 * - MongoDB is for permanent storage (user can see their chat history)
 * - We use BOTH: Redis for active sessions, MongoDB for persistence
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  // Metadata about the AI response
  metadata: {
    intent: String,
    confidence: Number,
    tokenCount: Number,
  },
}, { _id: false });

const chatSessionSchema = new mongoose.Schema({
  // Unique session identifier
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // User's wallet address (from SIWE auth)
  userAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  // Which DAO this chat is about (optional — could be general)
  daoAddress: {
    type: String,
    lowercase: true,
  },
  // Chat title (auto-generated from first message)
  title: {
    type: String,
    default: 'New Conversation',
  },
  // Array of messages in this session
  messages: [messageSchema],
  // Session state
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true, // adds createdAt, updatedAt
});

// Index for fast lookup of user's recent sessions
chatSessionSchema.index({ userAddress: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
