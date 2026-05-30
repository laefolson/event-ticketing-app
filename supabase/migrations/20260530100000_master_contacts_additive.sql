-- Phase 1 (additive) of the master contact system.
-- Adds master_contacts, rewires contacts as a join table by adding new
-- columns, and backfills them from existing contact data. The original
-- name/email/phone columns on contacts are intentionally retained so the
-- migrated data can be verified before a follow-up migration drops them.

-- ============================================================
-- 1. New enums
-- ============================================================
CREATE TYPE contact_source AS ENUM (
  'manual', 'csv_import', 'google_sheets', 'checkout', 'rsvp'
);

CREATE TYPE contact_added_by AS ENUM (
  'csv_import', 'google_sheets', 'manual', 'checkout', 'rsvp', 'event_copy'
);

-- ============================================================
-- 2. Shared trigger function for updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. master_contacts table
-- ============================================================
CREATE TABLE master_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  sms_opt_in_event_updates BOOLEAN NOT NULL DEFAULT FALSE,
  sms_opt_in_marketing BOOLEAN NOT NULL DEFAULT FALSE,
  email_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  source contact_source NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_master_contacts_email_lower ON master_contacts (lower(email));

CREATE TRIGGER trg_master_contacts_set_updated_at
  BEFORE UPDATE ON master_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE master_contacts ENABLE ROW LEVEL SECURITY;

-- Team members (admins or helpers) can read master_contacts.
CREATE POLICY "Team members can view master_contacts"
  ON master_contacts FOR SELECT
  USING (public.is_team_member());

-- Team members can insert/update/delete master_contacts.
CREATE POLICY "Team members can manage master_contacts"
  ON master_contacts FOR ALL
  USING (public.is_team_member());

-- ============================================================
-- 4. Populate master_contacts from existing contacts.
--    DISTINCT ON (lower(email)) + ORDER BY ... imported_at DESC yields
--    one row per email, taking name/phone from the most recent record.
--    Email-less contacts are excluded (master_contacts.email is NOT NULL UNIQUE);
--    they will be addressed in the follow-up migration.
-- ============================================================
INSERT INTO master_contacts (first_name, last_name, email, phone, source)
SELECT DISTINCT ON (lower(c.email))
  COALESCE(NULLIF(TRIM(c.first_name), ''), '') AS first_name,
  COALESCE(NULLIF(TRIM(c.last_name),  ''), '') AS last_name,
  lower(TRIM(c.email))                         AS email,
  NULLIF(TRIM(c.phone), '')                    AS phone,
  'csv_import'::contact_source                 AS source
FROM contacts c
WHERE c.email IS NOT NULL AND TRIM(c.email) <> ''
ORDER BY lower(c.email), c.imported_at DESC NULLS LAST;

-- ============================================================
-- 5. Add the join-table columns to contacts.
--    Existing name/email/phone columns are left in place for verification.
-- ============================================================
ALTER TABLE contacts ADD COLUMN master_contact_id UUID REFERENCES master_contacts(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD COLUMN added_by contact_added_by;
ALTER TABLE contacts ADD COLUMN save_the_date_sent_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================
-- 6. Backfill the new columns
-- ============================================================

-- master_contact_id by lower(email) match
UPDATE contacts c
SET master_contact_id = mc.id
FROM master_contacts mc
WHERE mc.email = lower(TRIM(c.email))
  AND c.email IS NOT NULL
  AND TRIM(c.email) <> '';

-- added_by: csv_import where a csv_source exists, otherwise manual
UPDATE contacts
SET added_by = CASE
  WHEN csv_source IS NOT NULL THEN 'csv_import'::contact_added_by
  ELSE 'manual'::contact_added_by
END;

-- created_at aligned with the original imported_at when available
UPDATE contacts
SET created_at = imported_at
WHERE imported_at IS NOT NULL;

-- ============================================================
-- 7. Indexes and unique constraint
-- ============================================================
CREATE INDEX idx_contacts_master_contact_id ON contacts(master_contact_id);

-- One row per (event, master_contact). NULL master_contact_ids are not
-- constrained — email-less contacts retain NULL until the follow-up migration.
ALTER TABLE contacts ADD CONSTRAINT unique_event_master_contact
  UNIQUE (event_id, master_contact_id);
