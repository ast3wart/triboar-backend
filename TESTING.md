# Testing Guide - Triboar Backend

This guide explains how to run the E2E (End-to-End) test suite for the Triboar subscription system.

## Quick Start

```bash
# 1. Create test database (one-time setup)
createdb triboar_test

# 2. Run all tests
npm test

# 3. Run only E2E tests
npm run test:e2e

# 4. Run with coverage report
npm test -- --coverage

# 5. Watch mode (auto-re-run on file changes)
npm test -- --watch
```

## Test Environment Setup

### Prerequisites

- PostgreSQL installed and running
- Node.js 16+ installed
- All npm dependencies installed (`npm install`)

### Database Setup

Before running tests, you need to create a test database:

```bash
# Create test database
createdb triboar_test

# (Optional) Drop test database if needed
dropdb triboar_test
```

The test database will be automatically set up with migrations from your `src/db/migrations/` directory on test startup.

### Environment Variables

Tests use `.env.test` file for configuration. This file contains test-specific values and should NOT be used for production.

Current test configuration:
- Database: `triboar_test` (local PostgreSQL)
- Stripe: Test mode with fake keys
- Discord: Mocked (no real API calls)
- JWT Secret: Test-only secret
- API Token: Test-only token

## Running Tests

### All Tests
```bash
npm test
```
Runs all test files matching `**/*.test.js` or `**/*.spec.js`

### E2E Tests Only
```bash
npm run test:e2e
```
Runs only E2E tests in `tests/e2e/` directory

### Unit Tests Only
```bash
npm run test:unit
```
Runs only unit tests in `tests/unit/` directory

### Specific Test File
```bash
npm test -- tests/e2e/subscription.test.js
```

### Watch Mode
```bash
npm test -- --watch
```
Re-runs tests whenever files change (useful during development)

### With Coverage Report
```bash
npm test -- --coverage
```
Generates coverage report showing:
- Line coverage
- Branch coverage
- Function coverage
- Uncovered lines

Current coverage threshold:
- Lines: 30%
- Functions: 30%
- Branches: 30%

## Test Structure

### Directory Layout
```
tests/
├── e2e/
│   └── subscription.test.js         # E2E test suite (8 flows)
├── unit/                            # Unit tests (optional)
├── mocks/
│   ├── stripe.js                    # Mock Stripe API
│   └── discord.js                   # Mock Discord API
├── factories/
│   ├── user.js                      # Test user factory
│   └── subscription.js              # Test subscription factory
├── utils/
│   ├── db.js                        # Database helpers
│   └── helpers.js                   # Test utilities
└── setup.js                         # Global test setup
```

### Test Categories

#### E2E Tests (tests/e2e/subscription.test.js)

Tests complete user journeys for all 8 required flows:

1. **Flow A: New Subscription**
   - User subscribes successfully
   - Discord role assigned
   - Audit log created

2. **Flow B: Free Trial**
   - User gets free trial period
   - Trial transitions to billing

3. **Flow C: Cancel & Rejoin**
   - User cancels at period end
   - User resubscribes after canceling

4. **Flow D: Payment Failure & Recovery**
   - Payment fails → past_due
   - Payment retry succeeds → active

5. **Flow E: Subscription Expiration**
   - Subscription ends
   - Webhook processed

6. **Flow F: Coupon Applied**
   - User applies promo code
   - Checkout accepts coupon parameter

7. **Flow G: Manual Comp**
   - Admin grants role manually
   - Admin removes role manually

8. **Additional Tests**
   - Webhook idempotency
   - Health check
   - Error handling

## Mocking Strategy

### Why Mock Stripe & Discord?

- ✅ **Speed**: Tests run in milliseconds, not seconds
- ✅ **Cost**: No real API calls = no cost
- ✅ **Reliability**: No network failures or rate limiting
- ✅ **Isolation**: Tests don't affect real systems
- ✅ **Repeatability**: Same test always produces same result

### Mock Stripe API

Location: `tests/mocks/stripe.js`

Provides:
- `createCustomer()` - Simulate Stripe customer creation
- `createSubscription()` - Simulate subscription creation
- `cancelSubscription()` - Simulate cancellation
- `simulatePaymentFailure()` - Simulate payment failure
- `simulatePaymentSuccess()` - Simulate payment recovery
- `generateWebhookEvent()` - Create fake Stripe webhook events

### Mock Discord API

Location: `tests/mocks/discord.js`

Provides:
- `addRoleToMember()` - Simulate role addition
- `removeRoleFromMember()` - Simulate role removal
- `getMemberRoles()` - Get member's current roles
- `memberHasRole()` - Check if member has role
- `sendDM()` - Simulate sending DM to user

### Webhook Simulation

Tests use `signStripeWebhook()` to simulate real Stripe webhook signatures:

```javascript
// Create a fake webhook event
const webhookEvent = createStripeWebhookEvent('checkout.session.completed', {
  id: 'cs_test',
  customer: 'cus_test',
});

// Sign it with test secret
const signature = signStripeWebhook(webhookEvent);

// Send to backend
const response = await request(app)
  .post('/webhooks/stripe')
  .set('stripe-signature', signature)
  .send(webhookEvent);
```

## Test Data Factories

### User Factory

```javascript
import { createTestUser } from '../factories/user.js';

// Create a test user
const user = await createTestUser({
  discord_username: 'custom_name',
  email: 'custom@example.com',
});

// User has: id, email, discord_id, stripe_customer_id, etc.
console.log(user.id);
console.log(user.discord_id);
console.log(user.stripe_customer_id);
```

### Subscription Factory

```javascript
import { createTestSubscription } from '../factories/subscription.js';

// Create a test subscription for a user
const sub = await createTestSubscription(userId, {
  status: 'active',
  cancel_at_period_end: false,
});

// Subscription has: id, status, current_period_end, etc.
console.log(sub.status);
```

## Database Helpers

### Clear Database

```javascript
import { clearDatabase } from '../utils/db.js';

// Clear all test data between tests
await clearDatabase();
```

### Query Helpers

```javascript
import {
  getUserByDiscordId,
  getSubscriptionByUserId,
  getAuditLogsByUserId
} from '../utils/db.js';

// Get user
const user = await getUserByDiscordId('123456789');

// Get subscription
const sub = await getSubscriptionByUserId(userId);

// Get audit logs
const logs = await getAuditLogsByUserId(userId);
```

## Common Test Patterns

### Testing a Complete Flow

```javascript
test('User subscribes and gets role', async () => {
  // ARRANGE: Set up test data
  const user = await createTestUser();
  const token = generateTestToken(user.id);

  // ACT: Trigger the action
  const response = await request(app)
    .post('/api/checkout/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ coupon_code: null });

  // ASSERT: Verify results
  expect(response.status).toBe(200);
  expect(response.body.session).toBeDefined();
});
```

### Testing Webhook Processing

```javascript
test('Webhook updates subscription', async () => {
  // Create subscription
  const sub = await createTestSubscription(userId);

  // Create fake Stripe webhook
  const webhookEvent = createStripeWebhookEvent('customer.subscription.updated', {
    id: sub.stripe_subscription_id,
    status: 'active',
  });

  // Send webhook with signature
  const response = await request(app)
    .post('/webhooks/stripe')
    .set('stripe-signature', signStripeWebhook(webhookEvent))
    .send(webhookEvent);

  expect(response.status).toBe(200);

  // Verify database was updated
  const updated = await getSubscriptionByUserId(userId);
  expect(updated.status).toBe('active');
});
```

### Testing Error Cases

```javascript
test('Invalid token returns 401', async () => {
  const response = await request(app)
    .post('/api/checkout/session')
    .set('Authorization', 'Bearer invalid_token')
    .send({ coupon_code: null });

  expect(response.status).toBe(401);
});
```

## Troubleshooting

### Tests Fail: "Database does not exist"

```bash
# Create test database
createdb triboar_test
```

### Tests Fail: "connect ECONNREFUSED"

PostgreSQL is not running. Start it:

```bash
# macOS with Homebrew
brew services start postgresql

# Linux with systemd
sudo systemctl start postgresql

# Or start Docker container if using Docker
docker-compose up -d postgres
```

### Tests Fail: "BACKEND_API_TOKEN is required"

The `.env.test` file should have been created. Check it exists in project root:

```bash
ls -la .env.test
```

If missing, create it with content from the guide.

### Tests Hang or Timeout

- Check if database is locked: `psql -l`
- Kill hanging connections: `pkill -f postgres`
- Increase timeout in `jest.config.js`: `testTimeout: 60000`

### Coverage Too Low

Add more test cases to cover uncovered lines. Run:

```bash
npm test -- --coverage
```

This shows which lines are not tested.

## Continuous Integration (CI)

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install
      - run: createdb -h localhost -U postgres triboar_test
      - run: npm test
      - run: npm test -- --coverage
```

## Writing New Tests

### Test File Naming

- E2E tests: `tests/e2e/**.test.js`
- Unit tests: `tests/unit/**.test.js`
- Integration tests: `tests/integration/**.test.js`

### Test File Template

```javascript
import { clearDatabase } from '../utils/db.js';
import { createTestUser } from '../factories/user.js';

describe('Feature Name', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test('should do something', async () => {
    // ARRANGE
    const user = await createTestUser();

    // ACT
    // ... do something

    // ASSERT
    expect(true).toBe(true);
  });
});
```

## Performance Tips

1. **Run tests in serial** (default): `jest --maxWorkers=1`
2. **Use beforeEach** to clean up between tests
3. **Mock expensive operations** (network calls, file I/O)
4. **Avoid real timers** - use fake timers with Jest

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)

## Getting Help

If tests fail:

1. Read the error message carefully
2. Check test file comments
3. Look at similar passing tests
4. Add `console.log()` for debugging
5. Use `--verbose` flag: `npm test -- --verbose`
