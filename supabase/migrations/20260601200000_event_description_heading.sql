-- Replace the per-event Host Bio + Host Bio Headline with a single
-- customizable section heading. The host bio content was redundant with
-- the description (admins can fold it into the description field), and
-- the hardcoded "Event Details" section title becomes a per-event field.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS description_heading TEXT;

ALTER TABLE events DROP COLUMN IF EXISTS host_bio;
ALTER TABLE events DROP COLUMN IF EXISTS host_bio_headline;

-- The settings page no longer has a Default Host Bio field; drop its
-- backing key-value row from app_settings.
DELETE FROM app_settings WHERE key = 'default_host_bio';
