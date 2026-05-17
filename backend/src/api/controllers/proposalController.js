/**
 * Proposal Controller
 *
 * Handles HTTP requests for governance proposals.
 */

const proposalService = require('../../services/proposalService');

const proposalController = {
  /**
   * GET /api/proposals
   * Query params: daoAddress, status, proposer, page, limit, sortBy, sortOrder
   */
  async getAll(req, res) {
    const { daoAddress, status, proposer, page, limit, sortBy, sortOrder } = req.query;

    const result = await proposalService.getAll({
      daoAddress,
      status,
      proposer,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      ...result,
    });
  },

  /**
   * GET /api/proposals/:daoAddress/:proposalId
   * Returns a single proposal.
   */
  async getById(req, res) {
    const { daoAddress, proposalId } = req.params;
    const proposal = await proposalService.getById(daoAddress, proposalId);

    res.json({
      success: true,
      data: proposal,
    });
  },

  /**
   * POST /api/proposals/close-expired
   * Batch-updates expired proposals to "closed" status.
   * In production, this would be triggered by a cron job.
   */
  async closeExpired(req, res) {
    const result = await proposalService.closeExpiredProposals();

    res.json({
      success: true,
      message: `Closed ${result.closedCount} expired proposal(s).`,
      data: result,
    });
  },
};

module.exports = proposalController;
