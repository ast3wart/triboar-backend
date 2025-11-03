-- Add 'grace' tier to the CHECK constraint
ALTER TABLE users DROP CONSTRAINT users_tier_check;
ALTER TABLE users ADD CONSTRAINT users_tier_check CHECK (tier IN ('free', 'paid', 'grace'));
