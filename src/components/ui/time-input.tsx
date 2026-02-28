'use client';

import { useState, useRef, useEffect, type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Parse a flexible time string into { hours, minutes } in 24-hour format,
 * or null if unparseable.
 *
 * Accepted formats: "7pm", "7 pm", "7:00 PM", "7:00pm", "19:00", "7:00"
 */
function parseTime(raw: string): { hours: number; minutes: number } | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  // Match: optional hours, optional :minutes, optional am/pm
  const match = s.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/
  );
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]; // "am" | "pm" | "a" | "p" | undefined

  if (minutes < 0 || minutes > 59) return null;

  if (period === 'am' || period === 'a') {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0; // 12 AM = 0
  } else if (period === 'pm' || period === 'p') {
    if (hours < 1 || hours > 12) return null;
    if (hours !== 12) hours += 12; // 12 PM stays 12
  } else {
    // No period — treat as 24-hour if >= 13, otherwise literal
    if (hours < 0 || hours > 23) return null;
  }

  return { hours, minutes };
}

/** Convert 24-hour HH:MM to display string like "7:00 PM" */
function format24to12(hhmm: string): string {
  const parsed = parseTime(hhmm);
  if (!parsed) return hhmm;
  const { hours, minutes } = parsed;
  const period = hours >= 12 ? 'PM' : 'AM';
  const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${display}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/** Convert parsed time to HH:MM 24-hour string */
function toHHMM(hours: number, minutes: number): string {
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

interface TimeInputProps extends Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'type'> {
  value: string; // HH:MM 24-hour
  onChange: (value: string) => void;
}

export function TimeInput({ value, onChange, className, ...props }: TimeInputProps) {
  // Display value is the user-friendly 12-hour string
  const [displayValue, setDisplayValue] = useState(() =>
    value ? format24to12(value) : ''
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display when the external value changes (e.g. form reset, initial load)
  useEffect(() => {
    if (value) {
      setDisplayValue(format24to12(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDisplayValue(e.target.value);
  }

  function handleBlur() {
    if (!displayValue.trim()) {
      // Cleared — propagate empty
      onChange('');
      return;
    }

    const parsed = parseTime(displayValue);
    if (parsed) {
      const hhmm = toHHMM(parsed.hours, parsed.minutes);
      onChange(hhmm);
      setDisplayValue(format24to12(hhmm));
    }
    // If parse fails, leave the raw text so the user can fix it.
    // The form-level validation will catch it (value stays stale).
  }

  function handleFocus() {
    // Select all for easy overwrite
    inputRef.current?.select();
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="text"
      autoComplete="off"
      placeholder="hh:mm AM"
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      {...props}
    />
  );
}
