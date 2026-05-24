/**
 * Treasury Monitoring Agent (Phase 7)
 *
 * Monitors DAO treasury health and provides alerts/analysis.
 * This agent can:
 *   - Check treasury balance
 *   - Analyze spending patterns (from proposals)
 *   - Detect anomalies (e.g., large withdrawals)
 *   - Provide treasury health reports
 */

const { generateJSON } = require('../services/geminiService');
const { getTreasuryBalance, listActiveProposals, getDAOInfo } = require('./tools/governanceTools');
const { BASE_SYSTEM_PROMPT } = require('../prompts/templates');
const logger = require('../../config/logger');

/**
 * Generate a treasury health report.
 *
 * @param {Object} params
 * @param {string} params.daoAddress - DAO address
 * @param {string} params.treasuryAddress - Treasury contract address
 * @returns {Promise<Object>} - Treasury health report
 */
async function analyzeTreasury({ daoAddress, treasuryAddress }) {
  logger.info(`[TreasuryAgent] Analyzing treasury for DAO ${daoAddress}`);

  // Gather data
  const [balance, proposals, daoInfo] = await Promise.all([
    getTreasuryBalance({ treasuryAddress }),
    listActiveProposals({ daoAddress }),
    getDAOInfo({ daoAddress }),
  ]);

  const prompt = `${BASE_SYSTEM_PROMPT}

You are a Treasury Monitoring Agent. Analyze the treasury health.

TREASURY BALANCE:
${JSON.stringify(balance, null, 2)}

ACTIVE PROPOSALS (may request treasury funds):
${JSON.stringify(proposals, null, 2)}

DAO INFO:
${JSON.stringify(daoInfo, null, 2)}

OUTPUT FORMAT — Return valid JSON:
{
  "healthScore": 1-10,
  "status": "healthy | warning | critical",
  "balance": "Current balance summary",
  "activeRisks": ["Risk 1", "Risk 2"],
  "recommendations": ["Recommendation 1"],
  "summary": "One-paragraph treasury health summary"
}`;

  const { data } = await generateJSON(prompt, ['healthScore', 'status']);

  return {
    ...data,
    daoAddress,
    treasuryAddress,
    agentType: 'treasury_monitor',
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeTreasury,
};
