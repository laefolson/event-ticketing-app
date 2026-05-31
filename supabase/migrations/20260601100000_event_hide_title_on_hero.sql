-- Optional per-event toggle to suppress the title text overlay on the
-- hero image (useful when the cover image already contains the event
-- name or band logo, so the overlay would be redundant).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS hide_title_on_hero BOOLEAN NOT NULL DEFAULT FALSE;
