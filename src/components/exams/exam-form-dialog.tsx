'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createExamAction, updateExamAction } from '@/server/actions/exams';

export interface ExamFormValues {
  id?: string;
  name: string;
  shortName: string;
  cfu: string;
  kind: string;
  hasExercises: boolean;
  hasOral: boolean;
  difficulty: number;
  initialLevel: number;
  priority: number;
  estimatedHours: string;
  notes: string;
}

const EMPTY: ExamFormValues = {
  name: '',
  shortName: '',
  cfu: '',
  kind: 'scritto',
  hasExercises: true,
  hasOral: false,
  difficulty: 3,
  initialLevel: 1,
  priority: 3,
  estimatedHours: '',
  notes: '',
};

export function ExamFormDialog({ exam }: { exam?: ExamFormValues }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ExamFormValues>(exam ?? EMPTY);

  const isEdit = Boolean(exam?.id);

  function submit() {
    const formData = new FormData();
    formData.set('name', values.name);
    formData.set('shortName', values.shortName);
    formData.set('cfu', values.cfu);
    formData.set('kind', values.kind);
    formData.set('hasExercises', String(values.hasExercises));
    formData.set('hasOral', String(values.hasOral));
    formData.set('difficulty', String(values.difficulty));
    formData.set('initialLevel', String(values.initialLevel));
    formData.set('priority', String(values.priority));
    formData.set('estimatedHours', values.estimatedHours);
    formData.set('notes', values.notes);

    startTransition(async () => {
      const result = isEdit && exam?.id
        ? await updateExamAction(exam.id, formData)
        : await createExamAction(formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setOpen(false);
      if (!isEdit) setValues(EMPTY);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? 'outline' : 'default'} size={isEdit ? 'sm' : 'default'}>
          {isEdit ? (
            <>
              <Pencil className="h-4 w-4" aria-hidden />
              Modifica
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" aria-hidden />
              Nuovo esame
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Modifica esame' : 'Nuovo esame'}</DialogTitle>
          <DialogDescription>
            Difficoltà e livello iniziale servono al motore di pianificazione per stimare il tempo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="exam-name">Nome dell’esame</Label>
            <Input
              id="exam-name"
              value={values.name}
              onChange={(event) => setValues({ ...values, name: event.target.value })}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-short">Nome breve</Label>
              <Input
                id="exam-short"
                value={values.shortName}
                onChange={(event) => setValues({ ...values, shortName: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-cfu">CFU</Label>
              <Input
                id="exam-cfu"
                type="number"
                min={0}
                max={30}
                value={values.cfu}
                onChange={(event) => setValues({ ...values, cfu: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-kind">Tipo di prova</Label>
              <select
                id="exam-kind"
                value={values.kind}
                onChange={(event) => setValues({ ...values, kind: event.target.value })}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="scritto">Scritto</option>
                <option value="orale">Orale</option>
                <option value="misto">Scritto e orale</option>
                <option value="idoneita">Idoneità</option>
                <option value="progetto">Progetto</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-hours">Ore totali stimate</Label>
              <Input
                id="exam-hours"
                type="number"
                min={0}
                max={1000}
                value={values.estimatedHours}
                onChange={(event) => setValues({ ...values, estimatedHours: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                { key: 'difficulty', label: 'Difficoltà (1-5)' },
                { key: 'initialLevel', label: 'Livello iniziale (1-5)' },
                { key: 'priority', label: 'Priorità (1-5)' },
              ] as const
            ).map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`exam-${field.key}`}>{field.label}</Label>
                <Input
                  id={`exam-${field.key}`}
                  type="number"
                  min={1}
                  max={5}
                  value={values[field.key]}
                  onChange={(event) =>
                    setValues({ ...values, [field.key]: Number(event.target.value) })
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.hasExercises}
                onChange={(event) => setValues({ ...values, hasExercises: event.target.checked })}
                className="h-4 w-4"
              />
              Prevede esercizi
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.hasOral}
                onChange={(event) => setValues({ ...values, hasOral: event.target.checked })}
                className="h-4 w-4"
              />
              Prevede una prova orale
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exam-notes">Note</Label>
            <Textarea
              id="exam-notes"
              value={values.notes}
              onChange={(event) => setValues({ ...values, notes: event.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Annulla
          </Button>
          <Button onClick={submit} loading={pending}>
            {isEdit ? 'Salva modifiche' : 'Crea esame'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
