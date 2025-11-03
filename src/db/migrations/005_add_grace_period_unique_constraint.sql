-- Add UNIQUE constraint on user_id in grace_period table
-- This is required for ON CONFLICT (user_id) DO UPDATE clause in gracePeriodService
ALTER TABLE grace_period ADD CONSTRAINT grace_period_user_id_unique UNIQUE (user_id);
