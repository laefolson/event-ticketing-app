'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Upload, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { importMasterContacts, type MasterImportResult } from './actions';
import type { MasterCsvRow } from '@/lib/master-contacts-import';

function normalizeHeader(h: string): string {
  const k = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (k) {
    case 'first_name':
    case 'firstname':
    case 'first':
    case 'fname':
      return 'first_name';
    case 'last_name':
    case 'lastname':
    case 'last':
    case 'lname':
    case 'surname':
      return 'last_name';
    case 'email':
    case 'e_mail':
    case 'email_address':
      return 'email';
    case 'phone':
    case 'mobile':
    case 'cell':
    case 'phone_number':
      return 'phone';
    case 'sms_opt_in':
    case 'sms_consent':
      return 'sms_opt_in';
    default:
      return k;
  }
}

export function ImportCsvDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MasterImportResult | null>(null);

  function reset() {
    setFile(null);
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError('CSV file must be under 5 MB.');
      e.target.value = '';
      return;
    }
    setFile(f);
  }

  function handleImport() {
    if (!file) return;
    setError(null);

    startTransition(async () => {
      try {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: normalizeHeader,
        });
        if (parsed.errors.length > 0 && parsed.data.length === 0) {
          setError('Failed to parse CSV file. Please check the format.');
          return;
        }
        const headers = parsed.meta.fields ?? [];
        const missing = ['first_name', 'last_name', 'email'].filter((h) => !headers.includes(h));
        if (missing.length > 0) {
          setError(
            `CSV is missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
            'Aliases like "fname"/"firstname", "lastname"/"surname", "email_address" are accepted.'
          );
          return;
        }
        const rows: MasterCsvRow[] = parsed.data.map((row) => ({
          first_name: row.first_name?.trim() ?? '',
          last_name: row.last_name?.trim() ?? '',
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          sms_opt_in: row.sms_opt_in ?? null,
        }));
        const res = await importMasterContacts(rows);
        if (!res.success) {
          setError(res.error ?? 'Import failed.');
          return;
        }
        setResult(res.data!);
        toast.success(`Imported: ${res.data!.added} added, ${res.data!.updated} matched`);
        router.refresh();
      } catch {
        setError('An error occurred while processing the file.');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{result ? 'Import complete' : 'Import contacts CSV'}</DialogTitle>
          <DialogDescription>
            {result
              ? 'Your CSV has been imported into the master list.'
              : 'Upload a CSV to add or update contacts in the master list.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-green-800 dark:text-green-200">
                  {result.added} added &middot; {result.updated} matched &middot; {result.skipped} skipped
                </p>
                <p className="text-green-700 dark:text-green-300">
                  out of {result.totalRows} {result.totalRows === 1 ? 'row' : 'rows'}
                </p>
                {(result.optInEventPromoted > 0 || result.optInMarketingPromoted > 0) && (
                  <ul className="text-green-700 dark:text-green-300 list-disc list-inside pt-1 space-y-0.5">
                    {result.optInEventPromoted > 0 && (
                      <li>
                        {result.optInEventPromoted} SMS event-update opt-in{result.optInEventPromoted === 1 ? '' : 's'} added
                      </li>
                    )}
                    {result.optInMarketingPromoted > 0 && (
                      <li>
                        {result.optInMarketingPromoted} SMS marketing opt-in{result.optInMarketingPromoted === 1 ? '' : 's'} added
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {result.skippedDetails.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Skipped rows:</p>
                <div className="max-h-40 overflow-y-auto rounded-md border p-3 text-xs">
                  {result.skippedDetails.map((s, i) => (
                    <div key={i} className="text-muted-foreground py-0.5">
                      Row {s.row}: {s.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="master-csv-file">Choose file</Label>
              <Input
                ref={fileInputRef}
                id="master-csv-file"
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFileChange}
              />
            </div>

            <div className="text-muted-foreground rounded-md border p-3 text-xs leading-relaxed">
              <p className="mb-1 font-medium text-foreground">Expected columns:</p>
              <p><strong>first_name</strong>, <strong>last_name</strong>, <strong>email</strong> (required)</p>
              <p><strong>phone</strong> (optional)</p>
              <p><strong>sms_opt_in</strong> (optional: true/false/yes/no/1/0)</p>
              <p className="mt-1">
                Existing contacts are matched by email (case-insensitive). Opt-in
                flags are never downgraded to false from CSV.
              </p>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} disabled={pending}>Cancel</Button>
              <Button onClick={handleImport} disabled={!file || pending}>
                {pending ? 'Importing…' : 'Import'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
