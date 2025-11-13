# Triboar Backend - Stripe Subscription + Discord Role Automation

A Node.js/Express backend service that handles subscription payments via Stripe and automatically manages Discord roles for paying members.

## Features

- ✅ Stripe subscription checkout and billing
- ✅ Automatic Discord role assignment/removal
- ✅ Free trials, grace periods, and rejoin flows
- ✅ Payment failure handling with dunning
- ✅ Admin tools for manual overrides
- ✅ Complete audit logging
- ✅ Webhook idempotency
- ✅ Comprehensive E2E test suite

## Quick Start

### Prerequisites

- Node.js 16+
- PostgreSQL 12+
- Discord bot token with role management permissions
- Stripe API keys (test mode for development)

### Installation

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your Stripe, Discord, and database credentials

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

Server runs at `http://localhost:3000`

## Documentation

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - Complete setup instructions
- **[QUICK_START.md](./QUICK_START.md)** - Quick reference guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture overview
- **[TESTING.md](./TESTING.md)** - How to run tests
- **[E2E_TESTING_GUIDE.md](./E2E_TESTING_GUIDE.md)** - E2E testing details

## Running Tests

### Create Test Database
```bash
createdb triboar_test
```

### Run Tests
```bash
# All tests
npm test

# E2E tests only
npm run test:e2e

# Unit tests only
npm run test:unit

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Project Structure

```
src/
├── api/
│   ├── routes/          # API endpoint definitions
│   └── middleware/      # Auth, error handling, etc.
├── services/            # Business logic
├── db/
│   ├── connection.js    # Database pool
│   ├── migrate.js       # Migration runner
│   └── migrations/      # SQL migrations
└── utils/               # Helpers, logging

tests/
├── e2e/                 # End-to-end tests
├── mocks/               # Mock Stripe, Discord APIs
├── factories/           # Test data factories
└── utils/               # Test helpers
```

## API Endpoints

### Public
- `GET /health` - Health check

### Authentication
- `GET /api/auth/discord` - Discord OAuth redirect
- `GET /api/auth/discord/callback` - OAuth callback handler

### Webhooks
- `POST /webhooks/stripe` - Stripe webhook receiver

### Checkout (requires JWT)
- `POST /api/checkout/session` - Create checkout session
- `POST /api/checkout/portal` - Create billing portal session

### Admin (requires JWT + admin role)
- `GET /api/admin/users/search` - Search users
- `GET /api/admin/users/:userId` - Get user details
- `POST /api/admin/roles/grant` - Grant paid role
- `POST /api/admin/roles/remove` - Remove paid role
- `POST /api/admin/reconcile` - Sync Discord roles
- `GET /api/admin/audit-logs` - View audit logs
- `GET /api/admin/subscribers` - List active subscribers
- `GET /api/admin/grace-period` - Grace period users
- `POST /api/admin/grace-period/*` - Manage grace periods

### Lists (for RoleBot)
- `GET /api/lists/subscribed` - Active subscribers
- `GET /api/lists/grace` - Grace period users

## Environment Variables

See `.env.test` for all required variables. Key variables:

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_ID=price_...

# Discord
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_SUBSCRIBED_ROLE_ID=...

# Database
DATABASE_URL=postgresql://...

# Security
JWT_SECRET=... (min 32 chars)
BACKEND_API_TOKEN=... (min 32 chars)
```

## Stripe Webhooks

Backend processes these Stripe events:

- `checkout.session.completed` - User paid successfully
- `customer.subscription.created` - Subscription created
- `customer.subscription.updated` - Subscription status changed
- `customer.subscription.deleted` - Subscription ended
- `invoice.payment_succeeded` - Payment successful
- `invoice.payment_failed` - Payment failed

## Database Schema

Tables:
- `users` - User accounts linked to Stripe and Discord
- `subscriptions` - Stripe subscription tracking
- `grace_period` - Post-expiration grace period tracking
- `audit_logs` - All events and state changes
- `discord_role_changes` - Role operation audit trail
- `processed_webhooks` - Idempotency tracking

Migrations are in `src/db/migrations/`

## Development

```bash
# Start with hot reload
npm run dev

# Run migrations
npm run migrate

# Undo last migration
npm run migrate:undo

# Lint code
npm run lint
```

## Testing

This project includes comprehensive E2E tests covering:

- New subscription flow
- Free trial handling
- Cancellation and rejoin
- Payment failure and recovery
- Subscription expiration (lapse)
- Coupon application
- Manual admin comping

See [TESTING.md](./TESTING.md) for details.

## Deployment

See [SETUP_GUIDE.md](./SETUP_GUIDE.md#deployment) for production deployment steps.

## Related Projects

- **[triboar-site](https://github.com/ast3wart/triboar-site)** - Frontend website
- **[triboar-rolebot](https://github.com/ast3wart/triboar-rolebot)** - Discord bot for role management

## License

MIT
