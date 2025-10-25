-- Idempotent migration for Discord linking
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS discord_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_discord_id_uniq'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX users_discord_id_uniq ON users(discord_id) WHERE discord_id IS NOT NULL';
  END IF;
END$$;