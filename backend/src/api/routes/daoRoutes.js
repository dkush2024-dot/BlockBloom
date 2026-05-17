/**
 * DAO Routes
 *
 * Defines the REST endpoints for DAO data.
 * Each route is wrapped in asyncHandler to catch async errors.
 *
 * ROUTE DESIGN PRINCIPLES:
 *   - Use plural nouns (/daos, not /dao)
 *   - Use GET for reads, POST for actions
 *   - Keep URLs flat — avoid deeply nested resources
 *   - Apply validation middleware before the controller
 */

const express = require('express');
const router = express.Router();
const daoController = require('../controllers/daoController');
const { asyncHandler } = require('../../utils');
const { validatePagination, validateEthAddress } = require('../middleware/validate');

// GET /api/daos — List all DAOs (with pagination)
router.get('/', validatePagination, asyncHandler(daoController.getAll));

// GET /api/daos/stats — Aggregate statistics
router.get('/stats', asyncHandler(daoController.getStats));

// GET /api/daos/:address — Single DAO by contract address
router.get('/:address', validateEthAddress('address'), asyncHandler(daoController.getByAddress));

module.exports = router;
