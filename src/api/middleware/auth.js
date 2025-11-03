import { verifyToken } from '../../utils/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';
import { query } from '../../db/connection.js';

export const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    throw new UnauthorizedError('Missing authentication token');
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  req.user = decoded;
  next();
};

export const requireAdmin = async (req, res, next) => {
  requireAuth(req, res, () => {
    // Check if user is admin
    const adminDiscordIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map(id => id.trim());

    if (!adminDiscordIds.includes(req.user.discord_id)) {
      throw new ForbiddenError('Admin access required');
    }

    next();
  });
};

export const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }

  next();
};
