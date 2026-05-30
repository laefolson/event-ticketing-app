-- Fix: team_members RLS caused 42P17 infinite recursion because the
-- SELECT policy referenced team_members inside its own USING clause.
-- Replace with non-recursive policies that use SECURITY DEFINER helpers
-- (which run as the function owner and bypass RLS), so the recursion
-- cycle never starts.

-- Helper: is the current user an admin team member?
CREATE OR REPLACE FUNCTION public.is_team_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper: is the current user any team member?
CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = auth.uid()
  );
$$;

-- Replace the recursive policies on team_members.
DROP POLICY IF EXISTS "Team members can view team" ON team_members;
DROP POLICY IF EXISTS "Admins can manage team" ON team_members;

-- Any authenticated user may read their own row. This is what the
-- admin layout's isAdmin check needs.
CREATE POLICY "Users can view their own team_members row"
    ON team_members FOR SELECT
    USING (user_id = auth.uid());

-- Admins may read every team_members row (powers /admin/team listing).
CREATE POLICY "Admins can view all team_members"
    ON team_members FOR SELECT
    USING (public.is_team_admin());

-- Admins may insert/update/delete team_members.
CREATE POLICY "Admins can manage team_members"
    ON team_members FOR ALL
    USING (public.is_team_admin());
