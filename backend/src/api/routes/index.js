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
const adminRoutes = require('./adminRoutes');

const mongoose = require('mongoose');
const redis = require('../../config/redis');
const rabbitmq = require('../../config/rabbitmq');

// Health check endpoint — useful for load balancers and monitoring
router.get('/health', async (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'up' : 'down';
  const redisStatus = redis.isOpen ? 'up' : 'down';
  
  let rabbitmqStatus = 'down';
  try {
    const channel = rabbitmq.getChannel();
    if (channel) rabbitmqStatus = 'up';
  } catch(e) {
    // Channel not ready
  }

  const isHealthy = mongoStatus === 'up' && redisStatus === 'up' && rabbitmqStatus === 'up';

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    message: isHealthy ? 'All systems operational' : 'Degraded state',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      mongodb: mongoStatus,
      redis: redisStatus,
      rabbitmq: rabbitmqStatus,
    }
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
router.use('/admin', adminRoutes);

module.exports = router;
