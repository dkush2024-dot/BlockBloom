/**
 * Embeddings Service — Convert Text to Vectors (Phase 6)
 *
 * WHAT ARE EMBEDDINGS?
 * -------------------
 * An embedding is a list of numbers (a vector) that represents the
 * MEANING of a piece of text. Similar texts get similar vectors.
 *
 * Example:
 *   "DAO treasury balance" → [0.12, -0.45, 0.78, ...]
 *   "governance fund amount" → [0.11, -0.44, 0.79, ...]  ← Very similar!
 *   "recipe for pasta" → [-0.89, 0.23, -0.12, ...]       ← Very different
 *
 * WHY GEMINI FOR EMBEDDINGS?
 * Since we already use Gemini for text generation, using its embedding
 * model keeps our stack simple (one API key, one billing account).
 * Gemini's embedding model produces 768-dimensional vectors.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../../config/logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-004'; // Gemini's embedding model

let genAI = null;

function getGenAI() {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Generate an embedding vector for a single text.
 *
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector (768 dimensions)
 */
async function embedText(text) {
  const client = getGenAI();
  if (!client) throw new Error('GEMINI_API_KEY not configured');

  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);

  return result.embedding.values;
}

/**
 * Generate embeddings for multiple texts in batch.
 *
 * @param {Array<string>} texts - Array of texts to embed
 * @returns {Promise<Array<number[]>>} - Array of embedding vectors
 */
async function embedBatch(texts) {
  const client = getGenAI();
  if (!client) throw new Error('GEMINI_API_KEY not configured');

  const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });

  logger.info(`[Embeddings] Generating embeddings for ${texts.length} texts`);

  // Process in batches of 10 to avoid rate limits
  const batchSize = 10;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const promises = batch.map(text => model.embedContent(text));
    const results = await Promise.all(promises);
    allEmbeddings.push(...results.map(r => r.embedding.values));
  }

  logger.info(`[Embeddings] Generated ${allEmbeddings.length} embeddings`);
  return allEmbeddings;
}

module.exports = {
  embedText,
  embedBatch,
  EMBEDDING_MODEL,
};
