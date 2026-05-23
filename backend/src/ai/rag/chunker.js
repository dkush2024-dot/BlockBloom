/**
 * Document Chunker — Splits Documents for RAG (Phase 6)
 *
 * WHY CHUNKING?
 * -------------
 * AI models have context limits. Even with Gemini's 1M token window,
 * we don't want to send entire documents — it's slow, expensive, and
 * the AI struggles to find specific info in huge texts.
 *
 * Instead, we split documents into small, meaningful "chunks" (200-500 words),
 * convert each chunk into an embedding (a numeric vector), and store them
 * in a vector database. When a user asks a question, we find the most
 * relevant chunks and only send THOSE to the AI.
 *
 * CHUNKING STRATEGIES:
 * 1. Fixed Size — Split every N characters (simple but can break sentences)
 * 2. Recursive — Split by paragraphs → sentences → words (preserves meaning)
 * 3. Semantic — Split at topic boundaries (best but complex)
 *
 * We use RECURSIVE splitting because it balances quality and simplicity.
 */

const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const logger = require('../../config/logger');

// Default chunking configuration
const DEFAULT_CHUNK_SIZE = 1000;    // ~250 words per chunk
const DEFAULT_CHUNK_OVERLAP = 200;  // 200 chars overlap between chunks

/**
 * Split a document into chunks for embedding.
 *
 * @param {string} text - The full document text
 * @param {Object} metadata - Metadata to attach to each chunk (title, source, etc.)
 * @param {Object} opts - Chunking options
 * @param {number} opts.chunkSize - Characters per chunk (default 1000)
 * @param {number} opts.chunkOverlap - Overlap between chunks (default 200)
 * @returns {Promise<Array<{ content: string, metadata: Object }>>}
 */
async function chunkDocument(text, metadata = {}, opts = {}) {
  const chunkSize = opts.chunkSize || DEFAULT_CHUNK_SIZE;
  const chunkOverlap = opts.chunkOverlap || DEFAULT_CHUNK_OVERLAP;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n', '\n', '. ', ', ', ' ', ''], // Try to split at natural boundaries
  });

  const docs = await splitter.createDocuments([text], [metadata]);

  logger.info(`[Chunker] Split document into ${docs.length} chunks (size=${chunkSize}, overlap=${chunkOverlap})`);

  return docs.map((doc, index) => ({
    content: doc.pageContent,
    metadata: {
      ...doc.metadata,
      chunkIndex: index,
      totalChunks: docs.length,
    },
  }));
}

/**
 * Split multiple documents into chunks.
 *
 * @param {Array<{ text: string, metadata: Object }>} documents
 * @returns {Promise<Array>} - All chunks from all documents
 */
async function chunkDocuments(documents) {
  const allChunks = [];

  for (const doc of documents) {
    const chunks = await chunkDocument(doc.text, doc.metadata);
    allChunks.push(...chunks);
  }

  logger.info(`[Chunker] Total chunks from ${documents.length} documents: ${allChunks.length}`);
  return allChunks;
}

module.exports = {
  chunkDocument,
  chunkDocuments,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
};
