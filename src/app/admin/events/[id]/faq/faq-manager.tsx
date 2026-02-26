'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { updateFaq } from './actions';
import type { FaqItem } from './actions';

interface FaqManagerProps {
  faq: FaqItem[];
  eventId: string;
}

const emptyForm = { question: '', answer: '' };

export function FaqManager({ faq: initialFaq, eventId }: FaqManagerProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditingIndex(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(index: number) {
    setEditingIndex(index);
    setForm({
      question: initialFaq[index].question,
      answer: initialFaq[index].answer,
    });
    setError(null);
    setDialogOpen(true);
  }

  async function save(updatedFaq: FaqItem[]) {
    setIsPending(true);
    const result = await updateFaq(eventId, updatedFaq);
    setIsPending(false);

    if (!result.success) {
      setError(result.error ?? 'Something went wrong.');
      return false;
    }

    router.refresh();
    return true;
  }

  async function handleSave() {
    setError(null);

    const trimmed = {
      question: form.question.trim(),
      answer: form.answer.trim(),
    };

    if (!trimmed.question || !trimmed.answer) {
      setError('Both question and answer are required.');
      return;
    }

    let updated: FaqItem[];
    if (editingIndex !== null) {
      updated = initialFaq.map((item, i) =>
        i === editingIndex ? trimmed : item
      );
    } else {
      updated = [...initialFaq, trimmed];
    }

    const ok = await save(updated);
    if (ok) {
      setDialogOpen(false);
    }
  }

  async function handleDelete(index: number) {
    const updated = initialFaq.filter((_, i) => i !== index);
    await save(updated);
  }

  async function handleMove(index: number, direction: 'up' | 'down') {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= initialFaq.length) return;
    const arr = [...initialFaq];
    [arr[index], arr[target]] = [arr[target], arr[index]];
    await save(arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">FAQ</h2>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Question
        </Button>
      </div>

      {error && !dialogOpen && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {initialFaq.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No FAQ yet. Add a question to help guests find answers.
            </p>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Question
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {initialFaq.map((item, index) => (
            <Card key={index}>
              <CardContent className="flex items-start justify-between gap-4 pt-6">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold">{item.question}</p>
                  <p className="text-muted-foreground text-sm">{item.answer}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleMove(index, 'up')}
                    disabled={index === 0 || isPending}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleMove(index, 'down')}
                    disabled={index === initialFaq.length - 1 || isPending}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(index)}
                    disabled={isPending}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(index)}
                    disabled={isPending}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? 'Edit Question' : 'Add Question'}
            </DialogTitle>
            <DialogDescription>
              {editingIndex !== null
                ? 'Update this FAQ entry.'
                : 'Add a new question and answer for guests.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && dialogOpen && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="faq-question">Question *</Label>
              <Input
                id="faq-question"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                placeholder="e.g. Is there parking available?"
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="faq-answer">Answer *</Label>
              <Textarea
                id="faq-answer"
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
                placeholder="Provide a helpful answer..."
                maxLength={2000}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
