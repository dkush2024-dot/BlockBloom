/**
 * DAO Controller
 *
 * ROLE OF A CONTROLLER:
 *   - Parse and validate the HTTP request (query params, path params)
 *   - Call the appropriate service method
 *   - Format and send the HTTP response
 *   - Controllers should NOT contain business logic or database queries
 *
 * Every controller method is wrapped by asyncHandler (via the route file)
 * so thrown errors are automatically passed to the centralized error middleware.
 */

const daoService = require('../../services/daoService');

const daoController = {
  /**
   * GET /api/daos
   * Query params: page, limit, creator, sortBy, sortOrder
   */
  async getAll(req, res) {
    const { page, limit, creator, sortBy, sortOrder } = req.query;

    const result = await daoService.getAll({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
      creator,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      ...result,
    });
  },

  /**
   * GET /api/daos/stats
   * Returns aggregate statistics for all DAOs.
   */
  async getStats(req, res) {
    const stats = await daoService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  },

  /**
   * GET /api/daos/:address
   * Returns a single DAO by contract address.
   */
  async getByAddress(req, res) {
    const dao = await daoService.getByAddress(req.params.address);

    res.json({
      success: true,
      data: dao,
    });
  },
};

module.exports = daoController;
