/**
 * Proposal Routes
 *
 * REST endpoints for governance proposals.
 */

const express = require('express');
const router = express.Router();
const proposalController = require('../controllers/proposalController');
const { asyncHandler } = require('../../utils');
const { validatePagination } = require('../middleware/validate');

// GET /api/proposals — List proposals (filterable by daoAddress, status, proposer)
router.get('/', validatePagination, asyncHandler(proposalController.getAll));

// POST /api/proposals/close-expired — Batch close expired proposals
router.post('/close-expired', asyncHandler(proposalController.closeExpired));

// GET /api/proposals/:daoAddress/:proposalId — Single proposal
router.get('/:daoAddress/:proposalId', asyncHandler(proposalController.getById));

module.exports = router;
