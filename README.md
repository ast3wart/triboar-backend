# Triboar Guild - Backend Service

A Node.js/Express backend service for managing Stripe subscriptions with automated Discord role assignment/removal.

## Features

- ✅ **Discord OAuth** - Secure user authentication via Discord
- ✅ **Stripe Checkout Integration** - One-click subscription with custom fields
- ✅ **Automated Role Management** - Instant Discord role assignment/removal based on subscription status
- ✅ **Webhook Handlers** - Idempotent processing of all Stripe lifecycle events
- ✅ **Subscription Lifecycle** - Support for trials, cancellations, lapses, and rejoin
- ✅ **Audit Logging** - Complete audit trail of all payment and role events
- ✅ **Admin Console** - Manual role grants, user search, and reconciliation
- ✅ **Error Handling** - Exponential backoff with Discord rate limit handling
- ✅ **Idempotency** - Webhook deduplication prevents double-processing

## Tech Stack

- **Framework**: Express.js (Node.js)
- **Database**: PostgreSQL
- **Payment**: Stripe
- **Discord**: discord.js
- **Auth**: JWT (Bearer tokens)
- **Logging**: Pino
- **HTTP Client**: Axios

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- Stripe Account (test mode)
- Discord Server + Bot
- Discord OAuth App

### 1. Setup Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your values:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/triboar_guild

# Stripe (get from Stripe Dashboard > API Keys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_ID=price_...

# Discord OAuth (get from Discord Developer Portal)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback

# Discord Bot (create bot in Developer Portal)
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_guild_id
DISCORD_PAID_ROLE_ID=role_id_paid_member
DISCORD_GUILD_MEMBER_ROLE_ID=role_id_guild_member
DISCORD_PLAYER_ROLE_ID=role_id_player

# JWT Secret
JWT_SECRET=your_super_secret_key_change_in_production

# Admin Discord IDs
ADMIN_DISCORD_IDS=123456789,987654321
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Migrations

```bash
npm run migrate
```

This creates all required tables: `users`, `subscriptions`, `audit_logs`, etc.

### 4. Start Server

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

Server will be available at `http://localhost:3000`

## API Endpoints

### Authentication

```bash
# Get Discord OAuth URL
GET /api/auth/discord
# Returns: { authUrl: "https://discord.com/api/oauth2/..." }

# Handle OAuth callback (Discord redirects here)
GET /api/auth/discord/callback?code=...&state=...
# Returns: { user, token }

# Logout
POST /api/auth/logout
```

### Checkout / Subscriptions

```bash
# Create checkout session
POST /api/checkout/session
Headers: Authorization: Bearer <token>
Body: { coupon_code?: string }
# Returns: { session: { id, url } }

# Create customer portal session (for self-serve cancel/update)
POST /api/checkout/portal
Headers: Authorization: Bearer <token>
# Returns: { session: { url } }
```

### Admin Console

All admin endpoints require:
- Authentication token
- User's Discord ID in `ADMIN_DISCORD_IDS` env var

```bash
# Search users
GET /api/admin/users/search?email=...&discord_id=...&limit=20&offset=0

# Get user details
GET /api/admin/users/:userId
# Returns: { user, subscription, recentLogs }

# Manually grant paid role
POST /api/admin/roles/grant
Body: { discord_id: string, reason?: string }

# Manually remove paid role
POST /api/admin/roles/remove
Body: { discord_id: string, reason?: string }

# Reconcile user's roles to match Stripe state
POST /api/admin/reconcile
Body: { discord_id: string }

# Get audit logs
GET /api/admin/audit-logs?user_id=...&event_type=...&limit=100&offset=0
```

## Stripe Events Handled

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Link user→customer, create subscription, add @Paid Member role |
| `customer.subscription.created` | Record subscription in DB |
| `customer.subscription.updated` | Update status (e.g., cancel_at_period_end) |
| `customer.subscription.deleted` | Remove @Paid Member role, update to "free" tier |
| `invoice.payment_succeeded` | Confirm payment, ensure @Paid Member role |
| `invoice.payment_failed` | Log failure, keep roles during dunning (Stripe handles it) |
| `customer.subscription.trial_will_end` | (Optional) Send reminder notification |

## Webhook Setup

1. **Get Webhook Secret**:
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://your-domain/webhooks/stripe`
   - Events to subscribe to:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `customer.subscription.trial_will_end`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET` in `.env`

2. **Local Testing**:
   ```bash
   # Download Stripe CLI: https://stripe.com/docs/stripe-cli
   stripe listen --forward-to http://localhost:3000/webhooks/stripe

   # This will print your webhook signing secret - copy to .env
   ```

## Discord Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Go to "Bot" tab → "Add Bot"
4. Under "TOKEN", click "Copy" → save as `DISCORD_BOT_TOKEN`
5. Under "Privileged Gateway Intents", enable:
   - `Server Members Intent` (optional, if needed for member queries)

### 2. Set Bot Permissions

1. Go to "OAuth2" → "URL Generator"
2. Scopes: `bot`
3. Permissions:
   - ✅ Manage Roles
   - ✅ Manage Guild
4. Copy URL and open it to invite bot to your server

### 3. Get Role IDs

In Discord (with Developer Mode enabled):
- Right-click role → Copy Role ID
- Set in `.env`:
  - `DISCORD_PAID_ROLE_ID` - Role given on subscription
  - `DISCORD_GUILD_MEMBER_ROLE_ID` - Combined role (@Player + @Paid)
  - `DISCORD_PLAYER_ROLE_ID` - Existing character approval role

### 4. Get Guild ID

- Right-click server name → Copy Guild ID
- Set as `DISCORD_GUILD_ID` in `.env`

## Database Schema

### Users Table
```
id (UUID)
email (string, unique)
discord_id (string, unique)
discord_username (string)
discord_avatar (string)
stripe_customer_id (string, unique)
tier ('free' | 'paid')
created_at, updated_at (timestamp)
```

### Subscriptions Table
```
id (UUID)
user_id (FK → users)
stripe_subscription_id (string, unique)
stripe_price_id (string)
status ('trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired')
current_period_start, current_period_end (timestamp)
trial_start, trial_end (timestamp)
cancel_at, cancel_at_period_end (timestamp, bool)
canceled_at (timestamp)
metadata (jsonb)
created_at, updated_at (timestamp)
```

### Audit Logs Table
```
id (UUID)
user_id (FK → users, nullable)
event_type (string) - e.g., 'subscription.activated', 'role_removed', 'stripe.webhook_error'
action (string) - e.g., 'grant', 'remove', 'reconcile'
resource_type (string) - 'user', 'role', 'subscription'
resource_id (string)
stripe_event_id (string)
payload (jsonb)
error_message (text)
status ('success' | 'failure' | 'pending')
created_at (timestamp)
```

### Discord Role Changes Table
```
id (UUID)
user_id (FK → users)
discord_id (string)
action ('added' | 'removed')
role_id (string)
role_name (string)
reason (string)
retry_count (int)
error_message (text)
status ('pending' | 'success' | 'failed')
created_at, completed_at (timestamp)
```

## Error Handling & Retries

### Discord API Retries
- Exponential backoff on rate limits (429)
- Automatic retry on 5xx errors
- Max 3 retry attempts
- Respects `Retry-After` header

### Webhook Idempotency
- Stripe event IDs stored in `processed_webhooks` table
- Duplicate webhooks return 200 immediately without reprocessing
- Safe to replay webhooks without side effects

### Graceful Degradation
- If Discord role sync fails, subscription is still processed
- Errors logged in audit trail
- Admin can manually reconcile via `/api/admin/reconcile`

## Testing

### E2E Flow Testing

#### 1. New Subscription (No Trial)
```bash
# User logs in via Discord OAuth
GET /api/auth/discord
# → Get authUrl, redirect user to Discord
# → User grants permission
# → Browser redirected to /api/auth/discord/callback?code=...
# → Receive JWT token

# User initiates checkout
POST /api/checkout/session
Headers: Authorization: Bearer <token>
# → Get Stripe Checkout URL
# → User goes to Stripe Checkout
# → Enters test card: 4242 4242 4242 4242
# → Completes payment

# Webhook fires: checkout.session.completed
# → User linked to Stripe customer
# → Subscription created in DB
# → @Paid Member role added in Discord
# → Audit log created
```

#### 2. Free Trial
```bash
# Same as above, but Stripe Price has trial_period_days set
# → User still gets @Paid Member role during trial
# → After trial ends, Stripe attempts payment
# → If payment succeeds → continues as "active"
# → If payment fails → dunning flow starts
```

#### 3. Cancel at Period End
```bash
# User uses Stripe Customer Portal to cancel
POST /api/checkout/portal
# → Get portal URL, redirect user
# → User clicks "Cancel Subscription"
# → Sets cancel_at_period_end = true

# Webhook: customer.subscription.updated
# → Roles remain until period end
# → Audit logged

# After period ends, Stripe sends:
# Webhook: customer.subscription.deleted
# → @Paid Member role removed
# → User tier → "free"
# → Audit logged
```

#### 4. Payment Failure & Recovery
```bash
# User has active subscription
# Next billing cycle: card declines

# Webhook: invoice.payment_failed
# → Status → past_due
# → Roles kept (dunning period)
# → Audit logged

# User updates payment method in Customer Portal
# Stripe retries automatically

# Webhook: invoice.payment_succeeded
# → Subscription confirmed active
# → Roles re-synced
# → Audit logged
```

#### 5. Rejoin After Cancel
```bash
# User previously cancelled, period ended
# → tier = "free", no @Paid Member role

# User wants to rejoin
POST /api/checkout/session
# → Uses same Stripe customer ID (linked by email)
# → Creates new subscription
# → Webhook: checkout.session.completed
# → Subscription created (new row)
# → tier = "paid"
# → @Paid Member role added
```

### Test Cards

| Scenario | Card | Outcome |
|----------|------|---------|
| Success | 4242 4242 4242 4242 | Payment succeeds |
| Decline (insufficient funds) | 4000 0000 0000 0341 | Payment fails |
| 3DS Required | 4000 0025 0000 3155 | Prompts for auth |
| Expired Card | Any card with exp 12/20 | Payment fails |

### Manual Testing with Stripe CLI

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli

# Forward webhooks to local server
stripe listen --forward-to http://localhost:3000/webhooks/stripe

# Trigger specific events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.updated --add customer:id=cus_XXXXX

# Monitor webhook activity
stripe logs tail
```

## Monitoring & Logging

### Structured Logging
All logs include context:
```json
{
  "level": "info",
  "msg": "Added role to member",
  "discordId": "123456789",
  "roleId": "role_id",
  "timestamp": "2024-10-31T12:00:00Z"
}
```

### Log Levels
- `error` - Errors that need investigation
- `warn` - Potentially problematic situations
- `info` - General informational messages
- `debug` - Detailed debugging info

### Key Metrics to Monitor
- Failed webhook processing
- Discord API 429 (rate limit) frequency
- Failed role changes
- Average webhook processing time
- Subscription churn rate

## Deployment

### Environment Variables

**Required**:
- `NODE_ENV`, `PORT`
- `DATABASE_URL`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`
- `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`
- `DISCORD_PAID_ROLE_ID`
- `JWT_SECRET`

**Optional**:
- `CORS_ORIGIN` (default: http://localhost:3000)
- `LOG_LEVEL` (default: info)
- `ADMIN_DISCORD_IDS` (comma-separated)
- `STRIPE_PORTAL_RETURN_URL`

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/index.js"]
```

```bash
docker build -t triboar-guild-backend .
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  triboar-guild-backend
```

### Heroku / Cloud Deployment

```bash
# Create PostgreSQL database
# Set env vars via platform UI or:
heroku config:set STRIPE_SECRET_KEY=sk_test_...

# Deploy
git push heroku main
```

## Troubleshooting

### Webhook Not Processing

1. **Check webhook secret**: Compare `STRIPE_WEBHOOK_SECRET` with Stripe Dashboard value
2. **Check logs**: `npm run dev` will show errors
3. **Test locally**: Use Stripe CLI to replay webhooks
   ```bash
   stripe events resend evt_XXXXX
   ```

### Discord Roles Not Changing

1. **Bot permissions**: Check bot has "Manage Roles" permission
2. **Role order**: Ensure bot's role is higher than the target role
3. **User not in guild**: Check user is actually in Discord server
4. **Rate limited**: Check logs for 429 errors
   ```bash
   # Check current rate limits
   curl https://discord.com/api/v10/guilds/{guild_id}  \
     -H "Authorization: Bot {token}"
   ```

### Database Connection Failed

1. **Check DATABASE_URL**: `postgresql://user:pass@host:5432/dbname`
2. **Test connection**:
   ```bash
   psql $DATABASE_URL -c "SELECT NOW()"
   ```
3. **Run migrations**: `npm run migrate`

### JWT Token Invalid

1. **Token expired**: Check `JWT_EXPIRE` setting (default: 7 days)
2. **Token malformed**: Token should be: `Bearer eyJhbGc...`
3. **Wrong secret**: Ensure `JWT_SECRET` matches what generated the token

## Future Enhancements

### Phase 2
- [ ] Email notifications (trial ending, payment failed)
- [ ] Discord DM notifications
- [ ] Grace role (@Lapsed) for subscription lapses
- [ ] Admin portal UI (frontend)
- [ ] Payment history export
- [ ] Bulk role operations

### Phase 3
- [ ] Multiple subscription tiers
- [ ] Invite links with automatic role grant
- [ ] Subscription gifting
- [ ] Usage analytics dashboard
- [ ] Referral program
- [ ] Custom subscription durations

## Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit changes: `git commit -m 'Add amazing feature'`
3. Push: `git push origin feature/amazing-feature`
4. Create PR

## License

MIT - see LICENSE file

## Support

Issues? Check:
1. `.env` setup (all required vars set)
2. Stripe Dashboard (webhook endpoint configured)
3. Discord Developer Portal (bot invited, permissions granted)
4. PostgreSQL connection (database exists, migrations run)

For bugs: Create an issue with logs and reproduction steps.
