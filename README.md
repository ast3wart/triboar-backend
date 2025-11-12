# Triboar Guild Backend

Backend API for managing Triboar Guild subscriptions, Discord role automation, and webhook integrations.

## Features

- Discord OAuth authentication
- Stripe subscription management
- Automatic Discord role assignment
- Gift subscription system (via Discord bot)
- Grace period management (7-day buffer after expiration)
- Webhook integration with rolebot
- Complete audit logging
- Admin tools for user management

## Quick Start

All development runs in Docker containers - **no local Node.js installation required**.

### Prerequisites

- Docker
- Docker Compose

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration (see Configuration section below)
```

### 2. Start All Services

```bash
docker-compose up
```

This starts:
- Backend API (port 3000)
- PostgreSQL database (port 5432)
- Redis cache (port 6379)

### 3. Run Migrations

In another terminal:

```bash
docker-compose exec backend npm run migrate
```

### 4. Verify

```bash
curl http://localhost:3000/health
```

That's it! Your entire development environment is running in containers.

---

## Development

### Starting & Stopping

```bash
# Start all services (attached - see logs in terminal)
docker-compose up

# Start all services (detached - runs in background)
docker-compose up -d

# Start and rebuild containers (after code changes or Dockerfile updates)
docker-compose up --build

# Stop all services
docker-compose down

# Stop and remove volumes (clears database)
docker-compose down -v
```

### Viewing Logs

```bash
# View all logs
docker-compose logs

# Follow logs (real-time)
docker-compose logs -f

# Follow backend logs only
docker-compose logs -f backend

# View last 50 lines
docker-compose logs --tail=50
```

### Running Commands Inside Containers

```bash
# Access backend shell
docker-compose exec backend sh

# Run migrations
docker-compose exec backend npm run migrate

# Undo migrations
docker-compose exec backend npm run migrate:undo

# Run linter
docker-compose exec backend npm run lint
```

### Database Access

```bash
# Access PostgreSQL CLI
docker-compose exec postgres psql -U triboar -d triboar_dev

# Example queries:
# \dt                    -- List tables
# \d users              -- Describe users table
# SELECT * FROM users;  -- Query users
# \q                    -- Quit
```

### Redis Access

```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Example commands:
# KEYS *                -- List all keys
# GET key_name          -- Get value
# FLUSHALL              -- Clear all data (careful!)
# EXIT                  -- Quit
```

### Making Code Changes

1. Edit files in `src/` directory
2. Changes are automatically synced to container (mounted volume)
3. Nodemon detects changes and restarts the backend
4. Check logs: `docker-compose logs -f backend`

### Making Dependency Changes

If you modify `package.json`:

```bash
docker-compose down
docker-compose up --build
```

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

#### Server Configuration

```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

#### Database Configuration

```env
DATABASE_URL=postgresql://triboar:triboar_dev_pass@postgres:5432/triboar_dev
```

#### Redis Configuration

```env
REDIS_URL=redis://redis:6379
```

#### Security

```env
# Generate with: openssl rand -hex 32
BACKEND_API_TOKEN=your_secure_token_min_32_chars
JWT_SECRET=your_jwt_secret_min_32_characters
JWT_EXPIRE=7d
```

#### Stripe Configuration

1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your test keys:

```env
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret
STRIPE_PRICE_ID=price_your_stripe_price_id
STRIPE_SUCCESS_URL=http://localhost:3000/success
STRIPE_CANCEL_URL=http://localhost:3000/cancel
STRIPE_PORTAL_RETURN_URL=http://localhost:3000
```

**For local webhook testing:**
```bash
stripe listen --forward-to http://localhost:3000/webhooks/stripe
# Copy the signing secret to STRIPE_WEBHOOK_SECRET
```

#### Discord OAuth Configuration

1. Go to https://discord.com/developers/applications
2. Create application → OAuth2 settings:

```env
DISCORD_CLIENT_ID=your_discord_application_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
```

#### Discord Bot Configuration

1. In Discord Developer Portal → Bot section
2. Copy bot token and enable necessary intents:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_server_id
```

#### Discord Role IDs

In Discord (with Developer Mode enabled):
1. Right-click each role → Copy Role ID

```env
DISCORD_PAID_ROLE_ID=your_paid_subscriber_role_id
DISCORD_PLAYER_ROLE_ID=your_player_role_id
DISCORD_GUILD_MEMBER_ROLE_ID=your_guild_member_role_id
```

#### Admin Configuration

```env
# Comma-separated list of Discord user IDs with admin access
ADMIN_DISCORD_IDS=your_discord_user_id,another_admin_discord_id
```

#### RoleBot Integration

```env
# URL where rolebot webhook is listening
# For Docker: use host.docker.internal
ROLEBOT_WEBHOOK_URL=http://host.docker.internal:3001/webhooks/rolebot
```

---

## API Endpoints

### Authentication

#### `GET /api/auth/discord`
Get Discord OAuth URL

**Response:**
```json
{
  "authUrl": "https://discord.com/api/oauth2/authorize?..."
}
```

#### `GET /api/auth/discord/callback`
OAuth callback (redirects after Discord authorization)

### Checkout

#### `POST /api/checkout/session`
Create Stripe checkout session

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "cs_test_...",
    "url": "https://checkout.stripe.com/..."
  }
}
```

### Admin Routes

All admin routes require JWT authentication and admin Discord ID.

#### `GET /api/admin/users/search?email=...&discord_id=...`
Search users by email or Discord ID

#### `GET /api/admin/users/:userId`
Get detailed user information

#### `POST /api/admin/roles/grant`
Manually grant paid role

**Body:**
```json
{
  "discord_id": "123456789",
  "reason": "Admin override"
}
```

#### `POST /api/admin/roles/remove`
Manually remove paid role

#### `POST /api/admin/reconcile`
Sync user's Discord roles to Stripe state

**Body:**
```json
{
  "discord_id": "123456789"
}
```

#### `POST /api/admin/subscriptions/gift`
Grant gift subscription (API token auth)

**Headers:**
```
Authorization: Bearer <BACKEND_API_TOKEN>
```

**Body:**
```json
{
  "discordId": "123456789",
  "duration": "1_month",
  "reason": "Gift subscription"
}
```

**Duration options:** `1_month`, `3_months`, `6_months`, `1_year`

#### `GET /api/admin/subscribers`
Get all active subscribers

#### `GET /api/admin/grace-period`
Get users in grace period

#### `GET /api/admin/audit-logs`
Get audit logs with filtering

### Public Lists

#### `GET /api/lists/subscribed`
Get list of Discord IDs with active subscriptions

#### `GET /api/lists/grace`
Get list of Discord IDs in grace period

#### `GET /api/lists/all`
Get both subscribed and grace period lists

### Webhooks

#### `POST /webhooks/stripe`
Stripe webhook endpoint (verified with signature)

---

## Testing

### Health Check

```bash
curl http://localhost:3000/health
```

### Discord OAuth Flow

1. Get auth URL:
```bash
curl http://localhost:3000/api/auth/discord
```

2. Visit the `authUrl` in browser
3. Authorize the application
4. You'll receive a JWT token

### Create Checkout Session

```bash
TOKEN="your_jwt_token_here"

curl -X POST http://localhost:3000/api/checkout/session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Test Stripe Webhooks

```bash
# Trigger test event
stripe trigger checkout.session.completed

# Watch logs
docker-compose logs -f backend
```

### Test Gift Subscription

```bash
curl -X POST http://localhost:3000/api/admin/subscriptions/gift \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $BACKEND_API_TOKEN" \
  -d '{"discordId":"123456789","duration":"1_month","reason":"Test"}'
```

---

## Database Schema

### Tables

- **users** - User accounts with Discord and Stripe info
- **subscriptions** - Stripe subscription records
- **admin_overrides** - Manual admin actions (role grants, tier changes)
- **audit_logs** - Complete audit trail of all events
- **grace_period_tracking** - Users in grace period with expiration
- **discord_role_changes** - Discord role assignment history
- **webhook_events** - Stripe webhook delivery tracking

### Migrations

```bash
# Run migrations
docker-compose exec backend npm run migrate

# Rollback last migration
docker-compose exec backend npm run migrate:undo
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000  # or :5432 for postgres, :6379 for redis

# Stop Docker containers
docker-compose down
```

### Container Won't Start

```bash
# View container logs
docker-compose logs backend

# Rebuild from scratch
docker-compose down -v
docker-compose up --build
```

### Database Connection Failed

```bash
# Check if postgres is healthy
docker-compose ps

# View postgres logs
docker-compose logs postgres

# Verify DATABASE_URL in .env uses 'postgres' as hostname (not 'localhost')
```

### Webhook Not Received by RoleBot

1. Verify ROLEBOT_WEBHOOK_URL uses `host.docker.internal` (not `localhost`)
2. Check rolebot is running: `curl http://localhost:3001/health`
3. Check backend logs: `docker-compose logs backend | grep webhook`

### Clear Everything and Start Fresh

```bash
# Stop and remove containers, networks, volumes
docker-compose down -v

# Rebuild and start
docker-compose up --build
```

---

## Production Deployment

### Docker Production Build

```bash
# Build production image
docker build -t triboar-backend .

# Run production container
docker run -d \
  --name triboar-backend \
  --env-file .env.production \
  -p 3000:3000 \
  --restart unless-stopped \
  triboar-backend
```

### Environment-Specific Configuration

For production, update these environment variables:

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-host:5432/triboar_prod
REDIS_URL=redis://prod-redis:6379
ROLEBOT_WEBHOOK_URL=https://your-rolebot-domain.com/webhooks/rolebot
DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/discord/callback
STRIPE_SUCCESS_URL=https://your-domain.com/success
STRIPE_CANCEL_URL=https://your-domain.com/cancel

# Switch to production Stripe keys
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

### Stripe Production Webhooks

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-domain.com/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

---

## Architecture

### Services

- **Backend API** (Port 3000) - Express.js REST API
- **PostgreSQL** (Port 5432) - Primary database
- **Redis** (Port 6379) - Caching and session storage

### Integration Points

- **Stripe** - Payment processing and webhooks
- **Discord API** - OAuth and bot interactions
- **RoleBot** - Discord bot for role management and commands

### Docker Network

All services run in the `triboar-network` Docker network:
- **backend** → connects to postgres and redis by hostname
- **postgres** → accessible at `postgres:5432` from containers
- **redis** → accessible at `redis:6379` from containers
- Use `host.docker.internal` to reach host services from containers

---

## Commands Reference

### Docker Services

```bash
docker-compose up                      # Start all services (attached)
docker-compose up -d                   # Start all services (detached)
docker-compose up --build              # Rebuild and start
docker-compose down                    # Stop all services
docker-compose down -v                 # Stop and remove volumes
docker-compose logs -f                 # Follow all logs
docker-compose logs -f backend         # Follow backend logs only
docker-compose ps                      # List running containers
```

### Inside Container

```bash
docker-compose exec backend sh         # Open shell in backend container
docker-compose exec backend npm run migrate        # Run migrations
docker-compose exec backend npm run migrate:undo   # Rollback migration
docker-compose exec backend npm run lint           # Check code style
```

### Database

```bash
docker-compose exec postgres psql -U triboar -d triboar_dev   # Open psql
```

### Redis

```bash
docker-compose exec redis redis-cli    # Open Redis CLI
```

---

## Project Structure

```
backend/
├── src/
│   ├── index.js                    # Main application entry
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.js            # Discord OAuth
│   │   │   ├── checkout.js        # Stripe checkout
│   │   │   ├── webhooks.js        # Stripe webhooks
│   │   │   ├── admin.js           # Admin endpoints
│   │   │   └── lists.js           # Public lists
│   │   └── middleware/
│   │       ├── auth.js            # Authentication
│   │       └── errorHandler.js    # Error handling
│   ├── services/
│   │   ├── stripeService.js       # Stripe integration
│   │   ├── webhookService.js      # Webhook delivery
│   │   ├── auditLogService.js     # Audit logging
│   │   └── gracePeriodService.js  # Grace period management
│   ├── db/
│   │   ├── connection.js          # Database pool
│   │   ├── migrate.js             # Migration runner
│   │   └── migrations/            # SQL migration files
│   └── utils/
│       ├── logger.js              # Pino logger
│       ├── jwt.js                 # JWT utilities
│       └── errors.js              # Custom error classes
├── docker-compose.yml             # Docker services config
├── Dockerfile                     # Multi-stage Docker build
├── package.json                   # Dependencies and scripts
├── .env.example                   # Environment template
└── README.md                      # This file
```

---

## License

MIT

---

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review logs: `docker-compose logs -f`
3. Check database: `docker-compose exec postgres psql -U triboar -d triboar_dev`
4. Verify environment variables are loaded correctly
