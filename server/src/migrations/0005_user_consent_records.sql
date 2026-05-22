CREATE TABLE IF NOT EXISTS user_consent_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_record_id VARCHAR(160) NOT NULL,
  consent_version VARCHAR(80) NOT NULL,
  necessary_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  analytics_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(40) NOT NULL DEFAULT 'cookie_preferences',
  policy_label VARCHAR(120),
  consented_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash VARCHAR(64),
  user_agent_hash VARCHAR(64),
  UNIQUE (user_id, consent_record_id, consent_version)
);

CREATE INDEX IF NOT EXISTS user_consent_records_user_id_idx ON user_consent_records (user_id);
CREATE INDEX IF NOT EXISTS user_consent_records_analytics_allowed_idx ON user_consent_records (analytics_allowed);
