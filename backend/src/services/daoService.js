/**
 * DAO Service Layer
 *
 * WHY A SERVICE LAYER:
 *   Controllers handle HTTP concerns (request parsing, response formatting).
 *   Services handle business logic and database queries.
 *   This separation means:
 *     - The same business logic can be reused by REST API, WebSocket handlers,
 *       CLI scripts, or background jobs.
 *     - Controllers stay thin and testable.
 *     - Database queries are centralized — no raw Mongoose calls in controllers.
 */

const { DAO } = require('../models');
const { ApiError } = require('../utils');

class DAOService {
  /**
   * Get all DAOs with pagination and optional filtering.
   *
   * @param {Object} options
   * @param {number} options.page - Page number (1-indexed)
   * @param {number} options.limit - Items per page
   * @param {string} [options.creator] - Filter by creator address
   * @param {string} [options.sortBy] - Sort field (default: createdAt)
   * @param {string} [options.sortOrder] - 'asc' or 'desc' (default: desc)
   */
  async getAll({ page = 1, limit = 10, creator, sortBy = 'createdAt', sortOrder = 'desc' } = {}) {
    const filter = {};
    if (creator) filter.creator = creator.toLowerCase();

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [daos, total] = await Promise.all([
      DAO.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      DAO.countDocuments(filter),
    ]);

    return {
      data: daos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Get a single DAO by its contract address.
   */
  async getByAddress(contractAddress) {
    const dao = await DAO.findOne({
      contractAddress: contractAddress.toLowerCase(),
    }).lean();

    if (!dao) {
      throw ApiError.notFound(`DAO not found at address: ${contractAddress}`);
    }

    return dao;
  }

  /**
   * Get aggregate statistics across all DAOs.
   */
  async getStats() {
    const [totalDAOs, totalProposals, totalVotes] = await Promise.all([
      DAO.countDocuments(),
      DAO.aggregate([{ $group: { _id: null, total: { $sum: '$proposalCount' } } }]),
      DAO.aggregate([{ $group: { _id: null, total: { $sum: '$totalVotes' } } }]),
    ]);

    return {
      totalDAOs,
      totalProposals: totalProposals[0]?.total || 0,
      totalVotes: totalVotes[0]?.total || 0,
    };
  }
}

module.exports = new DAOService();
