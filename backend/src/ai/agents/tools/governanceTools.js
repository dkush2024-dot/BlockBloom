/**
 * Governance Tools — Functions Agents Can Call (Phase 7)
 *
 * WHAT ARE TOOLS IN AI AGENTS?
 * ----------------------------
 * AI agents are like smart assistants that can USE tools to get things done.
 * Instead of just generating text, an agent can:
 *   1. Call a blockchain tool to fetch real data
 *   2. Call a database tool to look up proposals
 *   3. Call a treasury tool to check balances
 *   4. Use the results to give accurate answers
 *
 * These functions are the "tools" that agents have access to.
 * Each tool has:
 *   - name: What the agent calls it
 *   - description: So the agent knows WHEN to use it
 *   - func: The actual implementation
 */

const { Proposal, DAO, Vote } = require('../../../models');
const { getGovernanceContract, getTreasuryContract } = require('../../../blockchain/contracts');
const { getProvider } = require('../../../blockchain/provider');
const logger = require('../../../config/logger');

/**
 * Tool: Get proposal details from the database.
 */
async function getProposalDetails({ proposalId, daoAddress }) {
  try {
    const proposal = await Proposal.findOne({ proposalId, daoAddress });
    if (!proposal) return { error: `Proposal ${proposalId} not found` };

    return {
      proposalId: proposal.proposalId,
      title: proposal.title,
      description: proposal.description,
      proposer: proposal.proposer,
      status: proposal.status,
      votesFor: proposal.votesFor,
      votesAgainst: proposal.votesAgainst,
      createdAt: proposal.createdAt,
      deadline: proposal.deadline,
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Tool: List active proposals for a DAO.
 */
async function listActiveProposals({ daoAddress }) {
  try {
    const proposals = await Proposal.find({
      daoAddress,
      status: { $in: ['Active', 'Pending'] },
    }).sort({ createdAt: -1 }).limit(10);

    return proposals.map(p => ({
      proposalId: p.proposalId,
      title: p.title,
      status: p.status,
      votesFor: p.votesFor,
      votesAgainst: p.votesAgainst,
    }));
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Tool: Get treasury balance.
 */
async function getTreasuryBalance({ treasuryAddress }) {
  try {
    const provider = getProvider();
    if (!provider) return { error: 'Blockchain provider not available' };

    const { ethers } = require('ethers');
    const balance = await provider.getBalance(treasuryAddress);
    return {
      address: treasuryAddress,
      ethBalance: ethers.formatEther(balance),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Tool: Get voting statistics for a proposal.
 */
async function getVotingStats({ proposalId, daoAddress }) {
  try {
    const votes = await Vote.find({ proposalId, daoAddress });
    const votesFor = votes.filter(v => v.support === true);
    const votesAgainst = votes.filter(v => v.support === false);

    return {
      totalVotes: votes.length,
      votesFor: votesFor.length,
      votesAgainst: votesAgainst.length,
      uniqueVoters: new Set(votes.map(v => v.voter)).size,
      recentVotes: votes.slice(-5).map(v => ({
        voter: v.voter,
        support: v.support,
        timestamp: v.createdAt,
      })),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Tool: Get DAO information.
 */
async function getDAOInfo({ daoAddress }) {
  try {
    const dao = await DAO.findOne({ governanceAddress: daoAddress });
    if (!dao) return { error: 'DAO not found' };

    const proposalCount = await Proposal.countDocuments({ daoAddress });
    const activeCount = await Proposal.countDocuments({
      daoAddress,
      status: 'Active',
    });

    return {
      name: dao.name,
      governanceAddress: dao.governanceAddress,
      treasuryAddress: dao.treasuryAddress,
      tokenAddress: dao.tokenAddress,
      totalProposals: proposalCount,
      activeProposals: activeCount,
      createdAt: dao.createdAt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Tool definitions with metadata for agent tool selection
const TOOL_DEFINITIONS = [
  {
    name: 'getProposalDetails',
    description: 'Get detailed information about a specific governance proposal by its ID and DAO address',
    parameters: { proposalId: 'string', daoAddress: 'string' },
    func: getProposalDetails,
  },
  {
    name: 'listActiveProposals',
    description: 'List all active and pending proposals for a specific DAO',
    parameters: { daoAddress: 'string' },
    func: listActiveProposals,
  },
  {
    name: 'getTreasuryBalance',
    description: 'Get the ETH balance of a DAO treasury',
    parameters: { treasuryAddress: 'string' },
    func: getTreasuryBalance,
  },
  {
    name: 'getVotingStats',
    description: 'Get voting statistics for a specific proposal',
    parameters: { proposalId: 'string', daoAddress: 'string' },
    func: getVotingStats,
  },
  {
    name: 'getDAOInfo',
    description: 'Get general information about a DAO including proposal counts',
    parameters: { daoAddress: 'string' },
    func: getDAOInfo,
  },
];

module.exports = {
  getProposalDetails,
  listActiveProposals,
  getTreasuryBalance,
  getVotingStats,
  getDAOInfo,
  TOOL_DEFINITIONS,
};
