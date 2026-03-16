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

export function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free';
  return formatCents(cents);
}

export function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_BASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      console.error('NEXT_PUBLIC_BASE_URL is not set in production');
    }
    return 'http://localhost:3000';
  }
  return url;
}

export function generateTicketCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += TICKET_CODE_CHARS[Math.floor(Math.random() * TICKET_CODE_CHARS.length)];
  }
  return `TIX-${code}`;
}
