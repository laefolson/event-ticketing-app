'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ActionResponse } from '@/types/actions';

export async function deleteEvent(eventId: string): Promise<ActionResponse> {
  const supabase = await createClient();

  // Verify the event exists and is archived
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .single();

  if (fetchError || !event) {
    return { success: false, error: 'Event not found.' };
  }

  if (event.status !== 'archived') {
    return { success: false, error: 'Only archived events can be deleted.' };
  }

  // Delete tickets first — ticket_tiers has ON DELETE RESTRICT from tickets
  const { error: ticketsError } = await supabase
    .from('tickets')
    .delete()
    .eq('event_id', eventId);

  if (ticketsError) {
    return { success: false, error: 'Failed to delete tickets: ' + ticketsError.message };
  }

  // Clean up storage: remove all files under event-assets/{eventId}/
  const adminClient = createAdminClient();
  const { data: files } = await adminClient.storage
    .from('event-assets')
    .list(eventId);

  if (files && files.length > 0) {
    const filePaths = files.map((f) => `${eventId}/${f.name}`);
    await adminClient.storage.from('event-assets').remove(filePaths);
  }

  // Delete the event — CASCADE handles tiers, contacts, csv_imports, invitation_logs
  const { error: deleteError } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (deleteError) {
    return { success: false, error: 'Failed to delete event: ' + deleteError.message };
  }

  return { success: true };
}
