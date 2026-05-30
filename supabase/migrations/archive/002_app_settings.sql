-- App-wide settings key-value store
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '""',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read settings" ON app_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can upsert settings" ON app_settings
  FOR ALL USING (true);

-- Seed default host bio
INSERT INTO app_settings (key, value) VALUES ('default_host_bio', '""');
