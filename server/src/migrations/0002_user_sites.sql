CREATE TABLE IF NOT EXISTS user_sites (
  site_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  rating TEXT NOT NULL,
  tags TEXT NOT NULL,
  credentials_enc JSONB NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS user_sites_user_order_idx ON user_sites(user_id, order_index ASC);
CREATE UNIQUE INDEX IF NOT EXISTS user_sites_user_type_base_uniq ON user_sites(user_id, type, base_url);