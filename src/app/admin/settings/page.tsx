export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SettingsForm } from './settings-form';

const integrations = [
  { name: 'Stripe', description: 'Payments', envKey: 'STRIPE_SECRET_KEY' },
  { name: 'Twilio', description: 'SMS', envKey: 'TWILIO_ACCOUNT_SID' },
  { name: 'Resend', description: 'Email', envKey: 'RESEND_API_KEY' },
] as const;

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/auth/login?redirectTo=/admin/settings');
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

  // Check integration status (presence only, never expose values)
  const integrationStatus = integrations.map((integration) => ({
    ...integration,
    connected: !!process.env[integration.envKey],
  }));

  // Fetch venue name and default host bio
  const { data: venueNameRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'venue_name')
    .single();

  const venueName: string = venueNameRow?.value
    ? JSON.parse(venueNameRow.value as string)
    : 'The Barn';

  const { data: hostBioRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'default_host_bio')
    .single();

  const defaultHostBio: string = hostBioRow?.value
    ? JSON.parse(hostBioRow.value as string)
    : '';

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Integrations */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Integrations</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrationStatus.map((integration) => (
            <Card key={integration.envKey}>
              <CardHeader>
                <CardTitle>{integration.name}</CardTitle>
                <CardDescription>{integration.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge variant={integration.connected ? 'default' : 'outline'}>
                  {integration.connected ? 'Connected' : 'Not Configured'}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Managed via environment variables
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* General Settings */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">General</h2>
        <Card>
          <CardHeader>
            <CardDescription>
              Configure your venue name and default host bio for new events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm venueName={venueName} defaultHostBio={defaultHostBio} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
