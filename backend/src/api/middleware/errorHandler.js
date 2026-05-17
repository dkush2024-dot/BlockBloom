/**
 * Centralized Error Handling Middleware
 *
 * This is the LAST middleware registered in Express. When any route or
 * middleware calls next(error) or throws, Express skips to this handler.
 *
 * STRATEGY:
 *   1. If the error is an operational ApiError → send its message + status.
 *   2. If it's a Mongoose validation error → translate to 400 with details.
 *   3. Everything else → log the full stack and send a generic 500.
 *      (Never leak internal details to the client in production.)
 */

const logger = require('../../config/logger');
const config = require('../../config');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Default to 500
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = null;

  // --- Mongoose Validation Error ---
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // --- Mongoose Duplicate Key ---
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {}).join(', ');
    message = `Duplicate value for: ${field}`;
  }

  // --- Mongoose Cast Error (invalid ObjectId, etc.) ---
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}: ${err.value}`;
  }

  // Log the error (full stack for 500s, just message for expected errors)
  if (statusCode >= 500) {
    logger.error(`[${statusCode}] ${req.method} ${req.originalUrl}`, {
      error: err.message,
      stack: err.stack,
    });
  } else {
    logger.warn(`[${statusCode}] ${req.method} ${req.originalUrl}: ${message}`);
  }

  // Send response
  const response = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(config.isProduction ? {} : { stack: err.stack }),
  };

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
