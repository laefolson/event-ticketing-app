export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TeamManager } from './team-manager';
import type { TeamMember } from '@/types/database';

export default async function TeamPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?redirectTo=/admin/team');
  }

  // Verify caller is admin
  const { data: currentMember } = await supabase
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!currentMember || currentMember.role !== 'admin') {
    redirect('/admin');
  }

  // Fetch all team members
  const { data: members } = await supabase
    .from('team_members')
    .select('*')
    .order('invited_at', { ascending: true });

  // Resolve real MFA status from Supabase Auth for all members
  const adminClient = createAdminClient();
  const membersWithMfa = await Promise.all(
    ((members ?? []) as TeamMember[]).map(async (member) => {
      const { data } = await adminClient.auth.admin.mfa.listFactors({
        userId: member.user_id,
      });
      const hasVerifiedTotp = data?.factors?.some(
        (f) => f.factor_type === 'totp' && f.status === 'verified'
      ) ?? false;
      return { ...member, mfa_enabled: hasVerifiedTotp };
    })
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <TeamManager
        members={membersWithMfa}
        currentUserId={user.id}
      />
    </div>
  );
}
