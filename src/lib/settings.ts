import { createServiceClient } from '@/lib/supabase/service';

const DEFAULT_VENUE_NAME = 'The Barn';

export async function getVenueName(): Promise<string> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'venue_name')
    .single();

  if (error) {
    console.error('Failed to fetch venue name:', error.message);
    return DEFAULT_VENUE_NAME;
  }

  return (data?.value as string) || DEFAULT_VENUE_NAME;
}
