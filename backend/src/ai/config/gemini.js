/**
 * Gemini Client Configuration — Singleton
 *
 * Creates a single Gemini AI client shared across all AI services.
 * Similar to how provider.js creates a singleton blockchain provider.
 *
 * SETUP:
 * 1. Get an API key from https://aistudio.google.com/apikey
 * 2. Add GEMINI_API_KEY=your-key to backend/.env
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../config/logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

if (!GEMINI_API_KEY) {
  logger.warn('⚠️  GEMINI_API_KEY not set. AI features disabled.');
}

let genAI = null;

/** Returns the GoogleGenerativeAI singleton (lazy init). */
function getGenAI() {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    logger.info(`🤖 Gemini client initialized (model: ${GEMINI_MODEL})`);
  }
  return genAI;
}

/**
 * Returns a GenerativeModel with governance-optimized defaults.
 * @param {Object} opts - Config overrides
 * @param {string} opts.responseMimeType - "application/json" for JSON mode
 * @param {number} opts.temperature - 0.0-1.0 (default 0.3 for consistency)
 * @param {number} opts.maxOutputTokens - Max output length
 */
function getModel(opts = {}) {
  const client = getGenAI();
  if (!client) return null;

  const generationConfig = {
    temperature: opts.temperature ?? 0.3,
    topP: opts.topP ?? 0.8,
    topK: opts.topK ?? 40,
    maxOutputTokens: opts.maxOutputTokens ?? 2048,
  };

  logger.debug(`[GeminiConfig] getModel with config: ${JSON.stringify(generationConfig)}`);

  if (opts.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType;
  }

  const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
  const safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ];

  return client.getGenerativeModel({ model: GEMINI_MODEL, generationConfig, safetySettings });
}

/** Returns a model that only outputs valid JSON. */
function getJsonModel(opts = {}) {
  return getModel({ ...opts, responseMimeType: 'application/json' });
}

/** Returns a model configured for streaming chat responses. */
function getStreamingModel(opts = {}) {
  return getModel({ ...opts, temperature: opts.temperature ?? 0.4 });
}

/** Health check — can we reach the Gemini API? */
async function checkHealth() {
  try {
    const mdl = getModel();
    if (!mdl) return { healthy: false, model: GEMINI_MODEL, error: 'No API key' };
    const result = await mdl.generateContent('Reply with "ok"');
    const text = result.response.text();
    return { healthy: text.toLowerCase().includes('ok'), model: GEMINI_MODEL };
  } catch (error) {
    return { healthy: false, model: GEMINI_MODEL, error: error.message };
  }
}

module.exports = { getGenAI, getModel, getJsonModel, getStreamingModel, checkHealth, GEMINI_MODEL };
