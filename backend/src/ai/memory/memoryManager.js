/**
 * Memory Manager — Orchestrates Short-term + Long-term Memory (Phase 5)
 *
 * AI MEMORY EXPLAINED:
 * -------------------
 * Without memory, every AI request is stateless — the AI forgets everything
 * between messages. That's terrible for a conversation.
 *
 * We implement TWO layers of memory:
 *
 * 1. SHORT-TERM (Redis) — Active session cache
 *    - TTL: 24 hours
 *    - Fast read/write
 *    - Holds the last N messages for quick context loading
 *    - Automatically expires old sessions
 *
 * 2. LONG-TERM (MongoDB) — Permanent history
 *    - No expiration
 *    - User can view past conversations
 *    - Used to restore sessions if Redis cache expires
 *
 * FLOW:
 *   New message arrives
 *       ↓
 *   Check Redis for active session → FAST
 *       ↓ miss?
 *   Check MongoDB for saved session → SLOWER but persistent
 *       ↓
 *   Add message to both Redis + MongoDB
 *       ↓
 *   Return chat history for prompt injection
 */

const redisClient = require('../../config/redis');
const ChatSession = require('../../models/ChatSession');
const logger = require('../../config/logger');
const crypto = require('crypto');

const REDIS_PREFIX = 'chat:session:';
const SESSION_TTL = 24 * 60 * 60; // 24 hours in seconds
const MAX_MESSAGES_IN_MEMORY = 20; // Keep last 20 messages in Redis

/**
 * Generate a unique session ID.
 */
function generateSessionId() {
  return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Create a new chat session.
 *
 * @param {string} userAddress - User's wallet address
 * @param {string} daoAddress - Optional DAO context
 * @returns {Promise<Object>} - New session info
 */
async function createSession(userAddress, daoAddress = null) {
  const sessionId = generateSessionId();

  // Save to MongoDB
  const session = await ChatSession.create({
    sessionId,
    userAddress: userAddress.toLowerCase(),
    daoAddress: daoAddress?.toLowerCase(),
    messages: [],
  });

  // Cache in Redis
  await redisClient.setEx(
    `${REDIS_PREFIX}${sessionId}`,
    SESSION_TTL,
    JSON.stringify({ messages: [], daoAddress })
  );

  logger.info(`[Memory] Created session ${sessionId} for ${userAddress}`);

  return {
    sessionId: session.sessionId,
    title: session.title,
    createdAt: session.createdAt,
  };
}

/**
 * Add a message to a session (both Redis + MongoDB).
 *
 * @param {string} sessionId - Session identifier
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @param {Object} metadata - Optional metadata (intent, tokens)
 */
async function addMessage(sessionId, role, content, metadata = {}) {
  const message = {
    role,
    content,
    timestamp: new Date(),
    metadata,
  };

  // 1. Update MongoDB (permanent)
  const session = await ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $push: { messages: message },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  );

  // Auto-generate title from first user message
  if (session && session.messages.length === 1 && role === 'user') {
    const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
    await ChatSession.updateOne({ sessionId }, { title });
  }

  // 2. Update Redis (fast cache)
  try {
    const cacheKey = `${REDIS_PREFIX}${sessionId}`;
    const cached = await redisClient.get(cacheKey);

    let messages = [];
    if (cached) {
      const data = JSON.parse(cached);
      messages = data.messages || [];
    }

    messages.push(message);

    // Keep only the last N messages in Redis (save memory)
    if (messages.length > MAX_MESSAGES_IN_MEMORY) {
      messages = messages.slice(-MAX_MESSAGES_IN_MEMORY);
    }

    await redisClient.setEx(
      cacheKey,
      SESSION_TTL,
      JSON.stringify({ messages, daoAddress: session?.daoAddress })
    );
  } catch (err) {
    // Redis failure is non-fatal — we still have MongoDB
    logger.warn('[Memory] Redis cache update failed:', err.message);
  }
}

/**
 * Get chat history for a session.
 * Tries Redis first (fast), falls back to MongoDB (persistent).
 *
 * @param {string} sessionId - Session identifier
 * @param {number} limit - Max messages to return
 * @returns {Promise<Array>} - Array of {role, content} messages
 */
async function getHistory(sessionId, limit = 10) {
  // 1. Try Redis first (fast)
  try {
    const cached = await redisClient.get(`${REDIS_PREFIX}${sessionId}`);
    if (cached) {
      const data = JSON.parse(cached);
      const messages = data.messages || [];
      return messages.slice(-limit).map(m => ({
        role: m.role,
        content: m.content,
      }));
    }
  } catch (err) {
    logger.warn('[Memory] Redis read failed:', err.message);
  }

  // 2. Fallback to MongoDB
  const session = await ChatSession.findOne({ sessionId });
  if (!session) return [];

  const messages = session.messages.slice(-limit).map(m => ({
    role: m.role,
    content: m.content,
  }));

  // Re-cache in Redis for next time
  try {
    await redisClient.setEx(
      `${REDIS_PREFIX}${sessionId}`,
      SESSION_TTL,
      JSON.stringify({ messages: session.messages.slice(-MAX_MESSAGES_IN_MEMORY), daoAddress: session.daoAddress })
    );
  } catch {
    // Non-fatal
  }

  return messages;
}

/**
 * List all sessions for a user.
 *
 * @param {string} userAddress - User's wallet address
 * @param {number} limit - Max sessions to return
 * @returns {Promise<Array>} - Session list (without full messages)
 */
async function listSessions(userAddress, limit = 20) {
  const sessions = await ChatSession.find(
    { userAddress: userAddress.toLowerCase() },
    { sessionId: 1, title: 1, daoAddress: 1, createdAt: 1, updatedAt: 1, isActive: 1 }
  )
    .sort({ updatedAt: -1 })
    .limit(limit);

  return sessions;
}

/**
 * Delete a chat session.
 *
 * @param {string} sessionId - Session to delete
 * @param {string} userAddress - Must match session owner
 */
async function deleteSession(sessionId, userAddress) {
  const result = await ChatSession.deleteOne({
    sessionId,
    userAddress: userAddress.toLowerCase(),
  });

  // Also remove from Redis
  await redisClient.del(`${REDIS_PREFIX}${sessionId}`);

  return result.deletedCount > 0;
}

module.exports = {
  generateSessionId,
  createSession,
  addMessage,
  getHistory,
  listSessions,
  deleteSession,
};
