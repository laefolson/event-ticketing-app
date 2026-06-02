-- Track who supplied a master contact, so events with multiple parties
-- contributing guest lists can attribute each person back to whoever
-- introduced them. Free text, lowercase-normalized at the application
-- layer for dedup ("Alice", "alice", "ALICE" all collapse to "alice").
--
-- Only set on inserts during batch import (CSV / Google Sheets) — the
-- original contributor keeps the credit if the same email shows up in
-- a later batch from someone else.

ALTER TABLE master_contacts
  ADD COLUMN IF NOT EXISTS contributor_name TEXT;

-- Cheap btree for filtering / DISTINCT lookups; small table, low write rate.
CREATE INDEX IF NOT EXISTS idx_master_contacts_contributor_name
  ON master_contacts (contributor_name)
  WHERE contributor_name IS NOT NULL;
