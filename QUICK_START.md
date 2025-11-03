# Quick Start - 5 Minute Setup

## TL;DR - Get Running Fast

### Prerequisites Checklist
- [ ] Node.js 18+ installed (`node -v`)
- [ ] PostgreSQL installed (`psql --version`)
- [ ] Stripe test account created
- [ ] Discord server + bot created
- [ ] Stripe CLI installed (optional but recommended)

### 1. Database (2 min)

```bash
# Create database
psql -U postgres -c "CREATE DATABASE triboar_guild;"
psql -U postgres -c "CREATE USER triboar_user WITH PASSWORD 'dev-password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE triboar_guild TO triboar_user;"

# Verify
psql -U triboar_user -d triboar_guild -h localhost -c "SELECT NOW();"
```

### 2. Stripe Setup (2 min)

1. Go to https://dashboard.stripe.com/test/products
2. Create product:
   - Name: "Triboar Guildhall Membership"
   - Price: $5/month
   - Copy **Price ID**
3. Get API Keys (dashboard home, "Reveal test key"):
   - Copy **Secret Key** (sk_test_...)
   - Copy **Publishable Key** (pk_test_...)

For **webhooks** (local dev):
```bash
stripe listen --forward-to http://localhost:3000/webhooks/stripe
# Copy the signing secret (whsec_test_...)
```

### 3. Discord Setup (1 min)

1. Go to https://discord.com/developers/applications
2. Create app → Add Bot
   - Copy **Bot Token**
3. OAuth2 → URL Generator
   - Scope: `bot`
   - Permissions: ✅ Manage Roles
   - Invite URL to your test server
4. In your Discord server:
   - Create roles: @Paid Member, @Guild Member, @Player
   - Right-click each → Copy Role ID
   - Enable Developer Mode, right-click server → Copy Guild ID

### 4. Backend (1 min)

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://triboar_user:dev-password@localhost:5432/triboar_guild

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_ID=price_...

DISCORD_BOT_TOKEN=your_bot_token
DISCORD_GUILD_ID=your_guild_id
DISCORD_PAID_ROLE_ID=role_id_paid
DISCORD_GUILD_MEMBER_ROLE_ID=role_id_guild_member
DISCORD_PLAYER_ROLE_ID=role_id_player

DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback

JWT_SECRET=dev-secret-change-in-production
ADMIN_DISCORD_IDS=your_discord_user_id
```

```bash
npm install
npm run migrate
npm run dev
```

✅ **Server running at http://localhost:3000**

---

## Test It

### 1. Health Check
```bash
curl http://localhost:3000/health
```

### 2. Discord OAuth
Visit: http://localhost:3000/api/auth/discord
- Click the `authUrl` to authorize
- You'll get a JWT token

### 3. Checkout
```bash
TOKEN="eyJhbGc..." # from step 2

curl -X POST http://localhost:3000/api/checkout/session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```
- Visit the Stripe Checkout URL
- Use test card: `4242 4242 4242 4242`
- Complete payment

### 4. Verify
- Check Discord → user should have @Paid Member role
- Check database:
  ```bash
  psql -U triboar_user -d triboar_guild
  SELECT * FROM users;
  SELECT * FROM subscriptions;
  SELECT * FROM audit_logs ORDER BY created_at DESC;
  ```

---

## What You Get

✅ **Complete Stripe → Discord automation**
- User subscribes on website
- Discord role automatically added
- Payment fails? Role removed
- User cancels? Role gone
- User rejoins? Works instantly

✅ **Full audit trail**
- Every role change logged
- Every Stripe event logged
- Admin can see everything

✅ **Admin tools**
- Search users by email/Discord ID
- Manually grant/remove roles
- Reconcile broken states
- View audit logs

✅ **Built-in safety**
- Webhook idempotency (no duplicate processing)
- Exponential backoff on Discord rate limits
- Automatic retry on failures
- Graceful error handling

---

## Next Steps

### Frontend Integration
See `/` (frontend guide coming) to:
- Create "Join" button linking to Discord OAuth
- Show subscription status
- Create checkout link

### Production Deployment
See `SETUP_GUIDE.md` "Deployment" section:
- Deploy to Heroku/Docker/Railway
- Update env vars for production URLs
- Configure Stripe production keys
- Update Discord OAuth redirect

### Testing Workflows
See `README.md` "Testing" section:
- Free trial flow
- Cancellation & rejoin
- Payment failures
- Admin overrides

---

## Troubleshooting

**Server won't start?**
```bash
# Check database exists
psql -U triboar_user -d triboar_guild -c "SELECT 1"

# Run migrations
npm run migrate

# Check .env has all required vars
cat .env | grep STRIPE_SECRET_KEY  # should show value
```

**Discord roles not being added?**
```bash
# Check Discord bot has permission
# Discord → Server Settings → Roles → Drag "Triboar Guild Bot" to top

# Check logs for errors
npm run dev  # watch output
```

**Webhook not processing?**
```bash
# Local: restart stripe listen
stripe listen --forward-to http://localhost:3000/webhooks/stripe

# Manually trigger event
stripe trigger checkout.session.completed

# Check logs for errors
```

---

## Key Files

```
backend/
├── src/
│   ├── index.js                    # Main app
│   ├── api/routes/
│   │   ├── auth.js                # Discord OAuth
│   │   ├── checkout.js            # Stripe checkout
│   │   ├── webhooks.js            # Stripe webhooks
│   │   └── admin.js               # Admin tools
│   ├── services/
│   │   ├── discordAuthService.js  # OAuth logic
│   │   ├── discordRoleService.js  # Role management
│   │   ├── stripeService.js       # Stripe API
│   │   ├── subscriptionService.js # Subscription logic
│   │   └── auditLogService.js     # Logging
│   └── db/
│       ├── connection.js          # DB pool
│       ├── migrate.js             # Run migrations
│       └── migrations/
│           └── 001_init_schema.sql # Schema
├── README.md                       # Full docs
├── SETUP_GUIDE.md                 # Detailed setup
├── QUICK_START.md                 # This file
└── .env.example                   # Template
```

---

## Commands

```bash
npm run dev           # Start with hot reload
npm start             # Start production
npm run migrate       # Run database migrations
npm run migrate:undo  # Rollback migrations
npm run lint          # Check code style
npm test              # Run tests (coming soon)
npm run test:e2e      # Run end-to-end tests
```

---

## That's It!

You now have a complete, production-ready Stripe + Discord automation system.

**What's automated**:
- ✅ User signup via Discord OAuth
- ✅ Stripe subscription checkout
- ✅ Discord role assignment
- ✅ Subscription lifecycle (cancel, lapse, rejoin)
- ✅ Payment failures & recovery
- ✅ Free trials
- ✅ Coupon codes
- ✅ Admin overrides
- ✅ Complete audit logging

**What's ready to integrate**:
- Frontend "Join" button
- Admin dashboard
- Email notifications
- Grace period roles
- Multiple tiers (Phase 2)

Questions? Check:
1. `README.md` - Full API docs
2. `SETUP_GUIDE.md` - Detailed instructions
3. Server logs - `npm run dev` shows everything
4. Database - `psql` to query tables directly

Happy automating! 🎉
