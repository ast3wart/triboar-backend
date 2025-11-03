import jwt from 'jsonwebtoken';
import logger from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

if (!JWT_SECRET) {
  logger.warn('JWT_SECRET not set - using insecure default');
}

export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET || 'change-me-in-production', {
    expiresIn: JWT_EXPIRE,
  });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET || 'change-me-in-production');
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
