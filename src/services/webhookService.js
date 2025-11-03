import axios from 'axios';
import logger from '../utils/logger.js';
import { query } from '../db/connection.js';

const ROLEBOT_URL = process.env.ROLEBOT_WEBHOOK_URL || 'http://localhost:3001/webhooks/rolebot';

/**
 * Send webhook event to RoleBot
 */
export const sendWebhook = async (eventType, data) => {
  try {
    const payload = {
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    const response = await axios.post(ROLEBOT_URL, payload, {
      timeout: 5000,
    });

    logger.info({ eventType, discordId: data.discordId }, 'Webhook sent to RoleBot');

    // Log webhook event in database
    await query(
      `INSERT INTO webhook_events (user_id, event_type, payload, sent_to_rolebot, sent_at)
       VALUES ($1, $2, $3, true, NOW())`,
      [data.userId || null, eventType, JSON.stringify(payload)]
    );

    return true;

  } catch (err) {
    logger.error({ err, eventType, data }, 'Failed to send webhook to RoleBot');

    // Log failed webhook attempt
    try {
      await query(
        `INSERT INTO webhook_events (user_id, event_type, payload, sent_to_rolebot)
         VALUES ($1, $2, $3, false)`,
        [data.userId || null, eventType, JSON.stringify({ type: eventType, data })]
      );
    } catch (logErr) {
      logger.error({ logErr }, 'Failed to log webhook event');
    }

    return false;
  }
};

/**
 * Send subscription activated webhook
 */
export const sendSubscriptionActivated = async (userId, discordId) => {
  return sendWebhook('subscription.activated', { userId, discordId });
};

/**
 * Send subscription renewed webhook
 */
export const sendSubscriptionRenewed = async (userId, discordId) => {
  return sendWebhook('subscription.renewed', { userId, discordId });
};

/**
 * Send subscription cancelled webhook
 */
export const sendSubscriptionCancelled = async (userId, discordId) => {
  return sendWebhook('subscription.cancelled', { userId, discordId });
};

/**
 * Send grace period started webhook
 */
export const sendGracePeriodStarted = async (userId, discordId) => {
  return sendWebhook('grace_period.started', { userId, discordId });
};

/**
 * Get webhook status
 */
export const getWebhookStatus = async (limit = 50, offset = 0) => {
  try {
    const result = await query(
      `SELECT id, user_id, event_type, sent_to_rolebot, created_at
       FROM webhook_events
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  } catch (err) {
    logger.error({ err }, 'Failed to get webhook status');
    return [];
  }
};
