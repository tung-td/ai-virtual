

/**
 * asyncHandler
 * Wraps an async Express route handler so errors are forwarded to next().
 * Usage: router.get("/path", asyncHandler(async (req, res) => { ... }))
 *
 * @param {Function} fn
 * @returns {Function}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * AppError
 * Custom error class with an HTTP status code.
 * Throw this from controllers for known error conditions.
 *
 * @example
 * throw new AppError("Quota exceeded", 402);
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {string} [code] - machine-readable error code, e.g. "QUOTA_EXCEEDED"
   */
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * errorHandler
 * Global Express error handler middleware. Must be registered LAST via app.use().
 *
 * @type {import("express").ErrorRequestHandler}
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message =
    statusCode === 500
      ? "An unexpected error occurred. Please try again."
      : err.message;

  // Log all server errors
  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}`, err);
  }

  res.status(statusCode).json({
    success: false,
    code,
    error: message,
  });
}
