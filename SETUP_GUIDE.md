# Complete Setup Guide - Triboar Guild Backend

This guide walks through the complete setup process for the Triboar Guild subscription + Discord automation backend.

## Table of Contents

1. [PostgreSQL Setup](#postgresql-setup)
2. [Stripe Configuration](#stripe-configuration)
3. [Discord Setup](#discord-setup)
4. [Application Setup](#application-setup)
5. [Testing](#testing)
6. [Deployment](#deployment)

---

## PostgreSQL Setup

### Installation

**macOS (Homebrew)**:
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

**Windows**:
- Download from https://www.postgresql.org/download/windows/
- Run installer, note the password for `postgres` user

### Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE triboar_guild;

# Create user with password
CREATE USER triboar_user WITH PASSWORD 'your-secure-password';

# Grant privileges
ALTER ROLE triboar_user WITH CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE triboar_guild TO triboar_user;

# Connect to the new database
\c triboar_guild

# Grant schema privileges
GRANT ALL ON SCHEMA public TO triboar_user;

# Exit
\q
```

### Verify Connection

```bash
# Test connection with new user
psql -U triboar_user -d triboar_guild -h localhost

# Should see: triboar_guild=>
# Type \q to exit
```

### CONNECTION STRING

```
postgresql://triboar_user:your-secure-password@localhost:5432/triboar_guild
```

---

## Stripe Configuration

### 1. Create Stripe Account

1. Go to https://stripe.com
2. Click "Sign up"
3. Complete account setup
4. Verify email

### 2. Get API Keys

1. In Stripe Dashboard → Developers (⚡) → API Keys
2. You're in **Test Mode** (good for development)
3. Copy the keys:
   - **Publishable Key** (starts with `pk_test_`)
   - **Secret Key** (starts with `sk_test_`) ← Use this in `.env`

### 3. Create a Product & Price

1. Go to Stripe Dashboard → Products
2. Click "Create product"
3. Fill in:
   - **Name**: "Triboar Guildhall Membership"
   - **Type**: "Service"
   - **Billing period**: "Monthly"
   - **Price**: $5.00 (or your chosen amount)
   - **Billing cycle**: "Monthly"
4. Click "Create product"
5. Copy the **Price ID** (starts with `price_`) ← Use in `.env` as `STRIPE_PRICE_ID`

### 4. Setup Webhook Endpoint

**For Local Development**:

```bash
# Download Stripe CLI from: https://stripe.com/docs/stripe-cli

# On macOS:
brew install stripe/stripe-cli/stripe

# On Linux:
curl -O https://files.stripe.com/stripe-cli/install.sh && sudo bash install.sh

# On Windows:
# Download from https://github.com/stripe/stripe-cli/releases
```

Run Stripe CLI:
```bash
stripe login
# Follow the authorization flow

# Forward webhooks to your local server
stripe listen --forward-to http://localhost:3000/webhooks/stripe

# Output will be:
# > Ready! Your webhook signing secret is: whsec_test_...
```

Copy the webhook signing secret ← Use as `STRIPE_WEBHOOK_SECRET` in `.env`

**For Production**:

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://yourdomain.com/webhooks/stripe`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.trial_will_end`
5. Click "Add endpoint"
6. Copy the signing secret ← Use as `STRIPE_WEBHOOK_SECRET` in `.env`

### 5. Test Cards

```
Success:        4242 4242 4242 4242
Decline:        4000 0000 0000 0341
3DS Required:   4000 0025 0000 3155

CVC: Any 3 digits
Expiry: Any future month/year (e.g., 12/25)
```

---

## Discord Setup

### 1. Create Discord Server (if needed)

1. Open Discord
2. Click "+" on left sidebar
3. "Create My Own" → "For a club"
4. Name: "Triboar Guild Test" (or similar)
5. Click "Create"

### 2. Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Name: "Triboar Guild Bot"
4. Click "Create"
5. Go to "Bot" section (left sidebar)
6. Click "Add Bot"
7. Under "TOKEN", click "Copy" → Save as `DISCORD_BOT_TOKEN` in `.env`

### 3. Configure Bot Permissions

1. Still in the application, go to "OAuth2" → "URL Generator"
2. **Scopes**: Check `bot`
3. **Permissions**: Check:
   - ✅ Manage Roles
   - ✅ Manage Guild
4. Copy the generated URL at the bottom

### 4. Invite Bot to Server

1. Paste the URL from step 3 in browser
2. Select your test server
3. Click "Authorize"
4. Complete CAPTCHA

### 5. Create Roles in Discord

In your test Discord server:

1. Go to Server Settings → Roles
2. Create roles:
   - **@Paid Member** (for subscribed users)
   - **@Guild Member** (for @Player + @Paid Member)
   - **@Player** (existing role for approved characters)

3. For each role, right-click and "Copy Role ID"
4. Save to `.env`:
   - `DISCORD_PAID_ROLE_ID=<id of @Paid Member>`
   - `DISCORD_GUILD_MEMBER_ROLE_ID=<id of @Guild Member>`
   - `DISCORD_PLAYER_ROLE_ID=<id of @Player>`

### 6. Get Guild ID

1. In Discord, enable Developer Mode:
   - User Settings → Advanced → Developer Mode (toggle ON)
2. Right-click your server name
3. Click "Copy Guild ID"
4. Save as `DISCORD_GUILD_ID=<id>` in `.env`

### 7. Get Your Discord User ID

1. In Discord, right-click your username
2. Click "Copy User ID"
3. Save as `ADMIN_DISCORD_IDS=<your id>` in `.env`

### 8. Configure Bot Permissions (Role Ordering)

**IMPORTANT**: In Discord, the bot's role must be HIGHER than the roles it manages.

1. Go to Server Settings → Roles
2. Drag the "Triboar Guild Bot" role to the top (above @Paid Member, @Guild Member, etc.)
3. Click "Save"

### 9. Create Discord OAuth App

We need a separate OAuth app for user authentication.

1. Back in Discord Developer Portal
2. Create a NEW Application (or use existing, doesn't matter)
3. Go to "OAuth2" → "General"
4. Copy **Client ID** → `DISCORD_CLIENT_ID` in `.env`
5. Copy **Client Secret** → `DISCORD_CLIENT_SECRET` in `.env`
6. Go to "OAuth2" → "Redirects"
7. Add redirect URL:
   - Development: `http://localhost:3000/api/auth/discord/callback`
   - Production: `https://yourdomain.com/api/auth/discord/callback`
8. Click "Save"

---

## Application Setup

### 1. Clone & Navigate

```bash
cd backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create `.env` File

```bash
cp .env.example .env
```

### 4. Fill in `.env`

Edit `.env` with all your values:

```env
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database (from PostgreSQL setup)
DATABASE_URL=postgresql://triboar_user:your-password@localhost:5432/triboar_guild

# Stripe (from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=http://localhost:3000/cancel

# Discord OAuth (from Discord Developer Portal)
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
DISCORD_GUILD_ID=your_guild_id

# Discord Bot (from Discord Developer Portal)
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_PAID_ROLE_ID=role_id_paid
DISCORD_GUILD_MEMBER_ROLE_ID=role_id_guild_member
DISCORD_PLAYER_ROLE_ID=role_id_player

# JWT
JWT_SECRET=change-this-to-a-random-string-in-production
JWT_EXPIRE=7d

# Admin
ADMIN_DISCORD_IDS=your_discord_id,other_admin_ids
```

### 5. Run Database Migrations

```bash
npm run migrate
```

Output should show:
```
✓ Completed: 001_init_schema.sql
✓ All migrations completed successfully
```

### 6. Start Server

```bash
npm run dev
```

Output should show:
```
✓ Server running at http://localhost:3000
✓ Health check: GET http://localhost:3000/health
✓ Discord OAuth: GET http://localhost:3000/api/auth/discord
```

---

## Testing

### Manual Testing Flow

#### Step 1: Verify Server

```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}
```

#### Step 2: Get Discord OAuth URL

```bash
curl http://localhost:3000/api/auth/discord
# Should return: {"authUrl":"https://discord.com/api/oauth2/authorize?..."}
```

#### Step 3: Test Discord OAuth

1. Visit the `authUrl` from step 2
2. Authorize the app
3. Browser redirects to callback
4. You should see your user info and JWT token

#### Step 4: Test Checkout Session

```bash
# Use the token from step 3
TOKEN="eyJhbGc..."

curl -X POST http://localhost:3000/api/checkout/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"coupon_code": null}'

# Should return: {"success":true,"session":{"id":"cs_test_...","url":"https://checkout.stripe.com/..."}}
```

#### Step 5: Simulate Stripe Webhooks

```bash
# If using Stripe CLI:
stripe trigger checkout.session.completed

# Watch local server logs for webhook processing
```

### E2E Test Scenario

**Scenario: User subscribes, Discord role is added**

1. User goes through Discord OAuth
2. User creates checkout session
3. User pays with test card `4242 4242 4242 4242`
4. Stripe webhook fires: `checkout.session.completed`
5. Check Discord server → user should have @Paid Member role
6. Check database:
   ```bash
   psql -U triboar_user -d triboar_guild

   # See user
   SELECT * FROM users WHERE discord_id='USER_ID';

   # See subscription
   SELECT * FROM subscriptions WHERE user_id='USER_ID';

   # See audit logs
   SELECT * FROM audit_logs WHERE user_id='USER_ID' ORDER BY created_at DESC;

   # See role changes
   SELECT * FROM discord_role_changes WHERE discord_id='USER_ID';
   ```

---

## Deployment

### Heroku

```bash
# Install Heroku CLI
brew install heroku

# Login
heroku login

# Create app
heroku create your-app-name

# Add PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set STRIPE_SECRET_KEY=sk_test_...
heroku config:set STRIPE_WEBHOOK_SECRET=whsec_...
heroku config:set STRIPE_PRICE_ID=price_...
heroku config:set DISCORD_CLIENT_ID=...
heroku config:set DISCORD_CLIENT_SECRET=...
heroku config:set DISCORD_BOT_TOKEN=...
heroku config:set DISCORD_GUILD_ID=...
heroku config:set DISCORD_PAID_ROLE_ID=...
heroku config:set DISCORD_GUILD_MEMBER_ROLE_ID=...
heroku config:set DISCORD_PLAYER_ROLE_ID=...
heroku config:set DISCORD_REDIRECT_URI=https://your-app-name.herokuapp.com/api/auth/discord/callback
heroku config:set JWT_SECRET=<random-secret>
heroku config:set ADMIN_DISCORD_IDS=your_id

# Deploy
git push heroku main

# Run migrations
heroku run npm run migrate

# View logs
heroku logs -t
```

### Docker

```bash
# Build
docker build -t triboar-guild-backend .

# Run
docker run -d \
  -p 3000:3000 \
  --env-file .env.production \
  triboar-guild-backend

# Check logs
docker logs -f <container-id>
```

### Railway / Render

Both support:
1. Connect GitHub repo
2. Set environment variables via UI
3. Auto-deploy on push to `main`

---

## Common Issues & Fixes

### "Failed to connect to database"

**Check**:
- PostgreSQL is running: `psql -U postgres`
- DATABASE_URL is correct in `.env`
- Database exists: `createdb -l | grep triboar`

**Fix**:
```bash
# Restart PostgreSQL
brew services restart postgresql@15  # macOS
systemctl restart postgresql         # Linux

# Recreate database
psql -U postgres
DROP DATABASE IF EXISTS triboar_guild;
CREATE DATABASE triboar_guild;
# Then run: npm run migrate
```

### "Webhook signature verification failed"

**Check**:
- STRIPE_WEBHOOK_SECRET matches Stripe Dashboard
- For local: Using Stripe CLI? Run `stripe listen` again
- For production: Endpoint URL is exactly right

**Fix**:
```bash
# Local development
stripe listen --forward-to http://localhost:3000/webhooks/stripe
# Copy the new signing secret to .env

# Production
# Go to Stripe Dashboard → Webhooks
# Delete old endpoint
# Add new endpoint with correct URL
# Copy signing secret
```

### "Bot can't manage roles"

**Check**:
- Bot is invited to server
- Bot's role is HIGHER than target roles
- Bot has "Manage Roles" permission

**Fix**:
```
Discord → Server Settings → Roles → Drag "Triboar Guild Bot" to top
```

### "Discord user not found" in webhook

**Check**:
- User completed Discord OAuth
- `discord_id` field is populated in DB

**Fix**:
```bash
# Verify user exists
SELECT * FROM users;

# If empty, user never completed OAuth
# Run OAuth flow again
```

---

## Next Steps

1. ✅ Backend running locally
2. ✅ Database set up
3. ✅ Stripe configured
4. ✅ Discord bot working
5. ⏭️ Create simple frontend to link to `/api/auth/discord`
6. ⏭️ Test full flow: login → checkout → role assignment
7. ⏭️ Deploy to production
8. ⏭️ Update Stripe/Discord settings for production URLs
9. ⏭️ Monitor audit logs and role changes

---

## Getting Help

**Having issues?**

1. Check logs: `npm run dev` (shows all requests)
2. Check database: `psql` and query tables directly
3. Check Stripe Dashboard → Webhooks → Recent deliveries
4. Check Discord roles → verify bot has right permissions
5. Review this guide again → likely in setup steps

**Still stuck?**
- Create GitHub issue with:
  - Error message (from logs)
  - What you're trying to do
  - Steps to reproduce
