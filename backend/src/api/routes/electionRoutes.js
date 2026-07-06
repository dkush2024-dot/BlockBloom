const express = require('express');
const router = express.Router();
const electionController = require('../controllers/electionController');

// GET /api/elections - Get all elections (optionally filter by orgId)
router.get('/', electionController.getElections);

// POST /api/elections/fix-orphaned - Fix elections with stale orgIds (admin utility)
router.post('/fix-orphaned', electionController.fixOrphanedElections);

// GET /api/elections/:address - Get single election
router.get('/:address', electionController.getElectionByAddress);

// GET /api/elections/:address/proposals - Get all proposals for an election
router.get('/:address/proposals', electionController.getElectionProposals);

module.exports = router;
