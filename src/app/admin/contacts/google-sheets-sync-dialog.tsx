'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet as SheetIcon, CheckCircle2, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  detectSheetHeaders,
  previewGoogleSheetSync,
  runGoogleSheetSync,
  getSavedSheetSyncConfig,
  type SheetMapping,
  type SheetSyncResult,
  type SheetHeadersResult,
} from './actions';

type Step = 'url' | 'mapping' | 'preview' | 'done';

const NONE = '__none__';
const EMPTY_MAPPING: SheetMapping = {
  first_name: '',
  last_name: '',
  email: '',
  phone: undefined,
  sms_opt_in: undefined,
};

export function GoogleSheetsSyncDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('url');
  const [url, setUrl] = useState('');
  const [detected, setDetected] = useState<SheetHeadersResult | null>(null);
  const [mapping, setMapping] = useState<SheetMapping>(EMPTY_MAPPING);
  const [previewResult, setPreviewResult] = useState<SheetSyncResult | null>(null);
  const [finalResult, setFinalResult] = useState<SheetSyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep('url');
    setUrl('');
    setDetected(null);
    setMapping(EMPTY_MAPPING);
    setPreviewResult(null);
    setFinalResult(null);
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  // Pre-fill the URL (and mapping) from the last successful sync, if any.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await getSavedSheetSyncConfig();
      if (res.success && res.data) {
        setUrl(res.data.url);
        setMapping(res.data.mapping);
      }
    })();
  }, [open]);

  function handleDetect() {
    setError(null);
    startTransition(async () => {
      const res = await detectSheetHeaders(url);
      if (!res.success || !res.data) {
        setError(res.error ?? 'Failed to load sheet headers.');
        return;
      }
      setDetected(res.data);
      // If mapping is empty (first run), use the suggested defaults.
      setMapping((m) => {
        if (m.first_name || m.last_name || m.email) return m;
        return res.data!.suggestedMapping;
      });
      setStep('mapping');
    });
  }

  function handlePreview() {
    setError(null);
    startTransition(async () => {
      const res = await previewGoogleSheetSync(url, mapping);
      if (!res.success || !res.data) {
        setError(res.error ?? 'Preview failed.');
        return;
      }
      setPreviewResult(res.data);
      setStep('preview');
    });
  }

  function handleApply() {
    setError(null);
    startTransition(async () => {
      const res = await runGoogleSheetSync(url, mapping);
      if (!res.success || !res.data) {
        setError(res.error ?? 'Sync failed.');
        return;
      }
      setFinalResult(res.data);
      toast.success(`Synced: ${res.data.added} added, ${res.data.updated} matched`);
      setStep('done');
      router.refresh();
    });
  }

  function updateMapping<K extends keyof SheetMapping>(key: K, value: string) {
    setMapping((m) => ({
      ...m,
      [key]: value === NONE ? undefined : value,
    }));
  }

  const headerOptions = detected?.headers ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SheetIcon className="h-4 w-4 mr-2" />
          Sync Google Sheet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'url' && 'Sync from a Google Sheet'}
            {step === 'mapping' && 'Map sheet columns'}
            {step === 'preview' && 'Preview sync'}
            {step === 'done' && 'Sync complete'}
          </DialogTitle>
          <DialogDescription>
            {step === 'url' && 'Paste a public Google Sheet URL. The sheet must be shared as "Anyone with the link can view."'}
            {step === 'mapping' && 'Tell us which sheet column corresponds to each contact field.'}
            {step === 'preview' && 'Review what will change before applying.'}
            {step === 'done' && 'Your master list has been updated.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {step === 'url' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sheet-url">Google Sheet URL</Label>
              <Input
                id="sheet-url"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close} disabled={pending}>Cancel</Button>
              <Button onClick={handleDetect} disabled={!url || pending}>
                {pending ? 'Detecting…' : 'Detect columns'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'mapping' && detected && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground rounded-md border p-3">
              Detected <span className="text-foreground font-medium">{detected.headers.length}</span>{' '}
              {detected.headers.length === 1 ? 'column' : 'columns'} on tab{' '}
              <span className="text-foreground font-medium">&ldquo;{detected.sheetName}&rdquo;</span>{' '}
              · <span className="text-foreground font-medium">{detected.rowCount}</span>{' '}
              data {detected.rowCount === 1 ? 'row' : 'rows'} to import.
            </div>

            <MappingRow label="First name" required value={mapping.first_name} options={headerOptions} onChange={(v) => updateMapping('first_name', v)} />
            <MappingRow label="Last name" required value={mapping.last_name} options={headerOptions} onChange={(v) => updateMapping('last_name', v)} />
            <MappingRow label="Email" required value={mapping.email} options={headerOptions} onChange={(v) => updateMapping('email', v)} />
            <MappingRow label="Phone" value={mapping.phone ?? ''} options={headerOptions} onChange={(v) => updateMapping('phone', v)} allowNone />
            <MappingRow label="SMS opt-in" value={mapping.sms_opt_in ?? ''} options={headerOptions} onChange={(v) => updateMapping('sms_opt_in', v)} allowNone />

            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('url')} disabled={pending}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handlePreview}
                disabled={pending || !mapping.first_name || !mapping.last_name || !mapping.email}
              >
                {pending ? 'Loading…' : 'Preview'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && previewResult && (
          <div className="space-y-4">
            <SummaryBlock result={previewResult} title="If applied, this sync will:" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('mapping')} disabled={pending}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleApply} disabled={pending}>
                {pending ? 'Applying…' : `Apply (${previewResult.added + previewResult.updated} writes)`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'done' && finalResult && (
          <div className="space-y-4">
            <SummaryBlock result={finalResult} title="Sync complete." done />
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MappingRow({
  label, required, value, options, onChange, allowNone = false,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Label className="w-28 shrink-0">
        {label}{required && <span className="text-red-500"> *</span>}
      </Label>
      <Select value={value || NONE} onValueChange={onChange}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Choose a column…" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>— None —</SelectItem>}
          {options.map((h) => (
            <SelectItem key={h} value={h}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SummaryBlock({
  result, title, done = false,
}: {
  result: SheetSyncResult;
  title: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
      {done && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />}
      <div className="space-y-1 text-sm">
        <p className="font-medium text-green-800 dark:text-green-200">{title}</p>
        <p className="text-green-700 dark:text-green-300">
          {result.added} added &middot; {result.updated} matched &middot; {result.skipped} skipped
          {' '}<span className="text-green-700/80">(of {result.totalRows} rows)</span>
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
        {result.skippedDetails.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-green-700 dark:text-green-300">
              {result.skippedDetails.length} skipped {result.skippedDetails.length === 1 ? 'row' : 'rows'}
            </summary>
            <div className="mt-1 max-h-32 overflow-y-auto rounded-md border bg-background p-2">
              {result.skippedDetails.map((s, i) => (
                <div key={i} className="text-muted-foreground py-0.5">
                  Row {s.row}: {s.reason}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
