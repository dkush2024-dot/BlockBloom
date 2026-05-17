/**
 * Request Validation Middleware using express-validator.
 *
 * Each array of validation rules can be imported by route files.
 * The `validate` function checks the results and returns 400 with
 * structured errors if any rule fails.
 */

const { query, param, validationResult } = require('express-validator');
const { ApiError } = require('../../utils');

/**
 * Runs after validation rules — checks for errors and returns them.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
      value: e.value,
    }));
    return next(new ApiError(400, 'Validation failed', true));
  }
  next();
}

// --- Reusable Validation Chains ---

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate,
];

const validateEthAddress = (paramName) => [
  param(paramName)
    .isString()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage(`${paramName} must be a valid Ethereum address`),
  validate,
];

const validateProposalId = [
  param('proposalId')
    .isString()
    .notEmpty()
    .withMessage('proposalId is required'),
  validate,
];

module.exports = {
  validate,
  validatePagination,
  validateEthAddress,
  validateProposalId,
};
