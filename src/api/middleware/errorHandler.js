import logger from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error(
    {
      err,
      method: req.method,
      url: req.url,
      statusCode: err.statusCode || 500,
    },
    'Request error'
  );

  // Handle AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Handle Stripe errors
  if (err.type && err.type.includes('StripeAPIError')) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  // Handle database errors
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    return res.status(503).json({
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database connection error',
      },
    });
  }

  // Default error
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
    },
  });
};

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
