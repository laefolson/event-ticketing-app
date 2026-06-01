'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateVenueName } from './actions';

interface SettingsFormProps {
  venueName: string;
}

export function SettingsForm({ venueName: initialVenueName }: SettingsFormProps) {
  const router = useRouter();
  const [venueNameValue, setVenueNameValue] = useState(initialVenueName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setError(null);
    setSuccess(false);
    setPending(true);

    const result = await updateVenueName(venueNameValue);
    setPending(false);

    if (!result.success) {
      setError(result.error ?? 'Failed to save venue name.');
      return;
    }

    setSuccess(true);
    router.refresh();
    setTimeout(() => setSuccess(false), 3000);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="venue-name">Venue Name</Label>
        <Input
          id="venue-name"
          value={venueNameValue}
          onChange={(e) => setVenueNameValue(e.target.value)}
          placeholder="Enter your venue name..."
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">
          Used in email headers and footers. {venueNameValue.length}/200 characters
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200">
          Settings saved successfully.
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
