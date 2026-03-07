import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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
