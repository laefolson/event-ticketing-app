-- Add customizable headline for the host bio section on the public event page.
-- Defaults to NULL; the application falls back to "About the Host" when NULL.
ALTER TABLE events ADD COLUMN host_bio_headline TEXT;
