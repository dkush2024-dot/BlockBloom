/**
 * BlockBloom Backend — Application Entry Point
 *
 * This file orchestrates the entire startup sequence:
 *   1. Load configuration (environment variables)
 *   2. Create the Express app with security & parsing middleware
 *   3. Connect to MongoDB
 *   4. Mount REST API routes
 *   5. Attach Socket.IO to the HTTP server
 *   6. Start the blockchain event indexer
 *   7. Begin listening for HTTP requests
 *   8. Handle graceful shutdown on SIGTERM/SIGINT
 *
 * ARCHITECTURE OVERVIEW:
 *   ┌─────────────┐     ┌─────────────┐     ┌──────────────┐
 *   │  Blockchain  │────▶│ Event       │────▶│  MongoDB     │
 *   │  (Sepolia)   │     │ Indexer     │     │  (Database)  │
 *   └─────────────┘     └──────┬──────┘     └──────────────┘
 *                              │                     ▲
 *                              ▼                     │
 *                       ┌──────────────┐      ┌──────┴──────┐
 *                       │  Socket.IO   │      │  REST API   │
 *                       │  (Realtime)  │      │  (Express)  │
 *                       └──────┬───────┘      └──────┬──────┘
 *                              │                     │
 *                              ▼                     ▼
 *                       ┌──────────────────────────────────┐
 *                       │         Frontend (React)         │
 *                       └──────────────────────────────────┘
 */

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Internal modules
const config = require('./config');
const logger = require('./config/logger');
const { connectDatabase, disconnectDatabase } = require('./database/connection');
const apiRoutes = require('./api/routes');
const errorHandler = require('./api/middleware/errorHandler');
const notFoundHandler = require('./api/middleware/notFoundHandler');
const { initializeWebSocket } = require('./websocket/socketManager');
const { startEventIndexer, stopEventIndexer } = require('./events/eventIndexer');

// ─── Create Express App ──────────────────────────────────────────────

const app = express();

// ─── Security Middleware ─────────────────────────────────────────────

// Helmet sets various HTTP headers to prevent common attacks (XSS, clickjacking, etc.)
app.use(helmet());

// CORS — allow the React frontend to make requests to this backend
app.use(cors({
  origin: config.corsOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Rate limiting — prevent abuse / DDoS
const limiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});
app.use('/api', limiter);

// ─── Parsing Middleware ──────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Logging Middleware ──────────────────────────────────────────────

// Morgan logs HTTP requests; we pipe its output through Winston
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
  skip: (req) => req.url === '/api/health', // Don't log health checks
}));

// ─── API Routes ──────────────────────────────────────────────────────

app.use('/api', apiRoutes);

// ─── Error Handling ──────────────────────────────────────────────────

// 404 handler — MUST be after all routes
app.use(notFoundHandler);

// Centralized error handler — MUST be the very last middleware
app.use(errorHandler);

// ─── Create HTTP Server ─────────────────────────────────────────────

const server = http.createServer(app);

// ─── Initialize Socket.IO ───────────────────────────────────────────

initializeWebSocket(server);

// ─── Start Server ────────────────────────────────────────────────────

async function startServer() {
  try {
    // Step 1: Connect to MongoDB
    await connectDatabase();

    // Step 2: Start the blockchain event indexer
    await startEventIndexer();

    // Step 3: Start listening for HTTP requests
    server.listen(config.port, () => {
      logger.info(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🌱 BlockBloom Backend v1.0.0                        ║
║                                                       ║
║   Environment : ${config.nodeEnv.padEnd(15)}                    ║
║   Port        : ${String(config.port).padEnd(15)}                    ║
║   MongoDB     : Connected ✅                          ║
║   Socket.IO   : Ready ✅                              ║
║   Indexer     : Running ✅                            ║
║                                                       ║
║   API Base    : http://localhost:${config.port}/api             ║
║   Health      : http://localhost:${config.port}/api/health      ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ─── Graceful Shutdown ───────────────────────────────────────────────

async function gracefulShutdown(signal) {
  logger.info(`\n${signal} received. Starting graceful shutdown…`);

  // Stop accepting new connections
  server.close(async () => {
    try {
      // Stop blockchain event listeners
      await stopEventIndexer();

      // Close database connection
      await disconnectDatabase();

      logger.info('✅ Graceful shutdown complete.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled errors that would crash the process
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason: reason?.message || reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// ─── Start ───────────────────────────────────────────────────────────

startServer();

module.exports = app; // Export for testing
