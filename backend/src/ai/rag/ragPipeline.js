/**
 * RAG Pipeline — End-to-End Retrieval Augmented Generation (Phase 6)
 *
 * WHAT IS RAG?
 * -----------
 * RAG combines search with AI generation:
 *   1. User asks a question
 *   2. We SEARCH our document database for relevant information
 *   3. We AUGMENT the AI prompt with the found information
 *   4. The AI GENERATES an answer based on real documents
 *
 * This is the "R" in RAG = Retrieval, "A" = Augmented, "G" = Generation
 *
 * FULL FLOW:
 *   Upload: Document → Chunk → Embed → Store in Qdrant
 *   Query:  Question → Embed → Search Qdrant → Get relevant chunks
 *           → Inject into prompt → Gemini generates grounded answer
 */

const { chunkDocument } = require('./chunker');
const { embedText, embedBatch } = require('./embeddings');
const { upsertPoints, search, initCollection, deleteByDocumentId } = require('./vectorStore');
const { generateJSON } = require('../services/geminiService');
const { BASE_SYSTEM_PROMPT } = require('../prompts/templates');
const logger = require('../../config/logger');
const crypto = require('crypto');

/**
 * Ingest (upload and index) a governance document.
 *
 * STEPS:
 * 1. Split the document into chunks
 * 2. Generate embeddings for each chunk
 * 3. Store chunks + embeddings in Qdrant
 *
 * @param {string} text - The full document text
 * @param {Object} metadata - Document metadata
 * @param {string} metadata.title - Document title
 * @param {string} metadata.source - Where the document came from
 * @param {string} metadata.type - Type (bylaws, proposal, meeting_notes, etc.)
 * @returns {Promise<{ documentId: string, chunksIndexed: number }>}
 */
async function ingestDocument(text, metadata = {}) {
  const documentId = metadata.documentId || `doc_${crypto.randomBytes(8).toString('hex')}`;

  logger.info(`[RAG] Ingesting document: "${metadata.title || documentId}"`);

  // Step 1: Ensure collection exists
  await initCollection();

  // Step 2: If re-indexing, delete old chunks
  if (metadata.documentId) {
    await deleteByDocumentId(documentId);
  }

  // Step 3: Chunk the document
  const chunks = await chunkDocument(text, {
    ...metadata,
    documentId,
  });

  if (chunks.length === 0) {
    throw new Error('Document produced no chunks — it may be too short');
  }

  // Step 4: Generate embeddings for all chunks
  const embeddings = await embedBatch(chunks.map(c => c.content));

  // Step 5: Store in Qdrant
  const points = chunks.map((chunk, i) => ({
    id: `${documentId}_${i}`, // Deterministic IDs for idempotent upserts
    vector: embeddings[i],
    content: chunk.content,
    metadata: chunk.metadata,
  }));

  // Qdrant requires numeric or UUID IDs
  const numericPoints = points.map((p, i) => ({
    ...p,
    id: Date.now() + i,
  }));

  await upsertPoints(numericPoints);

  logger.info(`[RAG] Indexed ${chunks.length} chunks for "${metadata.title || documentId}"`);

  return {
    documentId,
    chunksIndexed: chunks.length,
    title: metadata.title,
  };
}

/**
 * Query the governance knowledge base.
 *
 * STEPS:
 * 1. Convert the question to an embedding
 * 2. Search Qdrant for similar chunks
 * 3. Build a prompt with retrieved context
 * 4. Generate an AI answer grounded in the documents
 *
 * @param {string} question - User's question
 * @param {Object} opts - Query options
 * @param {number} opts.topK - Number of chunks to retrieve (default 5)
 * @param {number} opts.minScore - Minimum similarity score (default 0.5)
 * @returns {Promise<{ answer: string, sources: Array, confidence: string }>}
 */
async function query(question, opts = {}) {
  const topK = opts.topK || 5;
  const minScore = opts.minScore || 0.5;

  logger.info(`[RAG] Query: "${question.substring(0, 80)}"`);

  // Step 1: Embed the question
  const queryVector = await embedText(question);

  // Step 2: Search for similar chunks
  const results = await search(queryVector, topK);

  // Filter by minimum score
  const relevantResults = results.filter(r => r.score >= minScore);

  if (relevantResults.length === 0) {
    return {
      answer: 'I could not find relevant information in the governance documents to answer your question.',
      sources: [],
      confidence: 'low',
    };
  }

  // Step 3: Build context from retrieved chunks
  const context = relevantResults
    .map((r, i) => `[Source ${i + 1}: ${r.metadata.title || 'Unknown'}]\n${r.content}`)
    .join('\n\n---\n\n');

  // Step 4: Generate answer with context
  const prompt = `${BASE_SYSTEM_PROMPT}

TASK: Answer the user's question based ONLY on the following governance documents.
If the documents don't contain the answer, say so clearly.

RETRIEVED GOVERNANCE DOCUMENTS:
${context}

USER QUESTION: ${question}

OUTPUT FORMAT — Return valid JSON:
{
  "answer": "Your detailed answer based on the documents",
  "sources": ["List of source document titles used"],
  "confidence": "high | medium | low",
  "keyPoints": ["Key point 1", "Key point 2"]
}`;

  const { data } = await generateJSON(prompt, ['answer']);

  return {
    ...data,
    sources: relevantResults.map(r => ({
      title: r.metadata.title,
      score: Math.round(r.score * 100) / 100,
      excerpt: r.content.substring(0, 200) + '...',
    })),
  };
}

module.exports = {
  ingestDocument,
  query,
};
