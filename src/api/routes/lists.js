import express from 'express';
import { query } from '../../db/connection.js';
import logger from '../../utils/logger.js';

const router = express.Router();

/**
 * GET /api/lists/subscribed
 * Returns array of Discord IDs with active subscriptions
 */
router.get('/subscribed', async (req, res) => {
  try {
    const result = await query(
      `SELECT discord_id, stripe_customer_id, subscription_end_date
       FROM users
       WHERE tier = 'paid'
         AND subscription_end_date > NOW()
       ORDER BY discord_id`
    );

    const discordIds = result.rows.map(row => ({
      discordId: row.discord_id,
      stripeCustomerId: row.stripe_customer_id,
      expiresAt: row.subscription_end_date,
    }));

    logger.info({ count: discordIds.length }, 'Fetched subscribed list');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      list: discordIds,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch subscribed list');
    res.status(500).json({ error: 'Failed to fetch subscribed list' });
  }
});

/**
 * GET /api/lists/grace
 * Returns array of Discord IDs in grace period (7 days after subscription expiration)
 */
router.get('/grace', async (req, res) => {
  try {
    const result = await query(
      `SELECT discord_id, stripe_customer_id, subscription_end_date, grace_period_end_date
       FROM users
       WHERE tier = 'grace'
         AND grace_period_end_date > NOW()
       ORDER BY discord_id`
    );

    const discordIds = result.rows.map(row => ({
      discordId: row.discord_id,
      stripeCustomerId: row.stripe_customer_id,
      subscriptionExpiredAt: row.subscription_end_date,
      graceEndsAt: row.grace_period_end_date,
    }));

    logger.info({ count: discordIds.length }, 'Fetched grace period list');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      list: discordIds,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch grace period list');
    res.status(500).json({ error: 'Failed to fetch grace period list' });
  }
});

/**
 * GET /api/lists/all
 * Returns both subscribed and grace period lists
 */
router.get('/all', async (req, res) => {
  try {
    const subscribedResult = await query(
      `SELECT discord_id, stripe_customer_id, subscription_end_date
       FROM users
       WHERE tier = 'paid'
         AND subscription_end_date > NOW()
       ORDER BY discord_id`
    );

    const graceResult = await query(
      `SELECT discord_id, stripe_customer_id, subscription_end_date, grace_period_end_date
       FROM users
       WHERE tier = 'grace'
         AND grace_period_end_date > NOW()
       ORDER BY discord_id`
    );

    const subscribed = subscribedResult.rows.map(row => ({
      discordId: row.discord_id,
      stripeCustomerId: row.stripe_customer_id,
      expiresAt: row.subscription_end_date,
    }));

    const grace = graceResult.rows.map(row => ({
      discordId: row.discord_id,
      stripeCustomerId: row.stripe_customer_id,
      subscriptionExpiredAt: row.subscription_end_date,
      graceEndsAt: row.grace_period_end_date,
    }));

    logger.info({ subscribed: subscribed.length, grace: grace.length }, 'Fetched all lists');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      subscribed,
      grace,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch all lists');
    res.status(500).json({ error: 'Failed to fetch all lists' });
  }
});

export default router;
