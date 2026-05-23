/**
 * Treasury Assistant Service
 *
 * Handles AI-powered treasury Q&A — users can ask questions like:
 *   "What's the treasury balance?"
 *   "How much has the DAO spent this month?"
 *   "Is the treasury healthy?"
 *
 * The assistant ONLY answers based on real on-chain treasury data
 * (injected into the prompt), preventing hallucination.
 */

const { generateJSON } = require('./geminiService');
const { buildTreasuryQAPrompt } = require('../prompts/treasury');
const { getTreasuryContext } = require('../context/contextBuilder');
const logger = require('../../config/logger');

/**
 * Answer a treasury-related question.
 *
 * @param {string} question - User's treasury question
 * @param {string} treasuryAddress - Treasury contract address
 * @returns {Promise<Object>} - Structured answer with data points
 */
async function askTreasury(question, treasuryAddress) {
  if (!question) throw new Error('Question is required');
  if (!treasuryAddress) throw new Error('Treasury address is required');

  logger.info(`[TreasuryAssistant] Question: "${question.substring(0, 80)}"`);

  // Step 1: Fetch real treasury data from blockchain
  const treasuryData = await getTreasuryContext(treasuryAddress);

  // Step 2: Build the prompt with real data injected
  const balances = {
    eth: treasuryData.ethBalance || 'Unknown',
    bloom: treasuryData.tokenBalance || 'Unknown',
  };

  const prompt = buildTreasuryQAPrompt(question, balances, []);

  // Step 3: Get AI response in structured JSON
  const { data } = await generateJSON(prompt, ['answer', 'confidence']);

  return {
    ...data,
    treasuryAddress,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  askTreasury,
};
