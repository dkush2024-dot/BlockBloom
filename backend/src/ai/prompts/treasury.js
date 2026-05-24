/**
 * Treasury-Specific Prompt Builders
 *
 * WHY SEPARATE FROM governance.js?
 * --------------------------------
 * Treasury operations are complex enough to warrant their own prompt module.
 * Treasury prompts often need different data structures (balances, transfers,
 * spending patterns) compared to proposal-focused prompts.
 *
 * This keeps each file focused on one domain — easier to maintain.
 */

const { TREASURY_ASSISTANT_PROMPT, fillTemplate } = require('./templates');

/**
 * Formats a list of treasury transactions for the AI prompt.
 *
 * @param {Array} transactions - Array of transaction objects
 * @returns {string} - Formatted transaction list
 */
function formatTransactionsForPrompt(transactions = []) {
  if (transactions.length === 0) return 'No recent transactions.';

  return transactions.map((tx, i) => `
  ${i + 1}. Type: ${tx.type || 'Unknown'}
     Amount: ${tx.amount || '0'} ${tx.token || 'ETH'}
     From: ${tx.from || 'Unknown'}
     To: ${tx.to || 'Unknown'}
     Date: ${tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Unknown'}
     Status: ${tx.status || 'confirmed'}
  `).join('\n');
}

/**
 * Builds a complete treasury balance summary for prompt injection.
 *
 * @param {Object} balances - Token balances
 * @param {Array} transactions - Recent transactions
 * @returns {string} - Complete treasury context string
 */
function buildTreasuryContext(balances, transactions = []) {
  return `
--- TREASURY OVERVIEW ---
ETH Balance: ${balances?.eth ?? 'Unknown'} ETH
BLOOM Token Balance: ${balances?.bloom ?? 'Unknown'} BLOOM

--- RECENT TRANSACTIONS ---
${formatTransactionsForPrompt(transactions)}
--- END TREASURY ---`.trim();
}

/**
 * Builds a complete treasury Q&A prompt.
 *
 * @param {string} question - User's treasury question
 * @param {Object} balances - Token balances
 * @param {Array} transactions - Recent transactions
 * @returns {string} - Complete prompt ready for Gemini
 */
function buildTreasuryQAPrompt(question, balances, transactions) {
  const treasuryContext = buildTreasuryContext(balances, transactions);
  return fillTemplate(TREASURY_ASSISTANT_PROMPT, {
    TREASURY_DATA: treasuryContext,
    USER_QUESTION: question,
  });
}

module.exports = {
  formatTransactionsForPrompt,
  buildTreasuryContext,
  buildTreasuryQAPrompt,
};
