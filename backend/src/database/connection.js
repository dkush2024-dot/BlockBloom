/**
 * MongoDB Connection Module
 *
 * HOW IT WORKS:
 *   1. Uses Mongoose to connect to MongoDB with production-safe options.
 *   2. Registers lifecycle event listeners (connected, error, disconnected).
 *   3. Handles graceful shutdown — when the process exits, the DB connection
 *      is closed cleanly so MongoDB doesn't see "zombie" connections.
 *
 * WHY SEPARATE FROM server.js:
 *   The server.js file orchestrates startup order. This module only knows
 *   "how" to connect — it doesn't know "when". Separation of concerns.
 */

const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../config/logger');

async function connectDatabase() {
  try {
    await mongoose.connect(config.mongoUri, {
      // These options are Mongoose 8 defaults but listed explicitly for clarity
      autoIndex: !config.isProduction, // Disable auto-indexing in production (run migrations)
    });

    logger.info(`✅ MongoDB connected: ${mongoose.connection.host}`);
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    process.exit(1); // Fail fast — the app is useless without a database
  }

  // Connection lifecycle events
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB runtime error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected. Attempting reconnect…');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected successfully.');
  });
}

/**
 * Graceful shutdown — call this when the process is terminating.
 */
async function disconnectDatabase() {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed gracefully.');
}

module.exports = { connectDatabase, disconnectDatabase };
