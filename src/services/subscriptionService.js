import logger from '../utils/logger.js';
import { query } from '../db/connection.js';
import * as discordRoleService from './discordRoleService.js';
import * as auditLogService from './auditLogService.js';
import * as gracePeriodService from './gracePeriodService.js';
import * as webhookService from './webhookService.js';

export const createOrUpdateSubscription = async (userId, stripeSubscription) => {
  try {
    const {
      id: stripe_subscription_id,
      customer: stripe_customer_id,
      status,
      current_period_start,
      current_period_end,
      trial_start,
      trial_end,
      cancel_at,
      cancel_at_period_end,
      canceled_at,
      items,
    } = stripeSubscription;

    const stripe_price_id = items.data[0]?.price.id;

    // Check if subscription exists
    const existing = await query(
      'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
      [stripe_subscription_id]
    );

    let subscription;

    if (existing.rows.length > 0) {
      // Update existing
      const result = await query(
        `UPDATE subscriptions
         SET status = $1, current_period_start = $2, current_period_end = $3,
             trial_start = $4, trial_end = $5, cancel_at = $6,
             cancel_at_period_end = $7, canceled_at = $8, updated_at = CURRENT_TIMESTAMP
         WHERE stripe_subscription_id = $9
         RETURNING *`,
        [
          status,
          new Date(current_period_start * 1000),
          new Date(current_period_end * 1000),
          trial_start ? new Date(trial_start * 1000) : null,
          trial_end ? new Date(trial_end * 1000) : null,
          cancel_at ? new Date(cancel_at * 1000) : null,
          cancel_at_period_end,
          canceled_at ? new Date(canceled_at * 1000) : null,
          stripe_subscription_id,
        ]
      );

      subscription = result.rows[0];
      logger.info({ stripe_subscription_id, status }, 'Updated subscription');
    } else {
      // Create new
      const result = await query(
        `INSERT INTO subscriptions
         (user_id, stripe_subscription_id, stripe_price_id, status,
          current_period_start, current_period_end, trial_start, trial_end,
          cancel_at, cancel_at_period_end, canceled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          userId,
          stripe_subscription_id,
          stripe_price_id,
          status,
          new Date(current_period_start * 1000),
          new Date(current_period_end * 1000),
          trial_start ? new Date(trial_start * 1000) : null,
          trial_end ? new Date(trial_end * 1000) : null,
          cancel_at ? new Date(cancel_at * 1000) : null,
          cancel_at_period_end,
          canceled_at ? new Date(canceled_at * 1000) : null,
        ]
      );

      subscription = result.rows[0];
      logger.info({ stripe_subscription_id, status }, 'Created subscription');
    }

    return subscription;
  } catch (err) {
    logger.error({ err, userId, subscription_id: stripeSubscription.id }, 'Failed to create/update subscription');
    throw err;
  }
};

export const getActiveSubscription = async (userId) => {
  try {
    const result = await query(
      `SELECT * FROM subscriptions
       WHERE user_id = $1 AND status IN ('active', 'trialing')
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  } catch (err) {
    logger.error({ err, userId }, 'Failed to get active subscription');
    throw err;
  }
};

export const getSubscriptionById = async (subscriptionId) => {
  try {
    const result = await query(
      'SELECT * FROM subscriptions WHERE id = $1',
      [subscriptionId]
    );

    return result.rows[0] || null;
  } catch (err) {
    logger.error({ err, subscriptionId }, 'Failed to get subscription');
    throw err;
  }
};

export const getSubscriptionByStripeId = async (stripeSubscriptionId) => {
  try {
    const result = await query(
      'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
      [stripeSubscriptionId]
    );

    return result.rows[0] || null;
  } catch (err) {
    logger.error({ err, stripeSubscriptionId }, 'Failed to get subscription by Stripe ID');
    throw err;
  }
};

export const handleSubscriptionActive = async (stripeSubscription) => {
  try {
    const subscription = await createOrUpdateSubscription(null, stripeSubscription);

    // Get user from subscription
    const userResult = await query(
      'SELECT u.* FROM users u JOIN subscriptions s ON u.id = s.user_id WHERE s.stripe_subscription_id = $1',
      [stripeSubscription.id]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found for subscription');
    }

    // Update user tier
    await query(
      'UPDATE users SET tier = $1 WHERE id = $2',
      ['paid', user.id]
    );

    // Add paid role to Discord
    try {
      await discordRoleService.syncRoles(user.discord_id, true);
    } catch (err) {
      logger.error({ err, discordId: user.discord_id }, 'Failed to sync Discord roles');
      // Continue even if Discord role sync fails
    }

    // Remove from grace period if they were in it (they renewed)
    try {
      await gracePeriodService.removeFromGracePeriod(user.id, user.discord_id);
      await webhookService.sendSubscriptionRenewed(user.id, user.discord_id);
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to handle renewal from grace period');
    }

    // Send webhook to RoleBot
    try {
      await webhookService.sendSubscriptionActivated(user.id, user.discord_id);
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to send webhook');
    }

    // Log event
    await auditLogService.logEvent(user.id, 'subscription.activated', {
      subscription_id: stripeSubscription.id,
      status: stripeSubscription.status,
    });

    logger.info({ userId: user.id, subscriptionId: stripeSubscription.id }, 'Subscription activated');
  } catch (err) {
    logger.error({ err, subscription_id: stripeSubscription.id }, 'Failed to handle subscription active');
    throw err;
  }
};

export const handleSubscriptionCanceled = async (stripeSubscription) => {
  try {
    const subscription = await createOrUpdateSubscription(null, stripeSubscription);

    // Get user from subscription
    const userResult = await query(
      'SELECT u.* FROM users u JOIN subscriptions s ON u.id = s.user_id WHERE s.stripe_subscription_id = $1',
      [stripeSubscription.id]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found for subscription');
    }

    // DON'T remove role yet - move to grace period for 7 days
    // User keeps @Subscribed role during grace period
    try {
      await gracePeriodService.moveToGracePeriod(user.id, user.discord_id);
      await webhookService.sendGracePeriodStarted(user.id, user.discord_id);
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to move to grace period');
    }

    // Log event
    await auditLogService.logEvent(user.id, 'subscription.canceled', {
      subscription_id: stripeSubscription.id,
      status: stripeSubscription.status,
      movedToGracePeriod: true,
    });

    logger.info({ userId: user.id, subscriptionId: stripeSubscription.id }, 'Subscription canceled - moved to grace period');
  } catch (err) {
    logger.error({ err, subscription_id: stripeSubscription.id }, 'Failed to handle subscription canceled');
    throw err;
  }
};

export const handleSubscriptionPastDue = async (stripeSubscription) => {
  try {
    const subscription = await createOrUpdateSubscription(null, stripeSubscription);

    // Get user
    const userResult = await query(
      'SELECT u.* FROM users u JOIN subscriptions s ON u.id = s.user_id WHERE s.stripe_subscription_id = $1',
      [stripeSubscription.id]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new Error('User not found for subscription');
    }

    // Log event but keep roles - they should only be removed on full cancellation
    await auditLogService.logEvent(user.id, 'subscription.past_due', {
      subscription_id: stripeSubscription.id,
      current_period_end: stripeSubscription.current_period_end,
    });

    logger.info({ userId: user.id, subscriptionId: stripeSubscription.id }, 'Subscription past due');
  } catch (err) {
    logger.error({ err, subscription_id: stripeSubscription.id }, 'Failed to handle subscription past due');
    throw err;
  }
};

export const isSubscriptionActive = (subscription) => {
  if (!subscription) return false;
  return ['active', 'trialing'].includes(subscription.status);
};
