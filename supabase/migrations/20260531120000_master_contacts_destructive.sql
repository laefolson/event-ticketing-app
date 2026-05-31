-- Phase C destructive migration: drop the legacy contacts columns now that
-- every read in the app uses the master_contacts join and every write only
-- populates the join-table columns. Also locks master_contact_id as NOT
-- NULL since every contacts row must now point at a master_contact.

-- Step 1: backfill master_contacts for any orphan rows that have email but
-- no master_contact_id (data created between the additive migration and the
-- code refactor). Idempotent: ON CONFLICT keeps existing master records.
INSERT INTO master_contacts (first_name, last_name, email, phone, source)
SELECT DISTINCT ON (lower(c.email))
  COALESCE(NULLIF(TRIM(c.first_name), ''), '') AS first_name,
  COALESCE(NULLIF(TRIM(c.last_name),  ''), '') AS last_name,
  lower(TRIM(c.email))                         AS email,
  NULLIF(TRIM(c.phone), '')                    AS phone,
  'csv_import'::contact_source                 AS source
FROM contacts c
WHERE c.master_contact_id IS NULL
  AND c.email IS NOT NULL
  AND TRIM(c.email) <> ''
ORDER BY lower(c.email), c.created_at DESC NULLS LAST
ON CONFLICT (email) DO NOTHING;

-- Step 2: link the orphan contacts rows to their (now-existing) masters —
-- but only when no master-linked row already occupies (event_id, master).
UPDATE contacts c
SET master_contact_id = mc.id
FROM master_contacts mc
WHERE c.master_contact_id IS NULL
  AND mc.email = lower(TRIM(c.email))
  AND c.email IS NOT NULL
  AND TRIM(c.email) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contacts other
    WHERE other.event_id = c.event_id
      AND other.master_contact_id = mc.id
  );

-- Step 3: anything still orphaned is a duplicate of an already-linked row
-- (or has no email and can't be reconciled). Remove them so we can lock in
-- NOT NULL below. In prod this is a no-op (contacts table is empty).
DELETE FROM contacts WHERE master_contact_id IS NULL;

-- Step 4: drop the index that referenced contacts.email.
DROP INDEX IF EXISTS idx_contacts_email;

-- Drop the legacy duplicated-from-master columns.
ALTER TABLE contacts DROP COLUMN IF EXISTS first_name;
ALTER TABLE contacts DROP COLUMN IF EXISTS last_name;
ALTER TABLE contacts DROP COLUMN IF EXISTS email;
ALTER TABLE contacts DROP COLUMN IF EXISTS phone;

-- Drop the legacy bookkeeping columns; csv_imports still tracks file-level
-- import metadata and contacts.created_at replaces imported_at.
ALTER TABLE contacts DROP COLUMN IF EXISTS csv_source;
ALTER TABLE contacts DROP COLUMN IF EXISTS imported_at;

-- Every contacts row must now correspond to a master_contact.
ALTER TABLE contacts ALTER COLUMN master_contact_id SET NOT NULL;
