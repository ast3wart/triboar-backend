# Triboar Backend Architecture

## Overview

The Triboar backend is now a separate repository handling all subscription, payment, and grace period logic. It serves as the source of truth for subscription state and provides APIs for:
- Discord OAuth authentication
- Stripe payment processing
- Subscription list management
- Grace period management

## Repository Structure

```
triboar-backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.js          # Discord OAuth & Stripe checkout
│   │   │   ├── checkout.js      # Stripe checkout session creation
│   │   │   ├── webhooks.js      # Stripe webhook handlers
│   │   │   ├── admin.js         # Admin/management endpoints
│   │   │   └── lists.js         # **NEW** Subscription & grace period lists
│   │   └── middleware/
│   ├── services/
│   │   ├── discordAuthService.js    # Discord OAuth token exchange
│   │   ├── stripeService.js         # Stripe API interactions
│   │   ├── subscriptionService.js   # Subscription lifecycle
│   │   ├── gracePeriodService.js    # Grace period management
│   │   ├── discordRoleService.js    # Discord role assignment
│   │   ├── webhookService.js        # RoleBot webhook notifications
│   │   ├── auditLogService.js       # Event logging
│   │   └── syncService.js           # **NEW** Daily sync job
│   ├── db/
│   │   ├── connection.js
│   │   ├── migrate.js
│   │   └── migrations/
│   ├── utils/
│   └── index.js
├── package.json
└── SETUP_GUIDE.md
```

## Data Flow

### Subscription Flow
1. User clicks "Join" on static site
2. Redirected to `GET /api/auth/discord`
3. Backend redirects to Discord OAuth login
4. Discord redirects to `GET /api/auth/discord/callback`
5. Backend exchanges code for Discord token
6. Backend creates Stripe checkout session
7. Backend redirects to Stripe payment
8. User completes payment
9. Stripe sends webhook to `POST /webhooks/stripe`
10. Backend updates subscription in database
11. Stripe redirects to success page on static site

### Subscription State Lists
1. Backend maintains two lists:
   - **Subscribed**: Discord IDs with active subscriptions (tier='paid')
   - **Grace Period**: Discord IDs within 7 days of expiration (tier='grace')
2. Lists are updated:
   - Immediately on new subscription/renewal
   - Automatically every day at 11:59 PM (daily sync)
3. RoleBot fetches lists via `GET /api/lists/subscribed` and `GET /api/lists/grace`
4. RoleBot syncs Discord roles based on list membership

### Grace Period Lifecycle
1. **Day 0**: Subscription expires (ends at 11:59 PM)
2. **Daily Sync (11:59 PM Day 0)**:
   - User moved to grace period (tier='grace')
   - grace_period_end_date = now + 7 days
   - @Guild Subscriber role retained
3. **Days 1-6**:
   - RoleBot sends daily DM reminders
   - Role remains active
4. **Daily Sync (11:59 PM Day 7)**:
   - User removed from grace period (tier='free')
   - grace_period_end_date cleared
   - Role removed by RoleBot
5. **If Renewed (anytime during Days 0-6)**:
   - User moved back to paid (tier='paid')
   - New subscription_end_date set
   - grace_period_end_date cleared

## API Endpoints

### Subscription Lists (for RoleBot)

#### GET /api/lists/subscribed
Returns all currently active subscriptions.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T02:00:00.000Z",
  "list": [
    {
      "discordId": "397795595823349760",
      "stripeCustomerId": "cus_TLvv9nTZYden2S",
      "expiresAt": "2025-12-03T00:00:00.000Z"
    }
  ]
}
```

#### GET /api/lists/grace
Returns all users currently in grace period.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T02:00:00.000Z",
  "list": [
    {
      "discordId": "123456789",
      "stripeCustomerId": "cus_ABC123",
      "subscriptionExpiredAt": "2025-11-03T00:00:00.000Z",
      "graceEndsAt": "2025-11-10T00:00:00.000Z"
    }
  ]
}
```

#### GET /api/lists/all
Returns both subscribed and grace period lists in one call.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T02:00:00.000Z",
  "subscribed": [...],
  "grace": [...]
}
```

### Authentication & Payment

#### GET /api/auth/discord
Initiates Discord OAuth login flow.
Redirects to Discord login page.

#### GET /api/auth/discord/callback
Discord OAuth callback endpoint.
Handled internally - redirects to Stripe or error page.

#### POST /api/checkout/session
Creates a Stripe checkout session.
Returns session ID and URL for frontend integration.

### Webhooks

#### POST /webhooks/stripe
Stripe webhook endpoint for payment events:
- `checkout.session.completed` - New subscription
- `customer.subscription.created` - Subscription created
- `customer.subscription.updated` - Subscription state changed
- `customer.subscription.deleted` - Subscription cancelled
- `invoice.payment_succeeded` - Payment succeeded
- `invoice.payment_failed` - Payment failed

## Database Schema (Key Tables)

### users
```sql
id UUID PRIMARY KEY
discord_id BIGINT UNIQUE
email VARCHAR
tier VARCHAR (free|paid|grace)
stripe_customer_id VARCHAR
subscription_end_date TIMESTAMP
grace_period_end_date TIMESTAMP
grace_period_dm_enabled BOOLEAN DEFAULT true
created_at TIMESTAMP
updated_at TIMESTAMP
```

### subscriptions
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)
stripe_subscription_id VARCHAR UNIQUE
stripe_customer_id VARCHAR
status VARCHAR
current_period_start TIMESTAMP
current_period_end TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

### grace_periods
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES users(id)
discord_id BIGINT
started_at TIMESTAMP
ends_at TIMESTAMP
dm_reminder_enabled BOOLEAN DEFAULT true
created_at TIMESTAMP
```

## Daily Sync Job

**Schedule:** 11:59 PM every day

**Tasks:**
1. Find all users with `tier='paid'` and `subscription_end_date <= NOW()`
   - Move them to grace period
   - Set `grace_period_end_date = NOW() + 7 days`

2. Find all users with `tier='grace'` and `grace_period_end_date <= NOW()`
   - Set `tier='free'`
   - Clear `grace_period_end_date`

3. Send webhook notification to RoleBot (implied via list fetch)

**Implementation:** src/services/syncService.js
**Trigger:** node-cron job in src/index.js

## Environment Variables

```bash
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://localhost:5432/triboar_guild

# Stripe (Test Mode)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=http://localhost:1313/triboar-site/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=http://localhost:1313/triboar-site/cancel

# Discord OAuth
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=...
DISCORD_GUILD_ID=...

# Discord Bot (for RoleBot)
DISCORD_BOT_TOKEN=...
DISCORD_PAID_ROLE_ID=...

# CORS
CORS_ORIGIN=http://localhost:1313/triboar-site

# RoleBot Webhook
ROLEBOT_WEBHOOK_URL=http://localhost:3001/webhooks/rolebot
```

## Integration with RoleBot

RoleBot uses a pull model to fetch subscription state:

1. **Startup:** Fetch lists and sync roles
2. **Every 24 hours:** Fetch lists and re-sync (redundancy)
3. **On webhook:** Backend sends event to RoleBot webhook (optional trigger)

RoleBot's responsibilities:
- Fetch /api/lists/subscribed and /api/lists/grace
- Ensure Discord roles match the lists
- Send daily DM reminders during grace period
- Report role assignment results back to backend (audit logs)

## Integration with Static Site

Static site (triboar-site) responsibilities:
- Provide UI for "Join" button
- Redirect to `http://[backend]/api/auth/discord`
- Serve success page at `/success?session_id={id}`
- Serve cancel page at `/cancel`
- Display information about memberships

Backend handles:
- OAuth authentication
- Payment processing
- Redirects to static site pages

## Deployment Notes

1. **Database:** PostgreSQL required (migrations in src/db/migrations/)
2. **Port:** Default 3000 (configure via PORT env var)
3. **Stripe Webhooks:** Configure endpoint in Stripe Dashboard
4. **Discord OAuth:** Configure callback URL in Discord Developer Portal
5. **Cron Jobs:** Requires persistent server (not serverless) for 11:59 PM daily sync

## Testing

1. Run migrations: `npm run migrate`
2. Start backend: `npm run dev`
3. Test health: `curl http://localhost:3000/health`
4. Test lists: `curl http://localhost:3000/api/lists/all`

## Security Considerations

- All `.env` variables are sensitive - never commit them
- Stripe webhook signature verification required
- Discord OAuth secret protected
- JWT tokens for admin endpoints
- CORS restricted to static site domain
- All database queries use parameterized statements
- Stripe webhook endpoint public but signature-verified
