/**
 * WebSocket (Socket.IO) Manager
 *
 * Manages the Socket.IO server instance and provides a clean API for
 * emitting realtime events to connected frontend clients.
 *
 * ARCHITECTURE:
 *   The Socket.IO server is attached to the same HTTP server as Express.
 *   This means both REST and WebSocket traffic share port 5000 — simpler
 *   deployment and no extra CORS/firewall configuration.
 *
 * EVENT NAMESPACES:
 *   We use a single namespace ("/") with "rooms" per DAO address.
 *   Clients can join a room to receive updates only for the DAO they're viewing.
 *
 * HOW THE FRONTEND USES THIS:
 *   1. Connect: const socket = io('http://localhost:5000');
 *   2. Join a DAO room: socket.emit('join:dao', '0xAbC...');
 *   3. Listen for updates: socket.on('proposal:created', (data) => { ... });
 */

const { Server } = require('socket.io');
const config = require('../config');
const logger = require('../config/logger');

let io = null;

/**
 * Initializes Socket.IO on the given HTTP server.
 * @param {http.Server} httpServer
 * @returns {Server} Socket.IO server instance
 */
function initializeWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
    },
    // Reduce ping interval in development for faster reconnection detection
    pingInterval: config.isProduction ? 25000 : 10000,
    pingTimeout: config.isProduction ? 20000 : 5000,
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);

    // Client wants to receive realtime updates for a specific DAO
    socket.on('join:dao', (daoAddress) => {
      if (typeof daoAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(daoAddress)) {
        socket.join(`dao:${daoAddress.toLowerCase()}`);
        logger.debug(`Socket ${socket.id} joined room dao:${daoAddress.toLowerCase()}`);
      }
    });

    // Client leaves a DAO room
    socket.on('leave:dao', (daoAddress) => {
      if (typeof daoAddress === 'string') {
        socket.leave(`dao:${daoAddress.toLowerCase()}`);
        logger.debug(`Socket ${socket.id} left room dao:${daoAddress.toLowerCase()}`);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Client disconnected: ${socket.id} (${reason})`);
    });
  });

  logger.info('🌐 Socket.IO server initialized');
  return io;
}

/**
 * Returns the Socket.IO server instance.
 * Call this from event handlers to emit updates.
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeWebSocket first.');
  }
  return io;
}

// --- Convenience Emitters ---

/**
 * Broadcast to ALL connected clients (global feed).
 */
function emitGlobal(event, data) {
  if (io) io.emit(event, data);
}

/**
 * Broadcast to clients watching a specific DAO.
 */
function emitToDAO(daoAddress, event, data) {
  if (io) io.to(`dao:${daoAddress.toLowerCase()}`).emit(event, data);
}

module.exports = {
  initializeWebSocket,
  getIO,
  emitGlobal,
  emitToDAO,
};
