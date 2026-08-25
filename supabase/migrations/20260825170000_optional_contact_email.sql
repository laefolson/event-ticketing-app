-- Make master_contacts.email optional so phone-only invite lists can be
-- imported. An SMS-first guest list (a wedding welcome dinner, say) often
-- carries no email addresses at all, and every such row was previously
-- skipped at import with "Missing email".
--
-- Email remains the identity key WHEN PRESENT. Phone deliberately does NOT
-- become a unique key: production already has 13 phone numbers shared by
-- two or more contacts (couples and households sharing a mobile), so a
-- unique index would fail to build and phone-based matching would merge
-- distinct people. Phone is a matching hint only, never a constraint.

-- 1. Drop the old uniqueness. It was on the raw `email` column while the
--    app lowercases on write, so 'Bob@x.com' and 'bob@x.com' could both
--    exist. The replacement below is case-insensitive.
ALTER TABLE public.master_contacts
  DROP CONSTRAINT IF EXISTS master_contacts_email_key;

ALTER TABLE public.master_contacts
  ALTER COLUMN email DROP NOT NULL;

-- 2. Case-insensitive uniqueness over the rows that have an email. Verified
--    buildable: production currently has 0 case-duplicate emails.
DROP INDEX IF EXISTS public.idx_master_contacts_email_lower;

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_contacts_email_lower_unique
  ON public.master_contacts (lower(email))
  WHERE email IS NOT NULL;

-- 3. Lookups do .eq('email', <already-lowercased>), which the functional
--    index above cannot serve. Keep a plain index for them.
CREATE INDEX IF NOT EXISTS idx_master_contacts_email
  ON public.master_contacts (email)
  WHERE email IS NOT NULL;

-- 4. Phone lookups back the name+phone match used to keep re-imports of the
--    same phone-only list from duplicating every row. Not unique.
CREATE INDEX IF NOT EXISTS idx_master_contacts_phone
  ON public.master_contacts (phone)
  WHERE phone IS NOT NULL;

-- 5. A contact has to be reachable somehow. Every existing row satisfies
--    this (email was NOT NULL until step 1).
ALTER TABLE public.master_contacts
  DROP CONSTRAINT IF EXISTS master_contacts_reachable;

ALTER TABLE public.master_contacts
  ADD CONSTRAINT master_contacts_reachable
  CHECK (email IS NOT NULL OR phone IS NOT NULL);
