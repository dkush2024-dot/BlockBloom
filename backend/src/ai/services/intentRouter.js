/**
 * Intent Router — Classifies User Messages
 *
 * When a user sends a message to the Governance Copilot, we need to
 * figure out WHAT they're asking about before we can answer.
 *
 * This service uses Gemini to classify the user's intent into categories
 * like "proposal_explain", "treasury_query", etc., then routes to the
 * appropriate handler.
 *
 * WHY NOT JUST USE ONE BIG PROMPT?
 * Different intents need different context. A treasury question needs
 * treasury data injected. A proposal question needs proposal data.
 * Routing first = smaller, focused prompts = better answers.
 */

const { generateJSON } = require('./geminiService');
const { INTENT_DETECTION_PROMPT, fillTemplate } = require('../prompts/templates');
const logger = require('../../config/logger');

// Valid intent categories
const VALID_INTENTS = [
  'proposal_explain',
  'proposal_status',
  'treasury_query',
  'voting_help',
  'governance_general',
  'off_topic',
];

/**
 * Classify a user message into an intent category.
 *
 * @param {string} message - The user's message
 * @returns {Promise<{ intent: string, confidence: number, entities: Object }>}
 */
async function classifyIntent(message) {
  if (!message || message.trim().length === 0) {
    return { intent: 'off_topic', confidence: 1.0, entities: {} };
  }

  try {
    const prompt = fillTemplate(INTENT_DETECTION_PROMPT, {
      USER_MESSAGE: message,
    });

    const { data } = await generateJSON(prompt, ['intent', 'confidence']);

    // Validate the intent is one of our known categories
    if (!VALID_INTENTS.includes(data.intent)) {
      logger.warn(`[IntentRouter] Unknown intent: ${data.intent}, defaulting to governance_general`);
      data.intent = 'governance_general';
    }

    logger.debug(`[IntentRouter] Classified "${message.substring(0, 50)}" → ${data.intent} (${data.confidence})`);

    return {
      intent: data.intent,
      confidence: data.confidence,
      entities: data.entities || {},
    };
  } catch (error) {
    logger.error('[IntentRouter] Classification failed:', error.message);
    // Fallback: default to general governance
    return {
      intent: 'governance_general',
      confidence: 0.5,
      entities: {},
    };
  }
}

/**
 * Simple keyword-based fallback classifier.
 * Used when the AI classifier fails or for faster routing.
 *
 * @param {string} message - User message
 * @returns {{ intent: string, confidence: number }}
 */
function classifyByKeywords(message) {
  const lower = message.toLowerCase();
  const entities = {};

  // Regex to match "proposal #1", "proposal 1", "prop 1", "proposalId 1", etc.
  const propMatch = message.match(/(?:proposal|prop|#)\s*#?\s*(\d+)/i);
  if (propMatch) {
    entities.proposalId = propMatch[1];
  }

  if (/proposal|explain|what does|break down/i.test(lower)) {
    return { intent: 'proposal_explain', confidence: 0.7, entities };
  }
  if (/status|passed|failed|active|expired/i.test(lower)) {
    return { intent: 'proposal_status', confidence: 0.7, entities };
  }
  if (/treasury|balance|funds|spending|budget/i.test(lower)) {
    return { intent: 'treasury_query', confidence: 0.7, entities };
  }
  if (/vote|voting|should i|support|oppose/i.test(lower)) {
    return { intent: 'voting_help', confidence: 0.7, entities };
  }
  if (/governance|dao|delegate|quorum/i.test(lower)) {
    return { intent: 'governance_general', confidence: 0.6, entities };
  }

  return { intent: 'governance_general', confidence: 0.3, entities };
}

module.exports = {
  classifyIntent,
  classifyByKeywords,
  VALID_INTENTS,
};
