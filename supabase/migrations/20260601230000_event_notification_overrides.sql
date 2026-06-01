-- Per-event overrides for outbound save-the-date and invitation messages.
-- All fields are optional; senders fall back to baked-in defaults when null.
--
-- Save-the-date:
--   * intro_text  — replaces the "Mark your calendar for X" line after the greeting
--   * sms_body    — replaces the default SMS body
--   (image and additional text already exist as save_the_date_image_url / save_the_date_text)
--
-- Invitation:
--   * intro_text       — replaces the "We'd love for you to join us at X" line
--   * image_url        — primary marketing image at the top of the body
--   * after_image_text — optional copy directly below that image
--   * sms_body         — replaces the default SMS body

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS save_the_date_intro_text TEXT,
  ADD COLUMN IF NOT EXISTS save_the_date_sms_body TEXT,
  ADD COLUMN IF NOT EXISTS invitation_intro_text TEXT,
  ADD COLUMN IF NOT EXISTS invitation_image_url TEXT,
  ADD COLUMN IF NOT EXISTS invitation_after_image_text TEXT,
  ADD COLUMN IF NOT EXISTS invitation_sms_body TEXT;
