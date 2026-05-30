-- Migration: Remove 'cancelled' from event_status enum
-- Strategy: delete cancelled events, then recreate the enum type without 'cancelled'

BEGIN;

-- 1. Delete tickets for cancelled events (FK RESTRICT on tickets→tiers)
DELETE FROM tickets
WHERE event_id IN (SELECT id FROM events WHERE status = 'cancelled');

-- 2. Delete cancelled events (CASCADE handles tiers, contacts, csv_imports, invitation_logs)
DELETE FROM events WHERE status = 'cancelled';

-- 3. Recreate enum without 'cancelled'
ALTER TYPE event_status RENAME TO event_status_old;

CREATE TYPE event_status AS ENUM ('draft', 'published', 'archived');

ALTER TABLE events ALTER COLUMN status DROP DEFAULT;

ALTER TABLE events
  ALTER COLUMN status TYPE event_status
  USING status::text::event_status;

ALTER TABLE events ALTER COLUMN status SET DEFAULT 'draft';

DROP TYPE event_status_old;

COMMIT;
