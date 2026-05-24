/**
 * Blockchain Context Builder — Connects On-Chain Data to AI
 *
 * WHY THIS EXISTS (Phase 4):
 * -------------------------
 * AI models can hallucinate — they might say "Proposal #5 has 200 votes"
 * when the real number is 50. To prevent this, we INJECT real blockchain
 * data into every AI prompt.
 *
 * This module fetches live data from:
 *   1. Smart contracts (via ethers.js) — proposal state, votes, treasury
 *   2. MongoDB (cached/indexed data) — faster than querying blockchain
 *
 * The data is formatted into a clean string that gets placed inside
 * the AI prompt, so the AI is "grounded" in reality.
 *
 * ARCHITECTURE:
 *   User asks question
 *       ↓
 *   contextBuilder.js (this file) — fetches real data
 *       ↓
 *   Enriched prompt with real data → Gemini API
 *       ↓
 *   Grounded, trustworthy response
 */

const { getGovernanceContract, getTreasuryContract } = require('../../blockchain/contracts');
const { getProvider } = require('../../blockchain/provider');
const { Proposal, DAO, Vote } = require('../../models');
const { formatProposalForPrompt, formatTreasuryForPrompt } = require('../prompts/governance');
const logger = require('../../config/logger');

/**
 * Fetch proposal context from both MongoDB (fast) and optionally blockchain (authoritative).
 *
 * @param {string} proposalId - The on-chain proposal ID
 * @param {string} daoAddress - The DAO's governance contract address
 * @param {boolean} includeOnChain - Also fetch live on-chain state (slower but authoritative)
 * @returns {Promise<Object>} - Complete proposal context
 */
async function getProposalContext(proposalId, daoAddress, includeOnChain = false) {
  const context = { source: 'database', proposal: null, votes: null, onChain: null };

  try {
    // 1. Fetch from MongoDB (fast — already indexed by event indexer)
    const dbProposal = await Proposal.findOne({ proposalId, daoAddress });
    if (dbProposal) {
      context.proposal = dbProposal.toObject();
    }

    // 2. Fetch vote statistics
    const votes = await Vote.find({ proposalId, daoAddress });
    if (votes.length > 0) {
      const votesFor = votes.filter(v => v.support === true).length;
      const votesAgainst = votes.filter(v => v.support === false).length;
      context.votes = {
        totalVotes: votes.length,
        votesFor,
        votesAgainst,
        uniqueVoters: new Set(votes.map(v => v.voter)).size,
      };
    }

    // 3. Optionally fetch live on-chain state (authoritative but slower)
    if (includeOnChain && daoAddress) {
      try {
        const governance = getGovernanceContract(daoAddress);
        if (governance) {
          const onChainProposal = await governance.proposals(proposalId);
          context.onChain = {
            votesFor: onChainProposal.forVotes?.toString() || '0',
            votesAgainst: onChainProposal.againstVotes?.toString() || '0',
            executed: onChainProposal.executed || false,
            canceled: onChainProposal.canceled || false,
          };
          context.source = 'blockchain';
        }
      } catch (err) {
        logger.warn(`[ContextBuilder] On-chain fetch failed for proposal ${proposalId}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('[ContextBuilder] Failed to get proposal context:', error.message);
  }

  return context;
}

/**
 * Fetch treasury context for a DAO.
 *
 * @param {string} treasuryAddress - The Treasury contract address
 * @returns {Promise<Object>} - Treasury balance and recent activity
 */
async function getTreasuryContext(treasuryAddress) {
  const context = { address: treasuryAddress, ethBalance: null, tokenBalance: null };

  try {
    const provider = getProvider();
    if (!provider || !treasuryAddress) return context;

    // Fetch ETH balance
    const balanceWei = await provider.getBalance(treasuryAddress);
    const { ethers } = require('ethers');
    context.ethBalance = ethers.formatEther(balanceWei);

    // Fetch from Treasury contract if available
    const treasury = getTreasuryContract(treasuryAddress);
    if (treasury) {
      try {
        const tokenBalance = await treasury.getBalance();
        context.tokenBalance = ethers.formatUnits(tokenBalance, 18);
      } catch {
        // Treasury might not have getBalance — that's ok
      }
    }
  } catch (error) {
    logger.warn('[ContextBuilder] Treasury context fetch failed:', error.message);
  }

  return context;
}

/**
 * Fetch full DAO context — combines DAO info, active proposals, and treasury.
 *
 * @param {string} daoAddress - The DAO governance address
 * @returns {Promise<Object>} - Complete DAO context for AI
 */
async function getDAOContext(daoAddress) {
  const context = { dao: null, activeProposals: [], treasury: null };

  try {
    // DAO info from MongoDB
    const dao = await DAO.findOne({ governanceAddress: daoAddress });
    if (dao) {
      context.dao = {
        name: dao.name,
        governanceAddress: dao.governanceAddress,
        treasuryAddress: dao.treasuryAddress,
        tokenAddress: dao.tokenAddress,
        createdAt: dao.createdAt,
      };

      // Active proposals
      const proposals = await Proposal.find({
        daoAddress,
        status: { $in: ['Active', 'Pending'] },
      }).sort({ createdAt: -1 }).limit(10);

      context.activeProposals = proposals.map(p => ({
        proposalId: p.proposalId,
        title: p.title,
        status: p.status,
        votesFor: p.votesFor,
        votesAgainst: p.votesAgainst,
      }));

      // Treasury
      if (dao.treasuryAddress) {
        context.treasury = await getTreasuryContext(dao.treasuryAddress);
      }
    }
  } catch (error) {
    logger.error('[ContextBuilder] DAO context fetch failed:', error.message);
  }

  return context;
}

/**
 * Build a complete context string for AI prompts.
 * Combines all available data into a formatted string.
 *
 * @param {Object} options
 * @param {string} options.daoAddress - DAO address
 * @param {string} options.proposalId - Specific proposal ID
 * @param {boolean} options.includeTreasury - Include treasury data
 * @returns {Promise<string>} - Formatted context string for prompt injection
 */
async function buildFullContext({ daoAddress, proposalId, includeTreasury = true }) {
  const parts = [];

  // DAO overview
  if (daoAddress) {
    const daoCtx = await getDAOContext(daoAddress);
    if (daoCtx.dao) {
      parts.push(`--- DAO: ${daoCtx.dao.name} ---`);
      parts.push(`Address: ${daoCtx.dao.governanceAddress}`);
      parts.push(`Active Proposals: ${daoCtx.activeProposals.length}`);
    }
    if (includeTreasury && daoCtx.treasury) {
      parts.push(formatTreasuryForPrompt(daoCtx.treasury));
    }
  }

  // Specific proposal
  if (proposalId && daoAddress) {
    const proposalCtx = await getProposalContext(proposalId, daoAddress);
    if (proposalCtx.proposal) {
      parts.push(formatProposalForPrompt(proposalCtx.proposal));
    }
  }

  return parts.length > 0
    ? parts.join('\n\n')
    : 'No governance context available.';
}

module.exports = {
  getProposalContext,
  getTreasuryContext,
  getDAOContext,
  buildFullContext,
};
