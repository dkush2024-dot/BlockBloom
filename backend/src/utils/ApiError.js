/**
 * Custom API Error Class
 *
 * WHY A CUSTOM ERROR CLASS:
 *   JavaScript's built-in Error only has `message` and `stack`.
 *   For REST APIs, we also need `statusCode` and `isOperational`.
 *
 *   `isOperational` distinguishes expected errors (e.g., "proposal not found")
 *   from programming bugs (e.g., "cannot read property of undefined").
 *   The error middleware uses this flag to decide whether to send the error
 *   message to the client or hide it behind a generic "Internal Server Error".
 */

class ApiError extends Error {
  constructor(statusCode, message, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;

    // Captures proper stack trace (excludes this constructor from the trace)
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message) {
    return new ApiError(400, message);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message, false);
  }
}

module.exports = ApiError;
