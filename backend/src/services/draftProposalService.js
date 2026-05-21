/**
 * Draft Proposal Service Layer
 *
 * Handles CRUD operations for off-chain proposal drafts.
 * Drafts let users save proposal ideas before submitting them on-chain.
 * All endpoints are protected by SIWE authentication.
 */

const { DraftProposal } = require('../models');
const { ApiError } = require('../utils');

class DraftProposalService {
  /**
   * Create a new draft proposal.
   */
  async create({ daoAddress, proposer, description, options, isFinancial, target, value }) {
    const draft = await DraftProposal.create({
      daoAddress: daoAddress.toLowerCase(),
      proposer: proposer.toLowerCase(),
      description,
      options: options || ['Option 1', 'Option 2'],
      isFinancial: isFinancial || false,
      target: target || '',
      value: value || '0',
    });

    return draft;
  }

  /**
   * Get all drafts for a specific proposer in a specific DAO.
   */
  async getByProposer(daoAddress, proposer) {
    const drafts = await DraftProposal.find({
      daoAddress: daoAddress.toLowerCase(),
      proposer: proposer.toLowerCase(),
    })
      .sort({ updatedAt: -1 })
      .lean();

    return drafts;
  }

  /**
   * Get a single draft by its ID. Verifies ownership.
   */
  async getById(draftId, proposer) {
    const draft = await DraftProposal.findById(draftId).lean();

    if (!draft) {
      throw ApiError.notFound(`Draft not found: ${draftId}`);
    }

    if (draft.proposer !== proposer.toLowerCase()) {
      throw ApiError.forbidden('You can only view your own drafts');
    }

    return draft;
  }

  /**
   * Update an existing draft. Verifies ownership.
   */
  async update(draftId, proposer, updates) {
    const draft = await DraftProposal.findById(draftId);

    if (!draft) {
      throw ApiError.notFound(`Draft not found: ${draftId}`);
    }

    if (draft.proposer !== proposer.toLowerCase()) {
      throw ApiError.forbidden('You can only edit your own drafts');
    }

    // Only allow safe fields to be updated
    const allowedFields = ['description', 'options', 'isFinancial', 'target', 'value'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        draft[field] = updates[field];
      }
    }

    await draft.save();
    return draft;
  }

  /**
   * Delete a draft. Verifies ownership.
   */
  async delete(draftId, proposer) {
    const draft = await DraftProposal.findById(draftId);

    if (!draft) {
      throw ApiError.notFound(`Draft not found: ${draftId}`);
    }

    if (draft.proposer !== proposer.toLowerCase()) {
      throw ApiError.forbidden('You can only delete your own drafts');
    }

    await DraftProposal.findByIdAndDelete(draftId);
    return { deleted: true };
  }
}

module.exports = new DraftProposalService();
