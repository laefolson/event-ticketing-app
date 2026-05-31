'use client';

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, formatDate } from '@/lib/utils';

interface DatePickerProps {
  /** ISO date string in YYYY-MM-DD form, or empty string for no selection. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

function parseYmd(value: string): Date | undefined {
  if (!value) return undefined;
  // Parse as a local date so we don't shift across timezones.
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePicker({
  value,
  onChange,
  id,
  disabled = false,
  placeholder = 'Pick a date',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !selected && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? formatDate(selected, 'EEE, MMM d, yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            if (d) {
              onChange(toYmd(d));
              setOpen(false);
            }
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
