-- Tighten RLS policies for tickets and app_settings tables

-- ============================================================
-- TICKETS: Remove overly-permissive public policies
-- Public ticket operations now go through the service-role client.
-- ============================================================

-- Drop the public SELECT policy (was USING TRUE)
DROP POLICY IF EXISTS "Public can view own tickets" ON tickets;

-- Drop the public INSERT policy (was WITH CHECK TRUE)
DROP POLICY IF EXISTS "Public can create tickets" ON tickets;

-- The "Team members can manage tickets" policy remains unchanged.


-- ============================================================
-- APP_SETTINGS: Restrict to authenticated team members
-- ============================================================

-- Drop the overly-permissive policies
DROP POLICY IF EXISTS "Admins can read settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can upsert settings" ON app_settings;

-- Team members can read settings
CREATE POLICY "Team members can read settings" ON app_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
    )
  );

-- Only admins can modify settings
CREATE POLICY "Admins can modify settings" ON app_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
      AND team_members.role = 'admin'
    )
  );
