/**
 * Draft Proposal Controller
 *
 * Handles HTTP requests for off-chain proposal drafts.
 * All routes are protected by SIWE JWT authentication —
 * the authenticated wallet address is available as req.user.address.
 */

const draftProposalService = require('../../services/draftProposalService');

const draftProposalController = {
  /**
   * POST /api/drafts
   * Body: { daoAddress, description, options, isFinancial, target, value }
   */
  async create(req, res) {
    const { daoAddress, description, options, isFinancial, target, value } = req.body;

    const draft = await draftProposalService.create({
      daoAddress,
      proposer: req.user.address,
      description,
      options,
      isFinancial,
      target,
      value,
    });

    res.status(201).json({
      success: true,
      data: draft,
    });
  },

  /**
   * GET /api/drafts/:daoAddress
   * Returns all drafts for the authenticated user in a specific DAO.
   */
  async getByProposer(req, res) {
    const { daoAddress } = req.params;
    const drafts = await draftProposalService.getByProposer(daoAddress, req.user.address);

    res.json({
      success: true,
      data: drafts,
    });
  },

  /**
   * GET /api/drafts/detail/:draftId
   * Returns a single draft by ID (ownership verified).
   */
  async getById(req, res) {
    const { draftId } = req.params;
    const draft = await draftProposalService.getById(draftId, req.user.address);

    res.json({
      success: true,
      data: draft,
    });
  },

  /**
   * PUT /api/drafts/:draftId
   * Body: { description, options, isFinancial, target, value }
   */
  async update(req, res) {
    const { draftId } = req.params;
    const draft = await draftProposalService.update(draftId, req.user.address, req.body);

    res.json({
      success: true,
      data: draft,
    });
  },

  /**
   * DELETE /api/drafts/:draftId
   */
  async delete(req, res) {
    const { draftId } = req.params;
    await draftProposalService.delete(draftId, req.user.address);

    res.json({
      success: true,
      message: 'Draft deleted successfully.',
    });
  },
};

module.exports = draftProposalController;
