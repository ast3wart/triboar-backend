-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  discord_id VARCHAR(255) UNIQUE NOT NULL,
  discord_username VARCHAR(255),
  discord_avatar VARCHAR(255),
  stripe_customer_id VARCHAR(255) UNIQUE,
  tier VARCHAR(50) DEFAULT 'free' CHECK (tier IN ('free', 'paid')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_discord_id ON users(discord_id);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX idx_users_email ON users(email);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_price_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired'
  )),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  cancel_at TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_sub_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(255) NOT NULL,
  action VARCHAR(255),
  resource_type VARCHAR(255),
  resource_id VARCHAR(255),
  stripe_event_id VARCHAR(255),
  payload JSONB,
  error_message TEXT,
  status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_stripe_event_id ON audit_logs(stripe_event_id);

-- Processed webhooks (for idempotency)
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_processed_webhooks_event_id ON processed_webhooks(stripe_event_id);

-- Discord role changes (audit trail for role management)
CREATE TABLE IF NOT EXISTS discord_role_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('added', 'removed')),
  role_id VARCHAR(255) NOT NULL,
  role_name VARCHAR(255),
  reason VARCHAR(255),
  retry_count INT DEFAULT 0,
  error_message TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_discord_role_changes_user_id ON discord_role_changes(user_id);
CREATE INDEX idx_discord_role_changes_status ON discord_role_changes(status);
CREATE INDEX idx_discord_role_changes_created_at ON discord_role_changes(created_at);

-- Admin overrides (for manual comping, refunds, etc.)
CREATE TABLE IF NOT EXISTS admin_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_discord_id VARCHAR(255) NOT NULL,
  override_type VARCHAR(255) NOT NULL CHECK (override_type IN (
    'manual_comp',
    'refund',
    'role_grant',
    'role_remove',
    'tier_change'
  )),
  duration_days INT,
  reason TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_admin_overrides_user_id ON admin_overrides(user_id);
CREATE INDEX idx_admin_overrides_applied_at ON admin_overrides(applied_at);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
