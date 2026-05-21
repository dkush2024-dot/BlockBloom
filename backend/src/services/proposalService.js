/**
 * Proposal Service Layer
 *
 * Handles all business logic for governance proposals:
 *   - Listing proposals (with filters, pagination)
 *   - Fetching a single proposal
 *   - Updating proposal status (active → closed)
 */

const { Proposal } = require('../models');
const { ApiError } = require('../utils');

class ProposalService {
  /**
   * Get all proposals with pagination and filtering.
   *
   * @param {Object} options
   * @param {string} [options.daoAddress] - Filter by DAO
   * @param {string} [options.status] - Filter by status (active/closed/executed)
   * @param {string} [options.proposer] - Filter by proposer address
   * @param {number} [options.page]
   * @param {number} [options.limit]
   */
  async getAll({
    daoAddress,
    status,
    proposer,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = {}) {
    const filter = {};
    if (daoAddress) filter.daoAddress = daoAddress.toLowerCase();
    if (status) filter.status = status;
    if (proposer) filter.proposer = proposer.toLowerCase();

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [proposals, total] = await Promise.all([
      Proposal.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Proposal.countDocuments(filter),
    ]);

    return {
      data: proposals,
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
   * Get a single proposal by DAO address + proposal ID.
   */
  async getById(daoAddress, proposalId) {
    const proposal = await Proposal.findOne({
      daoAddress: daoAddress.toLowerCase(),
      proposalId: proposalId.toString(),
    }).lean();

    if (!proposal) {
      throw ApiError.notFound(
        `Proposal #${proposalId} not found in DAO ${daoAddress}`
      );
    }

    return proposal;
  }

  /**
   * Update expired proposals from "active" to "closed".
   * This can be called by a cron job or on-demand.
   */
  async closeExpiredProposals() {
    const expiredProposals = await Proposal.find({
      status: 'active',
      endTime: { $lte: new Date() },
    });

    if (expiredProposals.length === 0) {
      return { closedCount: 0 };
    }

    const ids = expiredProposals.map(p => p._id);

    const result = await Proposal.updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'closed' } }
    );

    const { getIO } = require('../websocket/socketManager');
    const io = getIO();

    for (const p of expiredProposals) {
      io.emit('proposal:closed', {
        proposalId: p.proposalId,
        daoAddress: p.daoAddress
      });
    }

    return { closedCount: result.modifiedCount };
  }
}

module.exports = new ProposalService();
