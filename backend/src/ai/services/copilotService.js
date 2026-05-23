/**
 * Governance Copilot Service — Conversational AI Assistant (Phase 3)
 *
 * This is the brain of the Governance Copilot sidebar.
 * It handles:
 *   1. Receiving user messages
 *   2. Detecting intent (what is the user asking about?)
 *   3. Fetching relevant context (blockchain data)
 *   4. Building a context-aware prompt
 *   5. Generating and streaming responses
 *
 * USER FLOW:
 *   User types "What's the status of proposal #3?"
 *       ↓
 *   Intent Router → "proposal_status" with entity proposalId=3
 *       ↓
 *   Context Builder → fetches real proposal #3 data from chain/DB
 *       ↓
 *   Copilot builds prompt with chat history + real data
 *       ↓
 *   Gemini generates grounded response
 *       ↓
 *   Response streamed to frontend
 */

const { generateText, streamText } = require('./geminiService');
const { classifyIntent, classifyByKeywords } = require('./intentRouter');
const { buildFullContext } = require('../context/contextBuilder');
const { COPILOT_SYSTEM_PROMPT, fillTemplate } = require('../prompts/templates');
const logger = require('../../config/logger');

/**
 * Process a copilot chat message.
 * This is the main entry point for the copilot feature.
 *
 * @param {Object} params
 * @param {string} params.message - User's message
 * @param {string} params.daoAddress - Current DAO context (optional)
 * @param {Array} params.chatHistory - Previous messages [{role, content}]
 * @param {string} params.sessionId - Session ID for memory
 * @returns {Promise<{ reply: string, intent: Object, context: Object }>}
 */
async function chat({ message, daoAddress, chatHistory = [], sessionId }) {
  logger.info(`[Copilot] Processing message: "${message.substring(0, 80)}"`);

  // Step 1: Classify the user's intent
  // Use keyword classifier first (fast), then AI classifier for ambiguous cases
  let intent = classifyByKeywords(message);
  if (intent.confidence < 0.6) {
    try {
      intent = await classifyIntent(message);
    } catch {
      // Keyword fallback is fine
    }
  }

  logger.debug(`[Copilot] Intent: ${intent.intent} (${intent.confidence})`);

  // Step 2: Fetch relevant context based on intent
  let governanceContext = '';
  try {
    if (daoAddress && intent.intent !== 'off_topic') {
      governanceContext = await buildFullContext({
        daoAddress,
        proposalId: intent.entities?.proposalId || null,
        includeTreasury: intent.intent === 'treasury_query',
      });
    }
  } catch (error) {
    logger.warn('[Copilot] Context fetch failed:', error.message);
    governanceContext = 'Unable to fetch live governance data.';
  }

  // Step 3: Format chat history for the prompt
  const historyStr = chatHistory
    .slice(-10) // Keep last 10 messages to stay within context window
    .map(msg => `${msg.role === 'user' ? 'USER' : 'ASSISTANT'}: ${msg.content}`)
    .join('\n');

  // Step 4: Build the complete prompt
  const prompt = fillTemplate(COPILOT_SYSTEM_PROMPT, {
    CHAT_HISTORY: historyStr || 'No previous conversation.',
    GOVERNANCE_CONTEXT: governanceContext || 'No governance context available.',
  });

  const fullPrompt = `${prompt}\n\nUSER: ${message}\n\nASSISTANT:`;

  // Step 5: Generate response
  const { text } = await generateText(fullPrompt, {
    temperature: 0.4, // Slightly creative for conversation
    maxOutputTokens: 1024,
  });

  return {
    reply: text.trim(),
    intent,
    context: {
      daoAddress,
      sessionId,
      historyLength: chatHistory.length,
    },
  };
}

/**
 * Stream a copilot response (for real-time chat UI).
 *
 * @param {Object} params - Same as chat()
 * @returns {AsyncGenerator<string>} - Yields text chunks
 */
async function* streamChat({ message, daoAddress, chatHistory = [] }) {
  // Intent classification (use keyword for speed in streaming)
  const intent = classifyByKeywords(message);

  // Fetch context
  let governanceContext = '';
  try {
    if (daoAddress && intent.intent !== 'off_topic') {
      governanceContext = await buildFullContext({
        daoAddress,
        proposalId: intent.entities?.proposalId || null,
        includeTreasury: intent.intent === 'treasury_query',
      });
    }
  } catch {
    governanceContext = 'Unable to fetch live governance data.';
  }

  const historyStr = chatHistory
    .slice(-10)
    .map(msg => `${msg.role === 'user' ? 'USER' : 'ASSISTANT'}: ${msg.content}`)
    .join('\n');

  const prompt = fillTemplate(COPILOT_SYSTEM_PROMPT, {
    CHAT_HISTORY: historyStr || 'No previous conversation.',
    GOVERNANCE_CONTEXT: governanceContext || 'No governance context available.',
  });

  const fullPrompt = `${prompt}\n\nUSER: ${message}\n\nASSISTANT:`;

  yield* streamText(fullPrompt, { temperature: 0.4 });
}

module.exports = {
  chat,
  streamChat,
};
