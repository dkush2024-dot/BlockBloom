/**
 * 404 Not Found Middleware
 *
 * Catches any request that didn't match a defined route and forwards
 * a clean 404 error to the centralized error handler.
 */

const { ApiError } = require('../../utils');

function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFoundHandler;
