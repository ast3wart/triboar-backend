import { getPool } from '../../src/db/connection.js';

/**
 * Clear all tables for a fresh test
 */
export async function clearDatabase() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    // Disable foreign key constraints temporarily
    await client.query('SET session_replication_role = REPLICA');

    // Clear tables in dependency order
    await client.query('TRUNCATE TABLE processed_webhooks CASCADE');
    await client.query('TRUNCATE TABLE webhook_events CASCADE');
    await client.query('TRUNCATE TABLE audit_logs CASCADE');
    await client.query('TRUNCATE TABLE grace_period CASCADE');
    await client.query('TRUNCATE TABLE discord_role_changes CASCADE');
    await client.query('TRUNCATE TABLE admin_overrides CASCADE');
    await client.query('TRUNCATE TABLE subscriptions CASCADE');
    await client.query('TRUNCATE TABLE users CASCADE');

    // Re-enable foreign key constraints
    await client.query('SET session_replication_role = DEFAULT');
  } finally {
    client.release();
  }
}

/**
 * Get user by discord_id
 */
export async function getUserByDiscordId(discordId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM users WHERE discord_id = $1',
    [discordId]
  );
  return result.rows[0];
}

/**
 * Get user by id
 */
export async function getUserById(userId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0];
}

/**
 * Get subscription by user_id (most recent)
 */
export async function getSubscriptionByUserId(userId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return result.rows[0];
}

/**
 * Get all subscriptions for user
 */
export async function getSubscriptionsByUserId(userId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

/**
 * Get subscription by stripe_subscription_id
 */
export async function getSubscriptionByStripeId(stripeSubId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM subscriptions WHERE stripe_subscription_id = $1',
    [stripeSubId]
  );
  return result.rows[0];
}

/**
 * Get audit logs for user
 */
export async function getAuditLogsByUserId(userId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return result.rows;
}

/**
 * Get audit logs by event type
 */
export async function getAuditLogsByEventType(eventType) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM audit_logs WHERE event_type = $1 ORDER BY created_at ASC',
    [eventType]
  );
  return result.rows;
}

/**
 * Get grace period entry for user
 */
export async function getGracePeriodByUserId(userId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM grace_period WHERE user_id = $1',
    [userId]
  );
  return result.rows[0];
}

/**
 * Get processed webhook event
 */
export async function getProcessedWebhook(eventId) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM processed_webhooks WHERE stripe_event_id = $1',
    [eventId]
  );
  return result.rows[0];
}

/**
 * Get all users
 */
export async function getAllUsers() {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM users ORDER BY created_at ASC');
  return result.rows;
}

/**
 * Get all subscriptions
 */
export async function getAllSubscriptions() {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM subscriptions ORDER BY created_at ASC'
  );
  return result.rows;
}

export default {
  clearDatabase,
  getUserByDiscordId,
  getUserById,
  getSubscriptionByUserId,
  getSubscriptionsByUserId,
  getSubscriptionByStripeId,
  getAuditLogsByUserId,
  getAuditLogsByEventType,
  getGracePeriodByUserId,
  getProcessedWebhook,
  getAllUsers,
  getAllSubscriptions,
};
