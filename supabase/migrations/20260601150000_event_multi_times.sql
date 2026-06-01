-- Event times redesign:
--   * date_end is now optional — many events don't publish an end time.
--   * start_time_label gives the primary start time an optional label
--     ("Reception", "Doors", etc).
--   * additional_times stores extra labeled time slots on the same event
--     date (e.g., "Reception at 6 PM" + "Concert at 7 PM"). Each entry:
--     { "label": string, "time": "HH:MM" } — the date is implied by the
--     event's date_start. Stored as JSONB so it's flexible and indexed
--     out of the way.

ALTER TABLE events ALTER COLUMN date_end DROP NOT NULL;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS start_time_label TEXT;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS additional_times JSONB NOT NULL DEFAULT '[]'::jsonb;
