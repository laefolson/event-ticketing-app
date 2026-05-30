'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse } from '@/types/actions';
import type { MasterContact } from '@/types/database';
import {
  processMasterContactsCsv,
  type MasterCsvRow,
} from '@/lib/master-contacts-import';

const contactInputSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(120),
  last_name: z.string().trim().max(120).default(''),
  email: z.string().trim().toLowerCase().email('Valid email is required'),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  sms_opt_in_event_updates: z.boolean().optional().default(false),
  sms_opt_in_marketing: z.boolean().optional().default(false),
  email_opt_out: z.boolean().optional().default(false),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export type ContactInput = z.input<typeof contactInputSchema>;

export async function createMasterContact(
  raw: ContactInput
): Promise<ActionResponse<MasterContact>> {
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('master_contacts')
    .insert({
      first_name: v.first_name,
      last_name: v.last_name,
      email: v.email,
      phone: v.phone ? v.phone : null,
      sms_opt_in_event_updates: v.sms_opt_in_event_updates,
      sms_opt_in_marketing: v.sms_opt_in_marketing,
      email_opt_out: v.email_opt_out,
      source: 'manual',
      notes: v.notes ? v.notes : null,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A contact with that email already exists' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/contacts');
  return { success: true, data: data as MasterContact };
}

export async function updateMasterContact(
  id: string,
  raw: ContactInput
): Promise<ActionResponse<MasterContact>> {
  const parsed = contactInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('master_contacts')
    .update({
      first_name: v.first_name,
      last_name: v.last_name,
      email: v.email,
      phone: v.phone ? v.phone : null,
      sms_opt_in_event_updates: v.sms_opt_in_event_updates,
      sms_opt_in_marketing: v.sms_opt_in_marketing,
      email_opt_out: v.email_opt_out,
      notes: v.notes ? v.notes : null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A contact with that email already exists' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/admin/contacts');
  revalidatePath(`/admin/contacts/${id}`);
  return { success: true, data: data as MasterContact };
}

export async function deleteMasterContact(id: string): Promise<ActionResponse<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from('master_contacts').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/admin/contacts');
  return { success: true, data: { id } };
}

export interface MasterImportResult {
  totalRows: number;
  added: number;
  updated: number;
  skipped: number;
  optInEventPromoted: number;
  optInMarketingPromoted: number;
  skippedDetails: Array<{ row: number; reason: string }>;
}

export async function importMasterContacts(
  rows: MasterCsvRow[]
): Promise<ActionResponse<MasterImportResult>> {
  if (rows.length === 0) {
    return { success: false, error: 'CSV file is empty.' };
  }
  const payloadSize = new Blob([JSON.stringify(rows)]).size;
  if (payloadSize > 5 * 1024 * 1024) {
    return { success: false, error: 'CSV data exceeds 5 MB limit.' };
  }
  if (rows.length > 5000) {
    return { success: false, error: 'CSV file exceeds 5,000 row limit.' };
  }

  const supabase = await createClient();
  let summary;
  try {
    summary = await processMasterContactsCsv(supabase, rows);
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }

  revalidatePath('/admin/contacts');
  return {
    success: true,
    data: {
      totalRows: rows.length,
      added: summary.added,
      updated: summary.updated,
      skipped: summary.skipped,
      optInEventPromoted: summary.optInEventPromoted,
      optInMarketingPromoted: summary.optInMarketingPromoted,
      skippedDetails: summary.skippedDetails,
    },
  };
}
