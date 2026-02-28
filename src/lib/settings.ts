import { createServiceClient } from '@/lib/supabase/service';

const DEFAULT_VENUE_NAME = 'The Barn';

export async function getVenueName(): Promise<string> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'venue_name')
    .single();

  if (!data?.value) return DEFAULT_VENUE_NAME;

  try {
    return JSON.parse(data.value as string) || DEFAULT_VENUE_NAME;
  } catch {
    return DEFAULT_VENUE_NAME;
  }
}
