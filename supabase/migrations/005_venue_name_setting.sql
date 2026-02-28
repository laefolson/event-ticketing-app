-- Seed default venue name setting
INSERT INTO app_settings (key, value)
VALUES ('venue_name', '"The Barn"')
ON CONFLICT (key) DO NOTHING;
