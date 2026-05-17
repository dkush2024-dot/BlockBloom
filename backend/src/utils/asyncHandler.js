/**
 * Async Handler Wrapper
 *
 * Express does not natively catch errors thrown inside async route handlers.
 * Without this wrapper, an unhandled promise rejection in a controller would
 * crash the process or cause a hanging response.
 *
 * USAGE:
 *   router.get('/daos', asyncHandler(daoController.getAll));
 *
 * HOW IT WORKS:
 *   Wraps the async function and attaches a .catch(next) so Express's
 *   error middleware receives any thrown error automatically.
 */

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
