const { ApiError } = require('../../utils');

/**
 * Middleware to enforce Role-Based Access Control (RBAC).
 * Expects requireAuth to have been called first so req.user exists.
 * 
 * @param {...string} allowedRoles - List of roles permitted to access the route
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires one of the following roles: ${allowedRoles.join(', ')}`));
    }

    next();
  };
};

module.exports = { requireRole };
