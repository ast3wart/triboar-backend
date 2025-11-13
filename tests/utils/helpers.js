import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate JWT token for testing
 */
export function generateTestToken(userId) {
  return jwt.sign(
    { userId, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Create test user object
 */
export function createTestUserData(overrides = {}) {
  return {
    id: uuidv4(),
    email: `test_${Math.random().toString(36).substr(2, 9)}@example.com`,
    discord_id: Math.floor(Math.random() * 1000000000000).toString(),
    discord_username: `testuser_${Math.random().toString(36).substr(2, 5)}`,
    stripe_customer_id: `cus_${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Create test subscription object
 */
export function createTestSubscriptionData(userId, overrides = {}) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    id: uuidv4(),
    user_id: userId,
    stripe_subscription_id: `sub_${Math.random().toString(36).substr(2, 9)}`,
    stripe_price_id: process.env.STRIPE_PRICE_ID || 'price_test',
    status: 'active',
    current_period_start: now,
    current_period_end: thirtyDaysFromNow,
    trial_start: null,
    trial_end: null,
    cancel_at: null,
    canceled_at: null,
    cancel_at_period_end: false,
    metadata: {},
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

/**
 * Sign Stripe webhook using test secret
 */
export function signStripeWebhook(event) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed_content = `${timestamp}.${JSON.stringify(event)}`;
  const signature = crypto
    .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(signed_content)
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

/**
 * Create a Stripe webhook event object
 */
export function createStripeWebhookEvent(type, data) {
  return {
    id: `evt_${Math.random().toString(36).substr(2, 9)}`,
    object: 'event',
    api_version: '2023-10-16',
    created: Math.floor(Date.now() / 1000),
    type,
    data: {
      object: data,
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
  };
}

/**
 * Wait for async operation
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random Discord user ID
 */
export function generateDiscordId() {
  return Math.floor(Math.random() * 9000000000000000000).toString();
}

/**
 * Generate random Stripe customer ID
 */
export function generateStripeCustomerId() {
  return `cus_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate random Stripe subscription ID
 */
export function generateStripeSubscriptionId() {
  return `sub_${Math.random().toString(36).substr(2, 9)}`;
}

export default {
  generateTestToken,
  createTestUserData,
  createTestSubscriptionData,
  signStripeWebhook,
  createStripeWebhookEvent,
  delay,
  generateDiscordId,
  generateStripeCustomerId,
  generateStripeSubscriptionId,
};
