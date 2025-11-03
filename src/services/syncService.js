import { query } from '../db/connection.js';
import logger from '../utils/logger.js';
import * as gracePeriodService from './gracePeriodService.js';

/**
 * Sync service - handles daily list updates and subscription state transitions
 */

/**
 * Perform daily sync at 11:59 PM
 * - Move expired subscriptions to grace period
 * - Remove users from grace period if 7 days has passed
 * - Update all subscription end dates
 */
export const performDailySync = async () => {
  try {
    logger.info('Starting daily sync');

    // Step 1: Move expired subscriptions to grace period
    const expiredResult = await query(
      `SELECT id, discord_id, subscription_end_date
       FROM users
       WHERE tier = 'paid'
         AND subscription_end_date <= NOW()
       LIMIT 1000`
    );

    for (const user of expiredResult.rows) {
      try {
        await gracePeriodService.startGracePeriod(user.id, user.discord_id);
        logger.info({ userId: user.id, discordId: user.discord_id }, 'Moved user to grace period during sync');
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Failed to move user to grace period');
      }
    }

    // Step 2: Remove users from grace period if 7 days have passed
    const graceExpiredResult = await query(
      `SELECT id, discord_id, grace_period_end_date
       FROM users
       WHERE tier = 'grace'
         AND grace_period_end_date <= NOW()
       LIMIT 1000`
    );

    for (const user of graceExpiredResult.rows) {
      try {
        await query(
          `UPDATE users
           SET tier = 'free', grace_period_end_date = NULL
           WHERE id = $1`,
          [user.id]
        );
        logger.info({ userId: user.id, discordId: user.discord_id }, 'Removed user from grace period - expired');
      } catch (err) {
        logger.error({ err, userId: user.id }, 'Failed to remove user from grace period');
      }
    }

    logger.info({ expiredCount: expiredResult.rows.length, graceExpiredCount: graceExpiredResult.rows.length }, 'Daily sync completed');

  } catch (err) {
    logger.error({ err }, 'Daily sync failed');
  }
};

/**
 * Sync user on new subscription/renewal
 * - Ensure user is marked as paid
 * - Set subscription end date
 * - Clear any grace period
 */
export const syncUserOnSubscription = async (userId, stripeSubscription) => {
  try {
    const subscriptionEndDate = new Date(stripeSubscription.current_period_end * 1000);

    await query(
      `UPDATE users
       SET tier = 'paid',
           subscription_end_date = $1,
           grace_period_end_date = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [subscriptionEndDate, userId]
    );

    logger.info({ userId, expiresAt: subscriptionEndDate }, 'Synced user on subscription');

  } catch (err) {
    logger.error({ err, userId }, 'Failed to sync user on subscription');
    throw err;
  }
};
