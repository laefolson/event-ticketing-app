'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function login(
  prevState: { error: string | null },
  formData: FormData
) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: 'Invalid email or password.' };
  }

  // After successful password login, redirect to MFA page.
  // The MFA page handles both enrollment (first time) and challenge (returning).
  const mfaRedirect = redirectTo ?? '/admin';
  redirect(`/auth/mfa?redirectTo=${encodeURIComponent(mfaRedirect)}`);
}
