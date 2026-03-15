import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatInTimeZone } from 'date-fns-tz'

const VENUE_TZ = 'America/Denver';

export function formatDate(date: string | Date, pattern: string): string {
  return formatInTimeZone(date, VENUE_TZ, pattern);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const TICKET_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateTicketCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += TICKET_CODE_CHARS[Math.floor(Math.random() * TICKET_CODE_CHARS.length)];
  }
  return `TIX-${code}`;
}
