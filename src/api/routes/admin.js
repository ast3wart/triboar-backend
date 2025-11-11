import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAdmin, requireApiToken } from '../middleware/auth.js';
import * as auditLogService from '../../services/auditLogService.js';
import * as gracePeriodService from '../../services/gracePeriodService.js';
import * as webhookService from '../../services/webhookService.js';
import logger from '../../utils/logger.js';
import { query } from '../../db/connection.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';

const router = express.Router();

// POST /api/admin/subscriptions/gift - Grant a gift subscription to a user
// Uses API token auth (not JWT) for rolebot integration
router.post('/subscriptions/gift', requireApiToken, asyncHandler(async (req, res) => {
  const { discordId, duration, reason } = req.body;

  // Validate input
  if (!discordId) {
    throw new ValidationError('discordId is required');
  }

  // Parse duration (e.g., "1_month", "3_months", "1_year")
  const durationMap = {
    '1_month': 30,
    '3_months': 90,
    '6_months': 180,
    '1_year': 365,
  };

  const days = durationMap[duration];
  if (!days) {
    throw new ValidationError('Invalid duration. Must be one of: 1_month, 3_months, 6_months, 1_year');
  }

  try {
    // Find or create user
    let userResult = await query(
      'SELECT * FROM users WHERE discord_id = $1',
      [discordId]
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    let userId;
    if (userResult.rows.length === 0) {
      // Create new user with minimal info
      const newUserResult = await query(
        `INSERT INTO users (discord_id, tier, email, subscription_end_date)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [discordId, 'paid', `gift-${discordId}@triboar.guild`, expiresAt]
      );
      userId = newUserResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
      // Update existing user to paid tier with expiration date
      await query(
        'UPDATE users SET tier = $1, subscription_end_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['paid', expiresAt, userId]
      );
    }

    // Create admin override record
    await query(
      `INSERT INTO admin_overrides
       (user_id, admin_discord_id, override_type, reason, expires_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId,
        req.user?.discord_id || null,
        'tier_change',
        reason || `Gift subscription: ${duration}`,
        expiresAt,
        JSON.stringify({
          originalTier: userResult.rows[0]?.tier || 'free',
          newTier: 'paid',
          duration,
          days,
          giftedBy: req.user?.email || 'admin'
        })
      ]
    );

    // Remove from grace period if they're in one
    try {
      await gracePeriodService.removeFromGracePeriod(userId, discordId);
    } catch (err) {
      // Ignore if not in grace period
      logger.debug({ userId, discordId }, 'User not in grace period (expected for new gifts)');
    }

    // Log audit event
    await auditLogService.logEvent(
      userId,
      'gift_subscription.granted',
      {
        discordId,
        duration,
        days,
        expiresAt,
        reason: reason || 'Gift subscription'
      },
      {
        action: 'grant',
        resourceType: 'subscription'
      }
    );

    // Trigger webhook to notify rolebot
    await webhookService.sendWebhook('subscription.activated', {
      discordId,
      source: 'gift_subscription',
      expiresAt: expiresAt.toISOString()
    });

    logger.info({ discordId, userId, duration, expiresAt }, 'Gift subscription granted');

    res.json({
      success: true,
      message: `Gift subscription granted for ${duration}`,
      user: {
        id: userId,
        discordId,
        tier: 'paid',
        expiresAt
      }
    });

  } catch (err) {
    logger.error({ err, discordId, duration }, 'Failed to grant gift subscription');
    throw err;
  }
}));

// All admin routes require authentication
router.use(requireAdmin);

// GET /api/admin/users/search - Search users
router.get('/users/search', asyncHandler(async (req, res) => {
  const { email, discord_id, limit = 20, offset = 0 } = req.query;

  if (!email && !discord_id) {
    throw new ValidationError('Email or Discord ID required');
  }

  try {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (email) {
      whereClause += ' AND email ILIKE $' + (params.length + 1);
      params.push(`%${email}%`);
    }

    if (discord_id) {
      whereClause += ' AND discord_id = $' + (params.length + 1);
      params.push(discord_id);
    }

    const countResult = await query(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to search users');
    throw err;
  }
}));

// GET /api/admin/users/:userId - Get user details
router.get('/users/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    const userResult = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    const user = userResult.rows[0];

    // Get subscription
    const subResult = await query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    // Get recent audit logs
    const logsResult = await query(
      'SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    res.json({
      user,
      subscription: subResult.rows[0] || null,
      recentLogs: logsResult.rows,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get user');
    throw err;
  }
}));

// POST /api/admin/roles/grant - Manually grant paid role
router.post('/roles/grant', asyncHandler(async (req, res) => {
  const { discord_id, reason = 'Admin override' } = req.body;

  if (!discord_id) {
    throw new ValidationError('discord_id required');
  }

  try {
    // RoleBot handles role assignment via webhooks - backend just logs the override
    // Find user and log
    const userResult = await query(
      'SELECT * FROM users WHERE discord_id = $1',
      [discord_id]
    );

    if (userResult.rows[0]) {
      await query(
        `INSERT INTO admin_overrides (user_id, admin_discord_id, override_type, reason)
         VALUES ($1, $2, $3, $4)`,
        [userResult.rows[0].id, req.user.discord_id, 'role_grant', reason]
      );

      await auditLogService.logEvent(
        userResult.rows[0].id,
        'admin.role_granted',
        { discord_id, reason },
        { action: 'grant', resourceType: 'role' }
      );
    }

    res.json({ success: true, message: 'Role granted' });
  } catch (err) {
    logger.error({ err, discord_id }, 'Failed to grant role');
    throw err;
  }
}));

// POST /api/admin/roles/remove - Manually remove paid role
router.post('/roles/remove', asyncHandler(async (req, res) => {
  const { discord_id, reason = 'Admin override' } = req.body;

  if (!discord_id) {
    throw new ValidationError('discord_id required');
  }

  try {
    // RoleBot handles role removal via webhooks - backend just logs the override
    // Find user and log
    const userResult = await query(
      'SELECT * FROM users WHERE discord_id = $1',
      [discord_id]
    );

    if (userResult.rows[0]) {
      await query(
        `INSERT INTO admin_overrides (user_id, admin_discord_id, override_type, reason)
         VALUES ($1, $2, $3, $4)`,
        [userResult.rows[0].id, req.user.discord_id, 'role_remove', reason]
      );

      await auditLogService.logEvent(
        userResult.rows[0].id,
        'admin.role_removed',
        { discord_id, reason },
        { action: 'remove', resourceType: 'role' }
      );
    }

    res.json({ success: true, message: 'Role removed' });
  } catch (err) {
    logger.error({ err, discord_id }, 'Failed to remove role');
    throw err;
  }
}));

// POST /api/admin/reconcile - Sync a user's Discord roles to Stripe state
router.post('/reconcile', asyncHandler(async (req, res) => {
  const { discord_id } = req.body;

  if (!discord_id) {
    throw new ValidationError('discord_id required');
  }

  try {
    // Get user
    const userResult = await query(
      'SELECT * FROM users WHERE discord_id = $1',
      [discord_id]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    const user = userResult.rows[0];

    // Get subscription
    const subResult = await query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ($2, $3)',
      [user.id, 'active', 'trialing']
    );

    const hasPaidSubscription = subResult.rows.length > 0;

    // RoleBot will handle role syncing via webhook - backend just logs the reconciliation
    // Log the reconciliation
    await auditLogService.logEvent(
      user.id,
      'admin.reconcile',
      { hasPaidSubscription },
      { action: 'reconcile', resourceType: 'user' }
    );

    res.json({
      success: true,
      hasPaidSubscription,
      message: 'Reconciliation logged. RoleBot will sync roles via webhook.'
    });
  } catch (err) {
    logger.error({ err, discord_id }, 'Failed to reconcile');
    throw err;
  }
}));

// GET /api/admin/audit-logs - Get audit logs
router.get('/audit-logs', asyncHandler(async (req, res) => {
  const { user_id, event_type, start_date, end_date, limit = 100, offset = 0 } = req.query;

  const filters = {};
  if (user_id) filters.userId = user_id;
  if (event_type) filters.eventType = event_type;
  if (start_date) filters.startDate = new Date(start_date);
  if (end_date) filters.endDate = new Date(end_date);

  try {
    const result = await auditLogService.getAuditLogs(filters, parseInt(limit), parseInt(offset));
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to get audit logs');
    throw err;
  }
}));

// GET /api/admin/subscribers - Get all active subscribers
router.get('/subscribers', asyncHandler(async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.discord_id, s.current_period_end
       FROM users u
       JOIN subscriptions s ON u.id = s.user_id
       WHERE s.status IN ('active', 'trialing')
       ORDER BY u.created_at DESC`
    );

    const subscribers = result.rows.map(row => ({
      userId: row.id,
      discordId: row.discord_id,
      expiresAt: row.current_period_end,
      isActive: new Date(row.current_period_end) > new Date(),
    }));

    res.json({ subscribers });
  } catch (err) {
    logger.error({ err }, 'Failed to get subscribers');
    throw err;
  }
}));

// GET /api/admin/grace-period - Get users in grace period
router.get('/grace-period', asyncHandler(async (req, res) => {
  try {
    const gracePeriodUsers = await gracePeriodService.getGracePeriodUsers();
    res.json({ gracePeriodUsers });
  } catch (err) {
    logger.error({ err }, 'Failed to get grace period users');
    throw err;
  }
}));

// POST /api/admin/grace-period/add - Move user to grace period
router.post('/grace-period/add', asyncHandler(async (req, res) => {
  const { userId, discordId } = req.body;

  if (!userId || !discordId) {
    throw new ValidationError('userId and discordId required');
  }

  try {
    await gracePeriodService.moveToGracePeriod(userId, discordId);
    await webhookService.sendWebhook('grace_period.started', { discordId, userId });

    res.json({ success: true, message: 'User moved to grace period' });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to add to grace period');
    throw err;
  }
}));

// POST /api/admin/grace-period/remove - Remove from grace period (renewed)
router.post('/grace-period/remove', asyncHandler(async (req, res) => {
  const { userId, discordId } = req.body;

  if (!userId || !discordId) {
    throw new ValidationError('userId and discordId required');
  }

  try {
    await gracePeriodService.removeFromGracePeriod(userId, discordId);
    await webhookService.sendWebhook('subscription.renewed', { discordId, userId });

    res.json({ success: true, message: 'User removed from grace period (renewed)' });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to remove from grace period');
    throw err;
  }
}));

// POST /api/admin/grace-period/expire - Expire grace period (not renewed)
router.post('/grace-period/expire', asyncHandler(async (req, res) => {
  const { userId, discordId } = req.body;

  if (!userId || !discordId) {
    throw new ValidationError('userId and discordId required');
  }

  try {
    await gracePeriodService.expireGracePeriod(userId, discordId);
    await webhookService.sendWebhook('grace_period.expired', { discordId, userId });

    res.json({ success: true, message: 'Grace period expired' });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to expire grace period');
    throw err;
  }
}));

// PUT /api/admin/users/:userId/grace-dm-preference - Update DM preference
router.put('/users/:userId/grace-dm-preference', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { dmEnabled } = req.body;

  if (typeof dmEnabled !== 'boolean') {
    throw new ValidationError('dmEnabled must be boolean');
  }

  try {
    await gracePeriodService.setDMPreference(userId, dmEnabled);

    res.json({
      success: true,
      message: `Grace period DM ${dmEnabled ? 'enabled' : 'disabled'}`
    });
  } catch (err) {
    logger.error({ err, userId }, 'Failed to update DM preference');
    throw err;
  }
}));

export default router;
