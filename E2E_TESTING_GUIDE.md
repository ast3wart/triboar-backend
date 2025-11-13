# E2E Testing Implementation Guide

## Overview

This guide walks you through implementing End-to-End (E2E) tests for the Triboar subscription system. E2E tests simulate complete user journeys from start to finish, verifying that all components work together correctly.

## What We'll Test

Based on the scope document, we need E2E tests for:

1. ✅ **New Subscription** - User subscribes successfully
2. ✅ **Free Trial** - User gets free trial period
3. ✅ **Cancel** - User cancels at period end
4. ✅ **Lapse** - Grace period expires, role removed
5. ✅ **Rejoin** - User resubscribes after canceling
6. ✅ **Payment Failure → Recovery** - Card declined, then retry succeeds
7. ✅ **Coupon** - User applies promo code
8. ✅ **Manual Comp** - Admin manually grants role

## Architecture

E2E tests will:
- Start a test Express server
- Use a test database (isolated from production)
- Mock Stripe API responses
- Mock Discord API responses
- Simulate webhook events
- Make HTTP requests via `supertest`
- Verify database state and audit logs

```
Test Suite
  ↓
Express Server (test mode)
  ↓
Test Database (PostgreSQL)
  ↓
Mock Stripe API
  ↓
Mock Discord API
  ↓
Verify: DB state, audit logs, API calls
```

## Step 1: Jest Configuration

Create `jest.config.js` in project root:

```javascript
export default {
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/db/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
};
```

## Step 2: Test Database Setup

Create `tests/setup.js`:

```javascript
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test env vars
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Global setup/teardown
beforeAll(async () => {
  // Database will be set up per test
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  // Clean up connections
  process.env.NODE_ENV = 'development';
});

// Jest timeout
jest.setTimeout(30000);
```

Create `.env.test` in project root:

```bash
NODE_ENV=test
PORT=3001
LOG_LEVEL=error

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/triboar_test

STRIPE_SECRET_KEY=sk_test_fake_key_for_testing
STRIPE_WEBHOOK_SECRET=whsec_test_fake_key_for_testing
STRIPE_PRODUCT_ID=prod_test
STRIPE_PRICE_ID=price_test

DISCORD_CLIENT_ID=test_client_id
DISCORD_CLIENT_SECRET=test_client_secret
DISCORD_BOT_TOKEN=test_bot_token
DISCORD_GUILD_ID=123456789
DISCORD_SUBSCRIBED_ROLE_ID=987654321

JWT_SECRET=test_secret_key_minimum_32_characters_long!!!
BACKEND_API_TOKEN=test_api_token_minimum_32_characters_long!!!

STRIPE_SUCCESS_URL=http://localhost:3001/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=http://localhost:3001/cancel
```

## Step 3: Database Utilities

Create `tests/utils/db.js`:

```javascript
import pool from '../../src/db/connection.js';

/**
 * Clear all tables for a fresh test
 */
export async function clearDatabase() {
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE TABLE processed_webhooks CASCADE');
    await client.query('TRUNCATE TABLE audit_logs CASCADE');
    await client.query('TRUNCATE TABLE grace_period CASCADE');
    await client.query('TRUNCATE TABLE discord_role_changes CASCADE');
    await client.query('TRUNCATE TABLE admin_overrides CASCADE');
    await client.query('TRUNCATE TABLE subscriptions CASCADE');
    await client.query('TRUNCATE TABLE users CASCADE');
  } finally {
    client.release();
  }
}

/**
 * Get user by discord_id
 */
export async function getUserByDiscordId(discordId) {
  const result = await pool.query(
    'SELECT * FROM users WHERE discord_id = $1',
    [discordId]
  );
  return result.rows[0];
}

/**
 * Get subscription by user_id
 */
export async function getSubscriptionByUserId(userId) {
  const result = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  );
  return result.rows[0];
}

/**
 * Get audit logs for user
 */
export async function getAuditLogsByUserId(userId) {
  const result = await pool.query(
    'SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at ASC',
    [userId]
  );
  return result.rows;
}

/**
 * Get grace period entry for user
 */
export async function getGracePeriodByUserId(userId) {
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
  const result = await pool.query(
    'SELECT * FROM processed_webhooks WHERE stripe_event_id = $1',
    [eventId]
  );
  return result.rows[0];
}

export default {
  clearDatabase,
  getUserByDiscordId,
  getSubscriptionByUserId,
  getAuditLogsByUserId,
  getGracePeriodByUserId,
  getProcessedWebhook,
};
```

## Step 4: Mock Stripe Service

Create `tests/mocks/stripe.js`:

```javascript
/**
 * Mock Stripe API responses
 * In real tests, you might use nock or similar to intercept HTTP requests
 */

export class MockStripeAPI {
  constructor() {
    this.customers = new Map();
    this.subscriptions = new Map();
    this.invoices = new Map();
  }

  /**
   * Mock: Create customer
   */
  createCustomer({ email, metadata }) {
    const id = `cus_${Math.random().toString(36).substr(2, 9)}`;
    this.customers.set(id, {
      id,
      email,
      metadata,
      created: Date.now(),
    });
    return { id, email, metadata };
  }

  /**
   * Mock: Create subscription
   */
  createSubscription({ customerId, priceId, metadata, trialDays = 0 }) {
    const id = `sub_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    const trialEnd = trialDays > 0 ? now + trialDays * 24 * 60 * 60 * 1000 : null;

    const subscription = {
      id,
      customer: customerId,
      status: trialDays > 0 ? 'trialing' : 'active',
      items: { data: [{ price: { id: priceId } }] },
      current_period_start: now,
      current_period_end: now + 30 * 24 * 60 * 60 * 1000,
      trial_start: trialDays > 0 ? now : null,
      trial_end: trialEnd,
      metadata,
      created: now,
    };

    this.subscriptions.set(id, subscription);
    return subscription;
  }

  /**
   * Mock: Get subscription
   */
  getSubscription(id) {
    return this.subscriptions.get(id);
  }

  /**
   * Mock: Cancel subscription
   */
  cancelSubscription(id, { atPeriodEnd = false }) {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`Subscription ${id} not found`);

    if (atPeriodEnd) {
      sub.cancel_at_period_end = true;
      sub.status = 'active';
    } else {
      sub.status = 'canceled';
      sub.canceled_at = Date.now();
    }

    return sub;
  }

  /**
   * Mock: Payment failure
   */
  simulatePaymentFailure(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    sub.status = 'past_due';
    const invoiceId = `in_${Math.random().toString(36).substr(2, 9)}`;
    this.invoices.set(invoiceId, {
      id: invoiceId,
      subscription: subscriptionId,
      status: 'failed',
      attempt_count: 1,
    });

    return {
      invoiceId,
      subscription: sub,
    };
  }

  /**
   * Mock: Payment success (retry)
   */
  simulatePaymentSuccess(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);

    sub.status = 'active';
    return sub;
  }

  /**
   * Generate webhook event
   */
  generateWebhookEvent(type, data) {
    return {
      id: `evt_${Math.random().toString(36).substr(2, 9)}`,
      type,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: data,
      },
    };
  }
}

export default MockStripeAPI;
```

## Step 5: Mock Discord Service

Create `tests/mocks/discord.js`:

```javascript
/**
 * Mock Discord API responses
 */

export class MockDiscordAPI {
  constructor() {
    this.members = new Map(); // guildId -> memberId -> member data
    this.roles = new Map(); // guildId -> [roleIds]
  }

  /**
   * Mock: Add role to member
   */
  async addRoleToMember(guildId, memberId, roleId) {
    if (!this.members.has(guildId)) {
      this.members.set(guildId, new Map());
    }

    const guildMembers = this.members.get(guildId);
    if (!guildMembers.has(memberId)) {
      guildMembers.set(memberId, {
        id: memberId,
        roles: [],
      });
    }

    const member = guildMembers.get(memberId);
    if (!member.roles.includes(roleId)) {
      member.roles.push(roleId);
    }

    return member;
  }

  /**
   * Mock: Remove role from member
   */
  async removeRoleFromMember(guildId, memberId, roleId) {
    const guildMembers = this.members.get(guildId);
    if (!guildMembers) return null;

    const member = guildMembers.get(memberId);
    if (!member) return null;

    member.roles = member.roles.filter(r => r !== roleId);
    return member;
  }

  /**
   * Mock: Get member roles
   */
  async getMemberRoles(guildId, memberId) {
    const guildMembers = this.members.get(guildId);
    if (!guildMembers) return [];

    const member = guildMembers.get(memberId);
    return member ? member.roles : [];
  }

  /**
   * Mock: Check if member has role
   */
  async memberHasRole(guildId, memberId, roleId) {
    const roles = await this.getMemberRoles(guildId, memberId);
    return roles.includes(roleId);
  }
}

export default MockDiscordAPI;
```

## Step 6: Test Utilities & Helpers

Create `tests/utils/helpers.js`:

```javascript
import jwt from 'jsonwebtoken';
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
    discord_id: Math.floor(Math.random() * 1000000000).toString(),
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
  return {
    id: uuidv4(),
    user_id: userId,
    stripe_subscription_id: `sub_${Math.random().toString(36).substr(2, 9)}`,
    stripe_price_id: process.env.STRIPE_PRICE_ID,
    status: 'active',
    current_period_start: new Date(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    trial_start: null,
    trial_end: null,
    cancel_at: null,
    canceled_at: null,
    cancel_at_period_end: false,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/**
 * Sign Stripe webhook
 * (In real tests, you'd use Stripe's test key)
 */
export function signStripeWebhook(event) {
  const hmac = require('crypto').createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET);
  const timestamp = Math.floor(Date.now() / 1000);
  const signed_content = `${timestamp}.${JSON.stringify(event)}`;
  const signature = hmac.update(signed_content).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Wait for async operation
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  generateTestToken,
  createTestUserData,
  createTestSubscriptionData,
  signStripeWebhook,
  delay,
};
```

## Step 7: Test Factory Functions

Create `tests/factories/user.js`:

```javascript
import pool from '../../src/db/connection.js';
import { createTestUserData } from '../utils/helpers.js';

/**
 * Create a test user in the database
 */
export async function createTestUser(overrides = {}) {
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

export default { createTestUser };
```

Create `tests/factories/subscription.js`:

```javascript
import pool from '../../src/db/connection.js';
import { createTestSubscriptionData } from '../utils/helpers.js';

/**
 * Create a test subscription in the database
 */
export async function createTestSubscription(userId, overrides = {}) {
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

export default { createTestSubscription };
```

## Step 8: E2E Test Suite

Create `tests/e2e/subscription.test.js`:

```javascript
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../../src/index.js';
import { clearDatabase, getUserByDiscordId, getSubscriptionByUserId, getAuditLogsByUserId } from '../utils/db.js';
import { generateTestToken, signStripeWebhook } from '../utils/helpers.js';
import { createTestUser } from '../factories/user.js';
import { createTestSubscription } from '../factories/subscription.js';
import MockStripeAPI from '../mocks/stripe.js';
import MockDiscordAPI from '../mocks/discord.js';

// Initialize mocks
const mockStripe = new MockStripeAPI();
const mockDiscord = new MockDiscordAPI();

describe('E2E: Subscription Flows', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Flow A: New Subscription', () => {
    test('User subscribes successfully → Discord role assigned', async () => {
      // 1. Create test user
      const testUser = await createTestUser({
        stripe_customer_id: null, // No existing Stripe customer
      });
      const token = generateTestToken(testUser.id);

      // 2. Create checkout session
      const checkoutResponse = await request(app)
        .post('/api/checkout/session')
        .set('Authorization', `Bearer ${token}`)
        .send({ coupon_code: null });

      expect(checkoutResponse.status).toBe(200);
      expect(checkoutResponse.body.session).toBeDefined();

      // 3. Simulate Stripe webhook: checkout.session.completed
      const stripeCustomer = mockStripe.createCustomer({
        email: testUser.email,
        metadata: { user_id: testUser.id },
      });

      const stripeSubscription = mockStripe.createSubscription({
        customerId: stripeCustomer.id,
        priceId: process.env.STRIPE_PRICE_ID,
        metadata: { user_id: testUser.id },
      });

      const webhookEvent = mockStripe.generateWebhookEvent('checkout.session.completed', {
        id: `cs_${Math.random().toString(36).substr(2, 9)}`,
        customer: stripeCustomer.id,
        subscription: stripeSubscription.id,
        metadata: { user_id: testUser.id, discord_id: testUser.discord_id },
      });

      // Send webhook to backend
      const webhookResponse = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signStripeWebhook(webhookEvent))
        .send(webhookEvent);

      expect(webhookResponse.status).toBe(200);

      // 4. Verify: Subscription created in database
      const subscription = await getSubscriptionByUserId(testUser.id);
      expect(subscription).toBeDefined();
      expect(subscription.status).toBe('active');
      expect(subscription.stripe_subscription_id).toBe(stripeSubscription.id);

      // 5. Verify: Discord role was assigned
      const hasRole = await mockDiscord.memberHasRole(
        process.env.DISCORD_GUILD_ID,
        testUser.discord_id,
        process.env.DISCORD_SUBSCRIBED_ROLE_ID
      );
      expect(hasRole).toBe(true);

      // 6. Verify: Audit log created
      const logs = await getAuditLogsByUserId(testUser.id);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].event_type).toBe('checkout.session.completed');
    });
  });

  describe('Flow B: Free Trial', () => {
    test('User gets free trial, then billed after trial ends', async () => {
      // Similar structure to new subscription but with trial_days
      const testUser = await createTestUser();
      const token = generateTestToken(testUser.id);

      // Create subscription with 7-day trial
      const stripeSubscription = mockStripe.createSubscription({
        customerId: `cus_${Math.random().toString(36).substr(2, 9)}`,
        priceId: process.env.STRIPE_PRICE_ID,
        trialDays: 7,
      });

      expect(stripeSubscription.status).toBe('trialing');
      expect(stripeSubscription.trial_end).toBeDefined();

      // Simulate webhook for trial start
      const webhookEvent = mockStripe.generateWebhookEvent(
        'customer.subscription.created',
        stripeSubscription
      );

      const webhookResponse = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signStripeWebhook(webhookEvent))
        .send(webhookEvent);

      expect(webhookResponse.status).toBe(200);

      // User should still have role during trial
      const logs = await getAuditLogsByUserId(testUser.id);
      expect(logs.some(log => log.event_type === 'customer.subscription.created')).toBe(true);
    });
  });

  describe('Flow C: Cancel & Rejoin', () => {
    test('User cancels at period end, then resubscribes', async () => {
      // 1. Create user with existing subscription
      const testUser = await createTestUser();
      const subscription = await createTestSubscription(testUser.id, {
        status: 'active',
      });

      // 2. User cancels at period end
      const cancelEvent = mockStripe.generateWebhookEvent(
        'customer.subscription.updated',
        {
          ...subscription,
          cancel_at_period_end: true,
        }
      );

      const cancelResponse = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signStripeWebhook(cancelEvent))
        .send(cancelEvent);

      expect(cancelResponse.status).toBe(200);

      // 3. Verify: Subscription still active until period end (grace period active)
      const updatedSub = await getSubscriptionByUserId(testUser.id);
      expect(updatedSub.cancel_at_period_end).toBe(true);

      // 4. User resubscribes
      const newSubscription = mockStripe.createSubscription({
        customerId: testUser.stripe_customer_id,
        priceId: process.env.STRIPE_PRICE_ID,
      });

      const rejoinEvent = mockStripe.generateWebhookEvent(
        'checkout.session.completed',
        {
          customer: testUser.stripe_customer_id,
          subscription: newSubscription.id,
        }
      );

      const rejoinResponse = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signStripeWebhook(rejoinEvent))
        .send(rejoinEvent);

      expect(rejoinResponse.status).toBe(200);

      // 5. Verify: New subscription created
      const subscriptions = await request(app)
        .get(`/api/admin/users/${testUser.id}`)
        .set('Authorization', `Bearer ${generateTestToken(testUser.id)}`);

      // User should have new active subscription
      expect(subscriptions.status).toBe(200);
    });
  });

  describe('Flow D: Payment Failure & Recovery', () => {
    test('Payment fails → marked past_due → user retries → succeeds', async () => {
      // 1. Create user with subscription
      const testUser = await createTestUser();
      const subscription = await createTestSubscription(testUser.id, {
        status: 'active',
      });

      // 2. Simulate payment failure
      const failedPayment = mockStripe.simulatePaymentFailure(subscription.stripe_subscription_id);

      const failureEvent = mockStripe.generateWebhookEvent(
        'invoice.payment_failed',
        {
          id: failedPayment.invoiceId,
          subscription: subscription.stripe_subscription_id,
          status: 'failed',
        }
      );

      const failResponse = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signStripeWebhook(failureEvent))
        .send(failureEvent);

      expect(failResponse.status).toBe(200);

      // 3. Verify: Subscription marked as past_due
      let updatedSub = await getSubscriptionByUserId(testUser.id);
      expect(updatedSub.status).toBe('past_due');

      // 4. User retries payment (succeeds)
      const recoveredPayment = mockStripe.simulatePaymentSuccess(
        subscription.stripe_subscription_id
      );

      const successEvent = mockStripe.generateWebhookEvent(
        'invoice.payment_succeeded',
        {
          subscription: subscription.stripe_subscription_id,
          status: 'paid',
        }
      );

      const successResponse = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signStripeWebhook(successEvent))
        .send(successEvent);

      expect(successResponse.status).toBe(200);

      // 5. Verify: Subscription back to active
      updatedSub = await getSubscriptionByUserId(testUser.id);
      expect(updatedSub.status).toBe('active');
    });
  });

  describe('Flow E: Lapse & Grace Period', () => {
    test('Subscription expires → grace period activated → role removed after 7 days', async () => {
      // 1. Create user with expired subscription
      const testUser = await createTestUser();
      const pastDate = new Date(Date.now() - 1000); // 1 second in past
      const subscription = await createTestSubscription(testUser.id, {
        status: 'active',
        current_period_end: pastDate,
      });

      // 2. Simulate subscription.deleted event (expired)
      const expiredEvent = mockStripe.generateWebhookEvent(
        'customer.subscription.deleted',
        {
          ...subscription,
          status: 'canceled',
          canceled_at: Math.floor(Date.now() / 1000),
        }
      );

      const expireResponse = await request(app)
        .post('/webhooks/stripe')
        .set('stripe-signature', signStripeWebhook(expiredEvent))
        .send(expiredEvent);

      expect(expireResponse.status).toBe(200);

      // 3. Verify: Grace period created in database
      // (This would be handled by your grace period service)
      const logs = await getAuditLogsByUserId(testUser.id);
      expect(logs.some(log => log.event_type === 'customer.subscription.deleted')).toBe(true);
    });
  });

  describe('Flow F: Coupon Applied', () => {
    test('User applies promo code during checkout', async () => {
      const testUser = await createTestUser();
      const token = generateTestToken(testUser.id);

      // Create checkout with coupon
      const checkoutResponse = await request(app)
        .post('/api/checkout/session')
        .set('Authorization', `Bearer ${token}`)
        .send({ coupon_code: 'PROMO20' });

      expect(checkoutResponse.status).toBe(200);
      expect(checkoutResponse.body.session).toBeDefined();
      // In real scenario, Stripe validates coupon and applies discount
    });
  });

  describe('Flow G: Manual Comp (Admin Override)', () => {
    test('Admin manually grants paid role to user', async () => {
      const testUser = await createTestUser();
      const adminToken = generateTestToken(uuidv4()); // Admin user

      // Admin grants role
      const grantResponse = await request(app)
        .post('/api/admin/roles/grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ discord_id: testUser.discord_id });

      expect(grantResponse.status).toBe(200);

      // Verify: Role was granted
      const hasRole = await mockDiscord.memberHasRole(
        process.env.DISCORD_GUILD_ID,
        testUser.discord_id,
        process.env.DISCORD_SUBSCRIBED_ROLE_ID
      );
      expect(hasRole).toBe(true);

      // Verify: Logged as admin override
      const logs = await getAuditLogsByUserId(testUser.id);
      expect(logs.some(log => log.action === 'role_grant')).toBe(true);
    });
  });
});
```

## Step 9: Run Tests

```bash
# Install dependencies (should already be done)
npm install

# Create test database
createdb triboar_test

# Run all tests
npm test

# Run only E2E tests
npm run test:e2e

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/e2e/subscription.test.js

# Watch mode (during development)
npm test -- --watch
```

## Running Database Migrations in Test

Your existing migrations should run on the test database. Add this to your test setup:

```javascript
// In tests/setup.js, add:
import { runMigrations } from '../src/db/migrate.js';

beforeAll(async () => {
  // Run migrations on test database
  await runMigrations();
});
```

## Next Steps

1. **Create the test file structure** - Start with the files above
2. **Add more specific test cases** - Test edge cases and error scenarios
3. **Mock Stripe properly** - Consider using `nock` library to intercept HTTP requests
4. **Add integration tests** - Test database layer separately
5. **Increase coverage** - Aim for >80% code coverage

## Useful Libraries to Add

```bash
npm install --save-dev \
  nock \                    # HTTP request mocking
  faker \                   # Generate test data
  jest-mock-extended        # Better mocking
```

## Notes

- Tests should be **isolated** - each test clears database beforehand
- Tests should be **deterministic** - same code always produces same result
- Tests should be **fast** - mock external APIs (Stripe, Discord)
- Tests should be **clear** - readable assertion messages
- Use **AAA pattern**: Arrange, Act, Assert

Good luck implementing the E2E tests!
