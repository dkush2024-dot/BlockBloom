/**
 * Governance-Specific Prompt Builders
 *
 * WHY THIS FILE EXISTS:
 * --------------------
 * While templates.js holds the raw prompt templates, this file contains
 * helper functions that BUILD complete prompts by combining templates
 * with real governance data.
 *
 * Think of templates.js as the "blueprint" and this file as the "builder"
 * that fills in the blueprint with actual materials (data).
 *
 * ARCHITECTURE:
 *   Raw Data (proposals, votes, treasury)
 *       ↓
 *   governance.js (this file) — formats data + fills templates
 *       ↓
 *   Complete prompt ready for Gemini API
 */

const {
  PROPOSAL_EXPLAINER_PROMPT,
  VOTING_RECOMMENDATION_PROMPT,
  PROPOSAL_SUMMARY_PROMPT,
  fillTemplate,
} = require('./templates');

/**
 * Formats raw proposal data into a clean, readable string for the AI.
 *
 * WHY FORMAT IT?
 * Raw MongoDB documents contain fields the AI doesn't need (_id, __v, etc.)
 * and the data isn't labeled clearly. Formatting it helps the AI understand
 * the data much better — this is called "context engineering".
 *
 * @param {Object} proposal - Raw proposal object from database
 * @returns {string} - Formatted proposal string for prompt injection
 */
function formatProposalForPrompt(proposal) {
  const title = proposal.title || (proposal.description ? (proposal.description.length > 60 ? proposal.description.substring(0, 60) + '...' : proposal.description) : 'Untitled');
  return `
--- PROPOSAL DETAILS ---
Proposal ID: ${proposal.proposalId || proposal._id || 'Unknown'}
Title: ${title}
Description: ${proposal.description || 'No description provided'}
Proposer: ${proposal.proposer || 'Unknown'}
DAO Address: ${proposal.daoAddress || 'Unknown'}
Status: ${proposal.status || 'Unknown'}
Created At: ${proposal.createdAt ? new Date(proposal.createdAt).toLocaleString() : 'Unknown'}
Deadline: ${proposal.deadline ? new Date(proposal.deadline * 1000).toLocaleString() : 'Unknown'}
Votes For: ${proposal.votesFor ?? 'N/A'}
Votes Against: ${proposal.votesAgainst ?? 'N/A'}
Quorum Required: ${proposal.quorumRequired ?? 'N/A'}
Execution Data: ${proposal.executionData || 'None'}
--- END PROPOSAL ---`.trim();
}

/**
 * Formats voting data for a proposal.
 *
 * @param {Object} votingData - Aggregated voting information
 * @returns {string} - Formatted voting data for prompt injection
 */
function formatVotingDataForPrompt(votingData) {
  if (!votingData) return 'No voting data available.';

  return `
--- VOTING DATA ---
Total Votes Cast: ${votingData.totalVotes ?? 0}
Votes For: ${votingData.votesFor ?? 0}
Votes Against: ${votingData.votesAgainst ?? 0}
Unique Voters: ${votingData.uniqueVoters ?? 0}
Quorum Reached: ${votingData.quorumReached ? 'Yes' : 'No'}
Voting Deadline: ${votingData.deadline ? new Date(votingData.deadline * 1000).toLocaleString() : 'Unknown'}
--- END VOTING DATA ---`.trim();
}

/**
 * Formats treasury data for prompt injection.
 *
 * @param {Object} treasuryData - Treasury information
 * @returns {string} - Formatted treasury string
 */
function formatTreasuryForPrompt(treasuryData) {
  if (!treasuryData) return 'No treasury data available.';

  return `
--- TREASURY DATA ---
Treasury Address: ${treasuryData.address || 'Unknown'}
ETH Balance: ${treasuryData.ethBalance ?? 'Unknown'} ETH
Token Balance: ${treasuryData.tokenBalance ?? 'Unknown'} BLOOM
Total Value (estimated): ${treasuryData.totalValue ?? 'Unknown'}
Recent Transactions: ${treasuryData.recentTransactions?.length ?? 0}
--- END TREASURY DATA ---`.trim();
}

/**
 * Builds a complete "explain this proposal" prompt.
 *
 * @param {Object} proposal - Proposal data from database
 * @returns {string} - Complete prompt ready for Gemini
 */
function buildExplainPrompt(proposal) {
  const formattedProposal = formatProposalForPrompt(proposal);
  return fillTemplate(PROPOSAL_EXPLAINER_PROMPT, {
    PROPOSAL_DATA: formattedProposal,
  });
}

/**
 * Builds a complete "voting recommendation" prompt.
 *
 * @param {Object} proposal - Proposal data
 * @param {Object} votingData - Voting statistics
 * @param {Object} treasuryData - Treasury information
 * @returns {string} - Complete prompt ready for Gemini
 */
function buildVotingRecommendationPrompt(proposal, votingData, treasuryData) {
  return fillTemplate(VOTING_RECOMMENDATION_PROMPT, {
    PROPOSAL_DATA: formatProposalForPrompt(proposal),
    VOTING_DATA: formatVotingDataForPrompt(votingData),
    TREASURY_DATA: formatTreasuryForPrompt(treasuryData),
  });
}

/**
 * Builds a complete "summarize proposal" prompt.
 *
 * @param {Object} proposal - Proposal data
 * @returns {string} - Complete prompt ready for Gemini
 */
function buildSummaryPrompt(proposal) {
  return fillTemplate(PROPOSAL_SUMMARY_PROMPT, {
    PROPOSAL_DATA: formatProposalForPrompt(proposal),
  });
}

module.exports = {
  formatProposalForPrompt,
  formatVotingDataForPrompt,
  formatTreasuryForPrompt,
  buildExplainPrompt,
  buildVotingRecommendationPrompt,
  buildSummaryPrompt,
};
