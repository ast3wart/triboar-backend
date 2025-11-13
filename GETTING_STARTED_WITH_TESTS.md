# Getting Started with E2E Tests - Quick Checklist

## ✅ Pre-Setup (5 minutes)

- [ ] PostgreSQL is installed and running
- [ ] Node.js 16+ is installed
- [ ] You're in the `triboar-backend` directory

## ✅ One-Time Setup (5 minutes)

```bash
# 1. Create test database
createdb triboar_test

# 2. Verify database was created
psql -l | grep triboar_test
```

Expected output: You should see `triboar_test` in the list of databases.

## ✅ Running Tests (2 minutes)

```bash
# Run all tests
npm test

# Expected output:
# PASS  tests/e2e/subscription.test.js (X.XXXs)
#   E2E: Subscription Flows
#     Flow A: New Subscription
#       ✓ User subscribes successfully...
#       ✓ User without existing Stripe customer...
#     Flow B: Free Trial
#       ✓ User gets free trial period...
#     ... more tests ...
#
# Tests:       20 passed, 20 total
# Time:        X.XXXs
```

## ✅ Other Useful Commands

```bash
# Run only E2E tests
npm run test:e2e

# Run with coverage report
npm test -- --coverage

# Watch mode (re-run on file changes)
npm test -- --watch

# Run specific test file
npm test -- tests/e2e/subscription.test.js

# Run tests matching a name
npm test -- --testNamePattern="New Subscription"

# Verbose output
npm test -- --verbose
```

## ✅ Files That Were Created

Core test files:
- [ ] `jest.config.js` - Test configuration
- [ ] `.env.test` - Test environment variables
- [ ] `tests/setup.js` - Global test setup

Utilities:
- [ ] `tests/utils/db.js` - Database helpers
- [ ] `tests/utils/helpers.js` - Test helpers

Mocks:
- [ ] `tests/mocks/stripe.js` - Mock Stripe
- [ ] `tests/mocks/discord.js` - Mock Discord

Test Data:
- [ ] `tests/factories/user.js` - Create test users
- [ ] `tests/factories/subscription.js` - Create test subscriptions

Tests:
- [ ] `tests/e2e/subscription.test.js` - Main test suite

Documentation:
- [ ] `TESTING.md` - Complete testing guide
- [ ] `E2E_TESTING_GUIDE.md` - Detailed setup guide
- [ ] `IMPLEMENTATION_SUMMARY.md` - Overview of what was created
- [ ] `GETTING_STARTED_WITH_TESTS.md` - This file

Updated:
- [ ] `README.md` - Updated with testing info

## ✅ Troubleshooting

### Problem: Tests won't start

```bash
# Is PostgreSQL running?
# macOS:
brew services list
# Should show: postgresql Started

# If not running:
brew services start postgresql
```

### Problem: "Database does not exist"

```bash
# Create test database
createdb triboar_test

# Verify it was created
psql -l | grep triboar_test
```

### Problem: Tests hang forever

```bash
# Kill hung processes
pkill -f postgres

# Wait a few seconds, then try again
npm test
```

### Problem: "BACKEND_API_TOKEN is required"

Check `.env.test` exists and has the token:
```bash
cat .env.test | grep BACKEND_API_TOKEN
```

Should show: `BACKEND_API_TOKEN=test_api_token_minimum_32_characters_long!!!`

## ✅ What the Tests Do

Tests verify your subscription system works end-to-end:

**Flow A: New Subscription** ✅
- User subscribes via checkout
- Subscription created in database
- Audit log recorded

**Flow B: Free Trial** ✅
- User gets 7-day trial
- Transitions to paid after trial

**Flow C: Cancel & Rejoin** ✅
- User can cancel subscription
- User can resubscribe later

**Flow D: Payment Failure** ✅
- Failed payment handled
- User can retry and succeed

**Flow E: Expiration** ✅
- Subscription expiration processed
- Grace period entered

**Flow F: Coupon** ✅
- Promo codes accepted at checkout

**Flow G: Admin Override** ✅
- Admin can manually grant/remove roles

**Plus**: Webhook security, error handling, etc.

## ✅ Understanding Test Output

```
PASS  tests/e2e/subscription.test.js
  E2E: Subscription Flows
    Flow A: New Subscription
      ✓ User subscribes successfully (45ms)
      ✓ User without existing Stripe customer (32ms)
    Flow B: Free Trial
      ✓ User gets free trial period (38ms)
      ✓ Trial end webhook transitions to billing (42ms)
```

Explanation:
- `PASS` = All tests in this file passed
- `✓` = Test passed
- `(45ms)` = How long test took
- Test name = What was tested

## ✅ Next Steps

### Option A: Just Run Tests
```bash
createdb triboar_test
npm test
```

That's it! You're done.

### Option B: Understand How Tests Work
Read `TESTING.md` for:
- Test structure
- How to write new tests
- Mocking strategy

### Option C: Write More Tests
Add test cases for:
- Edge cases
- Error scenarios
- Additional flows

See `TESTING.md` > "Writing New Tests" for examples.

### Option D: Add to CI/CD
Integrate tests into GitHub Actions, GitLab CI, etc.

See `TESTING.md` > "Continuous Integration" for example.

## ✅ File Structure

```
triboar-backend/
├── jest.config.js              ← Test configuration
├── .env.test                   ← Test environment variables
├── TESTING.md                  ← Complete testing guide
├── E2E_TESTING_GUIDE.md        ← Detailed guide
├── IMPLEMENTATION_SUMMARY.md   ← What was created
├── GETTING_STARTED_WITH_TESTS.md ← This file
├── tests/
│   ├── setup.js                ← Global setup
│   ├── e2e/
│   │   └── subscription.test.js ← Main test suite (20 tests)
│   ├── mocks/
│   │   ├── stripe.js           ← Mock Stripe API
│   │   └── discord.js          ← Mock Discord API
│   ├── factories/
│   │   ├── user.js             ← Create test users
│   │   └── subscription.js     ← Create test subscriptions
│   └── utils/
│       ├── db.js               ← Database helpers
│       └── helpers.js          ← Test utilities
└── src/                        ← Your actual code
```

## ✅ Commands Quick Reference

```bash
# Setup
createdb triboar_test

# Run tests
npm test                          # All tests
npm run test:e2e                  # E2E only
npm test -- --coverage            # With coverage
npm test -- --watch               # Watch mode

# Debug
npm test -- --verbose             # Detailed output
npm test -- --bail                # Stop on first failure
npm test -- tests/e2e/subscription.test.js  # Specific file
```

## ✅ Success Criteria

You've successfully set up E2E tests when:

1. ✅ `createdb triboar_test` runs without error
2. ✅ `npm test` runs without database errors
3. ✅ You see "Tests: X passed, X total"
4. ✅ All tests show ✓ (checkmark)
5. ✅ Output ends with "Test Suites: 1 passed, 1 total"

## ✅ Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "connect ECONNREFUSED" | Start PostgreSQL: `brew services start postgresql` |
| "database does not exist" | Create test DB: `createdb triboar_test` |
| "BACKEND_API_TOKEN is required" | Check `.env.test` has the token |
| Tests hang forever | Kill hung process: `pkill -f postgres` |
| "jest: command not found" | Install deps: `npm install` |
| Permission denied | Check PostgreSQL user permissions |

## ✅ That's It!

You now have a complete E2E test suite.

```bash
# To run tests:
npm test

# To see coverage:
npm test -- --coverage

# To watch for changes:
npm test -- --watch
```

### Need Help?
- Detailed guide: See `TESTING.md`
- Setup help: See `E2E_TESTING_GUIDE.md`
- What was created: See `IMPLEMENTATION_SUMMARY.md`

### Ready to Go! 🚀

Everything is set up and ready to use. No additional configuration needed.

```bash
createdb triboar_test
npm test
```

Done!
