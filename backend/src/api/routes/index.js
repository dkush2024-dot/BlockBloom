/**
 * Route Index — Central Route Registration
 *
 * All route groups are imported here and mounted under /api.
 * This keeps server.js clean — it only calls app.use('/api', routes).
 */

const express = require('express');
const router = express.Router();

const daoRoutes = require('./daoRoutes');
const proposalRoutes = require('./proposalRoutes');
const voteRoutes = require('./voteRoutes');
const authRoutes = require('./authRoutes');

// Health check endpoint — useful for load balancers and monitoring
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'BlockBloom Backend is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount resource routes
router.use('/daos', daoRoutes);
router.use('/proposals', proposalRoutes);
router.use('/votes', voteRoutes);
router.use('/auth', authRoutes);

module.exports = router;
