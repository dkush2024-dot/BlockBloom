/**
 * Vote Service Layer
 *
 * Handles all business logic for vote queries:
 *   - Listing votes (by proposal, by voter)
 *   - Voter participation analytics
 */

const { Vote } = require('../models');
const { ApiError } = require('../utils');

class VoteService {
  /**
   * Get votes with pagination and filtering.
   *
   * @param {Object} options
   * @param {string} [options.daoAddress] - Filter by DAO
   * @param {string} [options.proposalId] - Filter by proposal
   * @param {string} [options.voter] - Filter by voter address
   * @param {number} [options.page]
   * @param {number} [options.limit]
   */
  async getAll({
    daoAddress,
    proposalId,
    voter,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = {}) {
    const filter = {};
    if (daoAddress) filter.daoAddress = daoAddress.toLowerCase();
    if (proposalId) filter.proposalId = proposalId.toString();
    if (voter) filter.voter = voter.toLowerCase();

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [votes, total] = await Promise.all([
      Vote.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Vote.countDocuments(filter),
    ]);

    return {
      data: votes,
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
   * Get the top voters leaderboard across all DAOs.
   * Returns an array of { voter, totalVotes, totalWeight }.
   */
  async getLeaderboard(limit = 10) {
    const redis = require('../config/redis');
    const cached = await redis.get('leaderboard');
    if (cached) return JSON.parse(cached);

    const leaderboard = await Vote.aggregate([
      {
        $group: {
          _id: '$voter',
          totalVotes: { $sum: 1 },
          daosParticipated: { $addToSet: '$daoAddress' },
        },
      },
      {
        $project: {
          _id: 0,
          voter: '$_id',
          totalVotes: 1,
          daosParticipated: { $size: '$daosParticipated' },
        },
      },
      { $sort: { totalVotes: -1 } },
      { $limit: limit },
    ]);

    await redis.setEx('leaderboard', 300, JSON.stringify(leaderboard)); // cache 5 min

    return leaderboard;
  }

  /**
   * Get voting history for a specific wallet address.
   */
  async getVoterHistory(voterAddress, { page = 1, limit = 20 } = {}) {
    const filter = { voter: voterAddress.toLowerCase() };
    const skip = (page - 1) * limit;

    const [votes, total] = await Promise.all([
      Vote.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Vote.countDocuments(filter),
    ]);

    return {
      data: votes,
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
}

module.exports = new VoteService();
