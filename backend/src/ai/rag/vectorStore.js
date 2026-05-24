/**
 * Vector Store — Qdrant Integration (Phase 6)
 *
 * WHAT IS QDRANT?
 * ---------------
 * Qdrant is a vector database — it stores embedding vectors and lets you
 * search for the most similar ones. Think of it like a search engine,
 * but instead of matching keywords, it matches MEANING.
 *
 * WHY QDRANT (not Pinecone, Weaviate, etc.)?
 * - Open source (can self-host for free)
 * - Simple REST API
 * - Fast similarity search
 * - Has a good JavaScript client
 * - Free cloud tier for development
 *
 * SETUP:
 * Option 1 — Docker (recommended for local dev):
 *   docker run -p 6333:6333 qdrant/qdrant
 *
 * Option 2 — Qdrant Cloud (free tier):
 *   https://cloud.qdrant.io → Create cluster → Get URL + API key
 *
 * Add to .env:
 *   QDRANT_URL=http://localhost:6333
 *   QDRANT_COLLECTION=blockbloom_governance
 */

const { QdrantClient } = require('@qdrant/js-client-rest');
const logger = require('../../config/logger');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'blockbloom_governance';
const VECTOR_SIZE = 768; // Gemini text-embedding-004 produces 768-dim vectors

let client = null;

/**
 * Get the Qdrant client singleton.
 */
function getClient() {
  if (!client) {
    client = new QdrantClient({
      url: QDRANT_URL,
      apiKey: QDRANT_API_KEY,
    });
    logger.info(`[VectorStore] Qdrant client initialized: ${QDRANT_URL}`);
  }
  return client;
}

/**
 * Initialize the collection (create if it doesn't exist).
 * Call this once at startup or before first use.
 */
async function initCollection() {
  const qdrant = getClient();

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (!exists) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: 'Cosine', // Cosine similarity is best for text embeddings
        },
      });
      logger.info(`[VectorStore] Created collection: ${COLLECTION_NAME}`);
    } else {
      logger.info(`[VectorStore] Collection already exists: ${COLLECTION_NAME}`);
    }
  } catch (error) {
    logger.error('[VectorStore] Failed to init collection:', error.message);
    throw error;
  }
}

/**
 * Upsert (insert or update) points into the vector store.
 *
 * @param {Array<{ id: string, vector: number[], metadata: Object, content: string }>} points
 */
async function upsertPoints(points) {
  const qdrant = getClient();

  const formattedPoints = points.map((point, index) => ({
    id: point.id || Date.now() + index,
    vector: point.vector,
    payload: {
      content: point.content,
      ...point.metadata,
    },
  }));

  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points: formattedPoints,
  });

  logger.info(`[VectorStore] Upserted ${formattedPoints.length} points`);
}

/**
 * Search for similar vectors (semantic search).
 *
 * @param {number[]} queryVector - The query embedding
 * @param {number} limit - Max results to return
 * @param {Object} filter - Optional Qdrant filter
 * @returns {Promise<Array<{ content: string, score: number, metadata: Object }>>}
 */
async function search(queryVector, limit = 5, filter = null) {
  const qdrant = getClient();

  const searchParams = {
    vector: queryVector,
    limit,
    with_payload: true,
  };

  if (filter) {
    searchParams.filter = filter;
  }

  const results = await qdrant.search(COLLECTION_NAME, searchParams);

  return results.map(r => ({
    content: r.payload.content,
    score: r.score,
    metadata: {
      title: r.payload.title,
      source: r.payload.source,
      chunkIndex: r.payload.chunkIndex,
      documentId: r.payload.documentId,
    },
  }));
}

/**
 * Delete points by document ID (when re-indexing a document).
 *
 * @param {string} documentId - The document ID to delete chunks for
 */
async function deleteByDocumentId(documentId) {
  const qdrant = getClient();

  await qdrant.delete(COLLECTION_NAME, {
    wait: true,
    filter: {
      must: [{ key: 'documentId', match: { value: documentId } }],
    },
  });

  logger.info(`[VectorStore] Deleted points for document: ${documentId}`);
}

/**
 * Health check — can we reach Qdrant?
 */
async function checkHealth() {
  try {
    const qdrant = getClient();
    const info = await qdrant.getCollections();
    return { healthy: true, collections: info.collections.length };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

module.exports = {
  getClient,
  initCollection,
  upsertPoints,
  search,
  deleteByDocumentId,
  checkHealth,
  COLLECTION_NAME,
};
