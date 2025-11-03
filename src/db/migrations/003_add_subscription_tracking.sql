-- Add subscription tracking columns to users table
ALTER TABLE users
  ADD COLUMN subscription_end_date TIMESTAMP,
  ADD COLUMN grace_period_end_date TIMESTAMP;

-- Add index on tier for faster filtering
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- Add index on subscription_end_date for faster syncing
CREATE INDEX IF NOT EXISTS idx_users_subscription_end_date ON users(subscription_end_date);

-- Add index on grace_period_end_date for faster syncing
CREATE INDEX IF NOT EXISTS idx_users_grace_period_end_date ON users(grace_period_end_date);
