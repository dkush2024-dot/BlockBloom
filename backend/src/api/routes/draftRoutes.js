/**
 * Draft Proposal Routes
 *
 * All routes here are protected by SIWE JWT authentication.
 * Users must sign in with their Ethereum wallet before accessing drafts.
 */

const express = require('express');
const router = express.Router();
const draftProposalController = require('../controllers/draftProposalController');
const { asyncHandler } = require('../../utils');
const { requireAuth } = require('../middleware/authMiddleware');

// All draft routes require authentication
router.use(requireAuth);

// POST /api/drafts — Create a new draft
router.post('/', asyncHandler(draftProposalController.create));

// GET /api/drafts/:daoAddress — Get all drafts for authenticated user in a DAO
router.get('/:daoAddress', asyncHandler(draftProposalController.getByProposer));

// GET /api/drafts/detail/:draftId — Get a single draft by ID
router.get('/detail/:draftId', asyncHandler(draftProposalController.getById));

// PUT /api/drafts/:draftId — Update a draft
router.put('/:draftId', asyncHandler(draftProposalController.update));

// DELETE /api/drafts/:draftId — Delete a draft
router.delete('/:draftId', asyncHandler(draftProposalController.delete));

module.exports = router;
