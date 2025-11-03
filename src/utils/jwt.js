import jwt from 'jsonwebtoken';
import logger from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

// Validate JWT_SECRET is set on startup
if (!JWT_SECRET) {
  const errorMsg = 'CRITICAL: JWT_SECRET environment variable is required but not set. Application cannot start without it.';
  logger.error(errorMsg);
  throw new Error(errorMsg);
}

// Validate minimum length
if (JWT_SECRET.length < 32) {
  const errorMsg = 'CRITICAL: JWT_SECRET must be at least 32 characters long. Current length: ' + JWT_SECRET.length;
  logger.error(errorMsg);
  throw new Error(errorMsg);
}

export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    logger.error({ err }, 'JWT verification failed');
    return null;
  }
};

export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (err) {
    return null;
  }
};
