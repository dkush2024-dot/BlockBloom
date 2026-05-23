/**
 * Proposal Analysis Agent (Phase 7)
 *
 * WHAT IS AN AI AGENT?
 * --------------------
 * An agent is an AI that can:
 *   1. Receive a task
 *   2. Plan what tools it needs to call
 *   3. Execute tools to gather data
 *   4. Reason about the results
 *   5. Generate a final analysis
 *
 * This agent analyzes governance proposals by:
 *   1. Fetching proposal details from the database
 *   2. Getting voting statistics
 *   3. Checking treasury impact
 *   4. Generating a comprehensive analysis
 *
 * ARCHITECTURE (simplified LangGraph-style):
 *   Task → Plan → Execute Tools → Reason → Output
 *
 * Note: We implement a lightweight agent loop here instead of full
 * LangGraph to keep dependencies minimal. This can be upgraded to
 * LangGraph later for more complex multi-agent workflows.
 */

const { generateJSON } = require('../services/geminiService');
const { getProposalDetails, getVotingStats, getDAOInfo, getTreasuryBalance } = require('./tools/governanceTools');
const { BASE_SYSTEM_PROMPT } = require('../prompts/templates');
const logger = require('../../config/logger');

/**
 * Run the Proposal Analysis Agent.
 *
 * @param {Object} params
 * @param {string} params.proposalId - Proposal to analyze
 * @param {string} params.daoAddress - DAO address
 * @param {string} params.question - Specific question about the proposal (optional)
 * @returns {Promise<Object>} - Comprehensive analysis
 */
async function analyzeProposal({ proposalId, daoAddress, question }) {
  logger.info(`[ProposalAgent] Analyzing proposal ${proposalId} in DAO ${daoAddress}`);

  // Step 1: Gather all relevant data using tools
  const [proposalData, votingData, daoData] = await Promise.all([
    getProposalDetails({ proposalId, daoAddress }),
    getVotingStats({ proposalId, daoAddress }),
    getDAOInfo({ daoAddress }),
  ]);

  // Check if we got valid data
  if (proposalData.error) {
    return { error: `Could not fetch proposal: ${proposalData.error}` };
  }

  // Step 2: Get treasury data if DAO has a treasury
  let treasuryData = null;
  if (daoData.treasuryAddress) {
    treasuryData = await getTreasuryBalance({ treasuryAddress: daoData.treasuryAddress });
  }

  // Step 3: Build the analysis prompt with all gathered data
  const prompt = `${BASE_SYSTEM_PROMPT}

You are a Governance Analysis Agent. You have gathered the following data using your tools.
Analyze this proposal comprehensively.

PROPOSAL DATA:
${JSON.stringify(proposalData, null, 2)}

VOTING DATA:
${JSON.stringify(votingData, null, 2)}

DAO INFO:
${JSON.stringify(daoData, null, 2)}

TREASURY DATA:
${JSON.stringify(treasuryData, null, 2)}

${question ? `SPECIFIC QUESTION: ${question}` : 'Provide a full analysis.'}

OUTPUT FORMAT — Return valid JSON:
{
  "summary": "One-paragraph comprehensive summary",
  "status": "Current proposal status and likely outcome",
  "riskAssessment": {
    "level": "low | medium | high",
    "factors": ["Risk factor 1", "Risk factor 2"]
  },
  "votingAnalysis": {
    "currentOutcome": "passing | failing | too close to call",
    "turnout": "Analysis of voter turnout",
    "trend": "Voting trend analysis"
  },
  "treasuryImpact": "How this affects the treasury (if applicable)",
  "recommendation": "Neutral analysis with key considerations",
  "toolsUsed": ["List of tools used to gather this analysis"],
  "confidence": "high | medium | low"
}`;

  const { data } = await generateJSON(prompt, ['summary', 'riskAssessment']);

  return {
    ...data,
    proposalId,
    daoAddress,
    toolsUsed: ['getProposalDetails', 'getVotingStats', 'getDAOInfo', 'getTreasuryBalance'],
    generatedAt: new Date().toISOString(),
    agentType: 'proposal_analyzer',
  };
}

module.exports = {
  analyzeProposal,
};
