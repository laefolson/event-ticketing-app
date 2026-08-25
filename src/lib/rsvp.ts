/**
 * Shared constants for the guest-notes field on the RSVP form. Lives outside
 * the route folders because both the client form and the server action need
 * the same default label and length cap.
 */

export const DEFAULT_RSVP_GUEST_NOTES_LABEL = "Who's attending with you?";

export const RSVP_GUEST_NOTES_MAX_LENGTH = 1000;

/** Falls back to the default whenever the event has no custom label set. */
export function guestNotesLabel(label: string | null | undefined): string {
  return label?.trim() || DEFAULT_RSVP_GUEST_NOTES_LABEL;
}
