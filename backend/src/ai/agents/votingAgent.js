/**
 * Voting Recommendation Agent (Phase 7)
 *
 * Helps users make informed voting decisions by analyzing:
 *   - Proposal content and implications
 *   - Current voting trends
 *   - Treasury impact
 *   - Historical voting patterns
 *
 * IMPORTANT: This agent provides ANALYSIS, not advice.
 * It presents pros, cons, and data — the user decides how to vote.
 */

const { generateJSON } = require('../services/geminiService');
const { getProposalDetails, getVotingStats, getTreasuryBalance, getDAOInfo } = require('./tools/governanceTools');
const { BASE_SYSTEM_PROMPT } = require('../prompts/templates');
const logger = require('../../config/logger');

/**
 * Generate a balanced voting analysis.
 *
 * @param {Object} params
 * @param {string} params.proposalId - Proposal to analyze
 * @param {string} params.daoAddress - DAO address
 * @returns {Promise<Object>} - Balanced voting analysis
 */
async function analyzeVote({ proposalId, daoAddress }) {
  logger.info(`[VotingAgent] Analyzing vote for proposal ${proposalId}`);

  const [proposal, voting, daoInfo] = await Promise.all([
    getProposalDetails({ proposalId, daoAddress }),
    getVotingStats({ proposalId, daoAddress }),
    getDAOInfo({ daoAddress }),
  ]);

  if (proposal.error) {
    return { error: `Could not fetch proposal: ${proposal.error}` };
  }

  let treasury = null;
  if (daoInfo.treasuryAddress) {
    treasury = await getTreasuryBalance({ treasuryAddress: daoInfo.treasuryAddress });
  }

  const prompt = `${BASE_SYSTEM_PROMPT}

You are a Voting Analysis Agent. Provide a BALANCED analysis.
NEVER tell the user how to vote. Present facts and analysis only.

PROPOSAL:
${JSON.stringify(proposal, null, 2)}

VOTING DATA:
${JSON.stringify(voting, null, 2)}

DAO & TREASURY:
${JSON.stringify({ dao: daoInfo, treasury }, null, 2)}

OUTPUT FORMAT — Return valid JSON:
{
  "proposalSummary": "Objective summary",
  "argumentsFor": ["Argument 1", "Argument 2"],
  "argumentsAgainst": ["Argument 1", "Argument 2"],
  "votingTrend": {
    "currentResult": "passing | failing | undecided",
    "participation": "Description of turnout"
  },
  "keyConsiderations": ["Consideration 1"],
  "disclaimer": "This is analysis only, not voting advice."
}`;

  const { data } = await generateJSON(prompt, ['proposalSummary', 'argumentsFor', 'argumentsAgainst']);

  return {
    ...data,
    proposalId,
    daoAddress,
    agentType: 'voting_recommender',
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  analyzeVote,
};
