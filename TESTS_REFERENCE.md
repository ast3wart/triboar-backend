# E2E Tests - Quick Reference Card

## One-Time Setup

```bash
# Create test database
createdb triboar_test
```

## Run Tests

```bash
# All tests
npm test

# E2E tests only
npm run test:e2e

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific test file
npm test -- tests/e2e/subscription.test.js

# Specific test by name pattern
npm test -- --testNamePattern="New Subscription"

# Verbose output
npm test -- --verbose

# Stop on first failure
npm test -- --bail
```

## Test Structure

All tests use **AAA pattern**:
1. **Arrange** - Set up test data
2. **Act** - Call the API/webhook
3. **Assert** - Verify the result

Example:
```javascript
test('User subscribes successfully', async () => {
  // ARRANGE
  const user = await createTestUser();

  // ACT
  const response = await request(app).post('/api/checkout/session');

  // ASSERT
  expect(response.status).toBe(200);
});
```

## Test Files Overview

| File | Purpose | Includes |
|------|---------|----------|
| `tests/e2e/subscription.test.js` | Main test suite | All 8 flow tests + extras |
| `tests/mocks/stripe.js` | Stripe simulator | Customer, subscription, invoice |
| `tests/mocks/discord.js` | Discord simulator | Role management, DMs |
| `tests/factories/user.js` | Create test users | `createTestUser()` |
| `tests/factories/subscription.js` | Create test subs | `createTestSubscription()` |
| `tests/utils/db.js` | Query test DB | Get users, subs, logs |
| `tests/utils/helpers.js` | Test helpers | Token gen, webhook signing |

## Commonly Used Functions

### Factories
```javascript
// Create test user
const user = await createTestUser({ email: 'test@example.com' });

// Create test subscription
const sub = await createTestSubscription(userId, { status: 'active' });
```

### Database Helpers
```javascript
// Get user by Discord ID
const user = await getUserByDiscordId('123456789');

// Get subscription
const sub = await getSubscriptionByUserId(userId);

// Get audit logs
const logs = await getAuditLogsByUserId(userId);

// Clear all test data
await clearDatabase();
```

### Test Utilities
```javascript
// Generate JWT token
const token = generateTestToken(userId);

// Create webhook event
const event = createStripeWebhookEvent('checkout.session.completed', {
  id: 'cs_test',
  customer: 'cus_test',
});

// Sign webhook (for signature verification)
const signature = signStripeWebhook(event);
```

### Mocks
```javascript
// Create Stripe customer
const customer = mockStripe.createCustomer({ email: 'user@example.com' });

// Create Stripe subscription
const sub = mockStripe.createSubscription({
  customerId: customer.id,
  priceId: process.env.STRIPE_PRICE_ID,
  trialDays: 7,
});

// Add Discord role
await mockDiscord.addRoleToMember(guildId, memberId, roleId);

// Check if member has role
const hasRole = await mockDiscord.memberHasRole(guildId, memberId, roleId);
```

## Making HTTP Requests in Tests

```javascript
import request from 'supertest';

// POST request with auth
const response = await request(app)
  .post('/api/checkout/session')
  .set('Authorization', `Bearer ${token}`)
  .send({ coupon_code: 'PROMO20' });

// Verify response
expect(response.status).toBe(200);
expect(response.body.session).toBeDefined();
```

## Sending Webhooks in Tests

```javascript
// Create event
const event = createStripeWebhookEvent('checkout.session.completed', {
  id: 'cs_test',
  customer: 'cus_test',
});

// Sign it
const signature = signStripeWebhook(event);

// Send to backend
const response = await request(app)
  .post('/webhooks/stripe')
  .set('stripe-signature', signature)
  .send(event);

expect(response.status).toBe(200);
```

## Verifying Database Changes

```javascript
// After an action, verify database was updated
const subscription = await getSubscriptionByUserId(userId);

expect(subscription).toBeDefined();
expect(subscription.status).toBe('active');
expect(subscription.stripe_subscription_id).toBe(stripeSubId);
```

## Test Files Created

### Configuration
- `jest.config.js` - Jest configuration
- `.env.test` - Test environment variables
- `tests/setup.js` - Global setup

### Mocks
- `tests/mocks/stripe.js` - Mock Stripe API
- `tests/mocks/discord.js` - Mock Discord API

### Utilities
- `tests/utils/db.js` - Database queries
- `tests/utils/helpers.js` - Test helpers

### Factories
- `tests/factories/user.js` - User factory
- `tests/factories/subscription.js` - Subscription factory

### Tests
- `tests/e2e/subscription.test.js` - Main test suite (~20 tests)

### Documentation
- `TESTING.md` - Complete guide
- `E2E_TESTING_GUIDE.md` - Detailed setup
- `IMPLEMENTATION_SUMMARY.md` - What was created
- `GETTING_STARTED_WITH_TESTS.md` - Quick start
- `TESTS_REFERENCE.md` - This file

## Common Assertions

```javascript
// HTTP responses
expect(response.status).toBe(200);
expect(response.body).toBeDefined();
expect(response.body.session).toBeDefined();

// Database state
expect(subscription).toBeDefined();
expect(subscription.status).toBe('active');

// Arrays
expect(logs.length).toBeGreaterThan(0);
expect(logs).toContainEqual({ event_type: 'checkout.session.completed' });

// Booleans
expect(hasRole).toBe(true);

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
```

## Debugging Tests

```bash
# Add console logs to test
console.log('User:', user);
console.log('Subscription:', subscription);

# Run with verbose output
npm test -- --verbose

# Stop on first failure
npm test -- --bail

# Run specific test
npm test -- --testNamePattern="New Subscription"

# Watch mode during development
npm test -- --watch
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "database does not exist" | `createdb triboar_test` |
| "ECONNREFUSED" | Start PostgreSQL: `brew services start postgresql` |
| Tests hang | Kill: `pkill -f postgres` |
| "jest: command not found" | Install: `npm install` |
| Permission denied | Check PostgreSQL user |

## Writing a New Test

```javascript
test('my new test', async () => {
  // ARRANGE: Set up data
  const user = await createTestUser();

  // ACT: Do something
  const response = await request(app)
    .post('/api/endpoint')
    .set('Authorization', `Bearer ${generateTestToken(user.id)}`)
    .send({ data: 'value' });

  // ASSERT: Verify result
  expect(response.status).toBe(200);

  // Verify database changes
  const updated = await getUserById(user.id);
  expect(updated.some_field).toBe('expected_value');
});
```

## Test Database

- Name: `triboar_test`
- Host: `localhost`
- User: postgres (or your configured user)
- Password: postgres (or your configured password)
- Port: 5432

Cleared before each test automatically.

## Environment Variables in Tests

See `.env.test` for all test variables. Key ones:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/triboar_test
STRIPE_SECRET_KEY=sk_test_fake_key_for_testing
STRIPE_PRICE_ID=price_test
DISCORD_GUILD_ID=123456789
JWT_SECRET=test_secret_key_minimum_32_characters_long!!!
BACKEND_API_TOKEN=test_api_token_minimum_32_characters_long!!!
```

## Expected Test Output

```
PASS  tests/e2e/subscription.test.js
  E2E: Subscription Flows
    Flow A: New Subscription
      ✓ User subscribes successfully (45ms)
      ✓ User without existing Stripe customer (32ms)
    ... more tests ...

Tests:       20 passed, 20 total
Time:        4.523s
Snapshots:   0 total
Ran all test suites.
```

## Tips

1. **Keep tests focused** - One assertion per test when possible
2. **Use meaningful names** - Test names explain what is being tested
3. **Test complete flows** - Don't test individual functions in isolation
4. **Mock external APIs** - Stripe, Discord, etc.
5. **Use factories** - Create test data consistently
6. **Clear database** - Start with clean state
7. **Verify side effects** - Check database, audit logs, API calls

## Resources

- Jest docs: https://jestjs.io/
- Supertest docs: https://github.com/visionmedia/supertest
- Testing best practices: https://testingjavascript.com/

---

**Need help?** Check `TESTING.md` for the complete guide.
