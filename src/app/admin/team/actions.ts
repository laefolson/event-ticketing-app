'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResponse } from '@/types/actions';
import type { TeamRole } from '@/types/database';

const inviteSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Valid email is required'),
  role: z.enum(['admin', 'helper']),
});

export type InviteInput = z.infer<typeof inviteSchema>;

async function requireAdmin(): Promise<
  { userId: string } | { error: string }
> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: 'You must be logged in.' };
  }

  const { data: member } = await supabase
    .from('team_members')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!member || member.role !== 'admin') {
    return { error: 'Only admins can manage team members.' };
  }

  return { userId: user.id };
}

export async function inviteTeamMember(
  input: InviteInput
): Promise<ActionResponse<{ memberId: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { success: false, error: firstError.message };
  }

  const auth = await requireAdmin();
  if ('error' in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = await createClient();

  // Check for duplicate email
  const { data: existing } = await supabase
    .from('team_members')
    .select('id')
    .eq('email', parsed.data.email)
    .single();

  if (existing) {
    return { success: false, error: 'A team member with this email already exists.' };
  }

  // Create auth user + send invite email
  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return { success: false, error: 'Server configuration error: admin client unavailable.' };
  }

  const headersList = await headers();
  const origin = headersList.get('origin') ?? '';
  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback?redirectTo=/auth/mfa`,
    });

  if (inviteError) {
    return { success: false, error: inviteError.message };
  }

  // Insert team_members record
  const { data, error } = await adminClient
    .from('team_members')
    .insert({
      user_id: inviteData.user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: { memberId: data.id } };
}

export async function updateTeamMemberRole(
  memberId: string,
  role: TeamRole
): Promise<ActionResponse> {
  if (!['admin', 'helper'].includes(role)) {
    return { success: false, error: 'Invalid role.' };
  }

  const auth = await requireAdmin();
  if ('error' in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = await createClient();

  // Prevent self-demotion
  const { data: target } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('id', memberId)
    .single();

  if (!target) {
    return { success: false, error: 'Team member not found.' };
  }

  if (target.user_id === auth.userId && role !== 'admin') {
    return { success: false, error: 'You cannot demote yourself.' };
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return { success: false, error: 'Server configuration error: admin client unavailable.' };
  }

  const { error } = await adminClient
    .from('team_members')
    .update({ role })
    .eq('id', memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function removeTeamMember(
  memberId: string
): Promise<ActionResponse> {
  const auth = await requireAdmin();
  if ('error' in auth) {
    return { success: false, error: auth.error };
  }

  const supabase = await createClient();

  // Prevent self-removal
  const { data: target } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('id', memberId)
    .single();

  if (!target) {
    return { success: false, error: 'Team member not found.' };
  }

  if (target.user_id === auth.userId) {
    return { success: false, error: 'You cannot remove yourself.' };
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return { success: false, error: 'Server configuration error: admin client unavailable.' };
  }

  // Delete team_members record first
  const { error: deleteError } = await adminClient
    .from('team_members')
    .delete()
    .eq('id', memberId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Delete auth user
  const { error: authDeleteError } =
    await adminClient.auth.admin.deleteUser(target.user_id);

  if (authDeleteError) {
    return { success: false, error: authDeleteError.message };
  }

  return { success: true };
}
