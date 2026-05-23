/**
 * Proposal Explainer Service
 *
 * The first real AI feature: takes a governance proposal and explains it
 * in simple, beginner-friendly language.
 *
 * USER FLOW:
 *   1. User views a proposal on the dashboard
 *   2. Clicks "Explain with AI" button
 *   3. Frontend sends proposal data to POST /api/ai/explain
 *   4. This service builds a prompt, calls Gemini, returns structured explanation
 *   5. Frontend displays the explanation in a clean card
 *
 * ARCHITECTURE:
 *   Controller → proposalExplainer.js (this) → geminiService.js → Gemini API
 */

const { generateJSON, streamText } = require('./geminiService');
const { buildExplainPrompt, buildSummaryPrompt } = require('../prompts/governance');
const logger = require('../../config/logger');

/**
 * Explain a proposal in simple language.
 * Returns a structured JSON explanation.
 *
 * @param {Object} proposal - Proposal data from DB or frontend
 * @returns {Promise<Object>} - Structured explanation
 */
async function explainProposal(proposal) {
  if (!proposal) {
    throw new Error('Proposal data is required');
  }

  logger.info(`[ProposalExplainer] Explaining proposal: ${proposal.title || proposal.proposalId}`);

  // Build the complete prompt with real proposal data injected
  const prompt = buildExplainPrompt(proposal);

  // Call Gemini in JSON mode for reliable structured output
  const { data, tokenCount } = await generateJSON(prompt, [
    'summary',
    'importance',
    'details',
    'risks',
    'voteImplications',
  ]);

  logger.info(`[ProposalExplainer] Explanation generated (${tokenCount} tokens)`);

  return {
    ...data,
    proposalId: proposal.proposalId || proposal._id,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a concise summary of a proposal.
 *
 * @param {Object} proposal - Proposal data
 * @returns {Promise<Object>} - Summary object
 */
async function summarizeProposal(proposal) {
  if (!proposal) {
    throw new Error('Proposal data is required');
  }

  logger.info(`[ProposalExplainer] Summarizing proposal: ${proposal.title || proposal.proposalId}`);

  const prompt = buildSummaryPrompt(proposal);
  const { data } = await generateJSON(prompt, ['summary', 'status']);

  return {
    ...data,
    proposalId: proposal.proposalId || proposal._id,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Stream a proposal explanation (for real-time UI updates).
 * Returns an async generator of text chunks.
 *
 * @param {Object} proposal - Proposal data
 * @returns {AsyncGenerator<string>} - Yields text chunks
 */
async function* streamExplanation(proposal) {
  if (!proposal) {
    throw new Error('Proposal data is required');
  }

  const prompt = buildExplainPrompt(proposal);
  yield* streamText(prompt);
}

module.exports = {
  explainProposal,
  summarizeProposal,
  streamExplanation,
};
