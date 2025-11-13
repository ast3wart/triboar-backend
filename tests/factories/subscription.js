import { getPool } from '../../src/db/connection.js';
import { createTestSubscriptionData } from '../utils/helpers.js';

/**
 * Create a test subscription in the database
 */
export async function createTestSubscription(userId, overrides = {}) {
  const pool = getPool();
  const subData = createTestSubscriptionData(userId, overrides);

  const result = await pool.query(
    `INSERT INTO subscriptions
     (id, user_id, stripe_subscription_id, stripe_price_id, status,
      current_period_start, current_period_end, trial_start, trial_end,
      cancel_at, canceled_at, cancel_at_period_end, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      subData.id,
      subData.user_id,
      subData.stripe_subscription_id,
      subData.stripe_price_id,
      subData.status,
      subData.current_period_start,
      subData.current_period_end,
      subData.trial_start,
      subData.trial_end,
      subData.cancel_at,
      subData.canceled_at,
      subData.cancel_at_period_end,
      JSON.stringify(subData.metadata),
      subData.created_at,
      subData.updated_at,
    ]
  );

  return result.rows[0];
}

/**
 * Create multiple test subscriptions
 */
export async function createTestSubscriptions(userId, count, overrides = {}) {
  const subscriptions = [];
  for (let i = 0; i < count; i++) {
    const sub = await createTestSubscription(userId, overrides);
    subscriptions.push(sub);
  }
  return subscriptions;
}

export default {
  createTestSubscription,
  createTestSubscriptions,
};
