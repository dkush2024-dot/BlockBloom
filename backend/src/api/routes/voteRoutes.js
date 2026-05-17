/**
 * Vote Routes
 *
 * REST endpoints for vote data.
 */

const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const { asyncHandler } = require('../../utils');
const { validatePagination, validateEthAddress } = require('../middleware/validate');

// GET /api/votes — List votes (filterable by daoAddress, proposalId, voter)
router.get('/', validatePagination, asyncHandler(voteController.getAll));

// GET /api/votes/leaderboard — Top voters
router.get('/leaderboard', asyncHandler(voteController.getLeaderboard));

// GET /api/votes/voter/:address — Voting history for a wallet
router.get(
  '/voter/:address',
  validateEthAddress('address'),
  validatePagination,
  asyncHandler(voteController.getVoterHistory)
);

module.exports = router;
