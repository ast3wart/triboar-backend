import { getPool } from '../../src/db/connection.js';
import { createTestUserData } from '../utils/helpers.js';

/**
 * Create a test user in the database
 */
export async function createTestUser(overrides = {}) {
  const pool = getPool();
  const userData = createTestUserData(overrides);

  const result = await pool.query(
    `INSERT INTO users (id, email, discord_id, discord_username, stripe_customer_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userData.id,
      userData.email,
      userData.discord_id,
      userData.discord_username,
      userData.stripe_customer_id,
      userData.created_at,
      userData.updated_at,
    ]
  );

  return result.rows[0];
}

/**
 * Create multiple test users
 */
export async function createTestUsers(count, overrides = {}) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser(overrides);
    users.push(user);
  }
  return users;
}

export default {
  createTestUser,
  createTestUsers,
};
