-- Grace period table (for expired subscriptions)
CREATE TABLE IF NOT EXISTS grace_period (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_id VARCHAR(255) NOT NULL,
  grace_period_ends_at TIMESTAMP NOT NULL,
  dm_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grace_period_user_id ON grace_period(user_id);
CREATE INDEX idx_grace_period_discord_id ON grace_period(discord_id);
CREATE INDEX idx_grace_period_ends_at ON grace_period(grace_period_ends_at);

-- Webhook events table (track what we've sent to RoleBot)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(255) NOT NULL,
  payload JSONB,
  sent_to_rolebot BOOLEAN DEFAULT false,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_webhook_events_user_id ON webhook_events(user_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_sent ON webhook_events(sent_to_rolebot);

-- Update trigger for grace_period
CREATE TRIGGER update_grace_period_updated_at BEFORE UPDATE ON grace_period
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
