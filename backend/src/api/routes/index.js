/**
 * Route Index — Central Route Registration
 *
 * All route groups are imported here and mounted under /api.
 * This keeps server.js clean — it only calls app.use('/api', routes).
 */

const express = require('express');
const router = express.Router();

const orgRoutes = require('./orgRoutes');
const electionRoutes = require('./electionRoutes');
const verificationRoutes = require('./verificationRoutes');
const daoRoutes = require('./daoRoutes');
const proposalRoutes = require('./proposalRoutes');
const voteRoutes = require('./voteRoutes');
const authRoutes = require('./authRoutes');
const draftRoutes = require('./draftRoutes');
const aiRoutes = require('./aiRoutes');

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
router.use('/organizations', orgRoutes);
router.use('/elections', electionRoutes);
router.use('/verifications', verificationRoutes);
router.use('/daos', daoRoutes);
router.use('/proposals', proposalRoutes);
router.use('/votes', voteRoutes);
router.use('/auth', authRoutes);
router.use('/drafts', draftRoutes);
router.use('/ai', aiRoutes);

module.exports = router;
