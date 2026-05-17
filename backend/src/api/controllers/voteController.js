/**
 * Vote Controller
 *
 * Handles HTTP requests for vote data.
 */

const voteService = require('../../services/voteService');

const voteController = {
  /**
   * GET /api/votes
   * Query params: daoAddress, proposalId, voter, page, limit
   */
  async getAll(req, res) {
    const { daoAddress, proposalId, voter, page, limit, sortBy, sortOrder } = req.query;

    const result = await voteService.getAll({
      daoAddress,
      proposalId,
      voter,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      ...result,
    });
  },

  /**
   * GET /api/votes/leaderboard
   * Returns the top voters across all DAOs.
   */
  async getLeaderboard(req, res) {
    const limit = parseInt(req.query.limit, 10) || 10;
    const leaderboard = await voteService.getLeaderboard(limit);

    res.json({
      success: true,
      data: leaderboard,
    });
  },

  /**
   * GET /api/votes/voter/:address
   * Returns the full voting history for a wallet address.
   */
  async getVoterHistory(req, res) {
    const { page, limit } = req.query;
    const history = await voteService.getVoterHistory(req.params.address, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    });

    res.json({
      success: true,
      ...history,
    });
  },
};

module.exports = voteController;
