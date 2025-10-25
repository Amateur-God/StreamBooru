ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'users_username_uniq'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX users_username_uniq ON users((lower(username)))';
  END IF;
END$$;