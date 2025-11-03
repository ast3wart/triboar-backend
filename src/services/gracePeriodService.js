import logger from '../utils/logger.js';
import { query } from '../db/connection.js';

const GRACE_PERIOD_DAYS = 7;

export const moveToGracePeriod = async (userId, discordId) => {
  try {
    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + GRACE_PERIOD_DAYS);

    await query(
      `INSERT INTO grace_period (user_id, discord_id, grace_period_ends_at, dm_enabled)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id) DO UPDATE
       SET grace_period_ends_at = $3, updated_at = CURRENT_TIMESTAMP`,
      [userId, discordId, gracePeriodEndsAt]
    );

    logger.info({ userId, discordId, endsAt: gracePeriodEndsAt }, 'User moved to grace period');
    return true;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to move user to grace period');
    return false;
  }
};

export const removeFromGracePeriod = async (userId, discordId) => {
  try {
    await query(
      'DELETE FROM grace_period WHERE user_id = $1',
      [userId]
    );

    logger.info({ userId, discordId }, 'User removed from grace period (renewed)');
    return true;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to remove user from grace period');
    return false;
  }
};

export const expireGracePeriod = async (userId, discordId) => {
  try {
    await query(
      'DELETE FROM grace_period WHERE user_id = $1',
      [userId]
    );

    logger.info({ userId, discordId }, 'Grace period expired (not renewed)');
    return true;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to expire grace period');
    return false;
  }
};

export const getGracePeriodUsers = async () => {
  try {
    const result = await query(
      `SELECT id, user_id, discord_id, grace_period_ends_at, dm_enabled
       FROM grace_period
       WHERE grace_period_ends_at > NOW()
       ORDER BY grace_period_ends_at ASC`
    );

    return result.rows;
  } catch (err) {
    logger.error({ err }, 'Failed to get grace period users');
    return [];
  }
};

export const getExpiredGracePeriodUsers = async () => {
  try {
    const result = await query(
      `SELECT id, user_id, discord_id, grace_period_ends_at
       FROM grace_period
       WHERE grace_period_ends_at <= NOW()`
    );

    return result.rows;
  } catch (err) {
    logger.error({ err }, 'Failed to get expired grace period users');
    return [];
  }
};

export const setDMPreference = async (userId, enabled) => {
  try {
    await query(
      'UPDATE grace_period SET dm_enabled = $1 WHERE user_id = $2',
      [enabled, userId]
    );

    logger.info({ userId, enabled }, 'Updated grace period DM preference');
    return true;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to update DM preference');
    return false;
  }
};

export const isUserInGracePeriod = async (userId) => {
  try {
    const result = await query(
      'SELECT * FROM grace_period WHERE user_id = $1 AND grace_period_ends_at > NOW()',
      [userId]
    );

    return result.rows.length > 0;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to check grace period status');
    return false;
  }
};

export const getGracePeriodStatus = async (userId) => {
  try {
    const result = await query(
      'SELECT grace_period_ends_at, dm_enabled FROM grace_period WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const now = new Date();
    const endsAt = new Date(row.grace_period_ends_at);
    const daysRemaining = Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24));

    return {
      gracePeriodEndsAt: row.grace_period_ends_at,
      daysRemaining: Math.max(0, daysRemaining),
      dmEnabled: row.dm_enabled,
      isExpired: daysRemaining <= 0,
    };
  } catch (err) {
    logger.error({ err, userId }, 'Failed to get grace period status');
    return null;
  }
};
