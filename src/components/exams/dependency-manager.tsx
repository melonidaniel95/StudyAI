'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { createDependencyAction, deleteDependencyAction } from '@/server/actions/exams';

interface DependencyRow {
  id: string;
  examId: string;
  strength: string;
}

export function DependencyManager({
  examId,
  examNames,
  prerequisites,
  dependents,
  availableExams,
}: {
  examId: string;
  examNames: Record<string, string>;
  prerequisites: DependencyRow[];
  dependents: DependencyRow[];
  availableExams: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState('');
  const [strength, setStrength] = useState<'forte' | 'consigliata'>('forte');

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Serve prima di questo esame</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {prerequisites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun prerequisito impostato.</p>
          ) : (
            <ul className="space-y-2">
              {prerequisites.map((dependency) => (
                <li
                  key={dependency.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                >
                  <span className="truncate">
                    {examNames[dependency.examId] ?? 'Esame'}
                    <span className="ml-1 text-xs text-muted-foreground">({dependency.strength})</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Rimuovi prerequisito"
                    disabled={pending}
                    onClick={() => run(() => deleteDependencyAction(dependency.id))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t pt-3">
            <Label htmlFor="new-dependency">Aggiungi un prerequisito</Label>
            <div className="flex flex-wrap gap-2">
              <select
                id="new-dependency"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="h-10 flex-1 rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Scegli un esame…</option>
                {availableExams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
              <select
                value={strength}
                onChange={(event) => setStrength(event.target.value as typeof strength)}
                aria-label="Tipo di prerequisito"
                className="h-10 rounded-md border border-input bg-card px-2 text-sm"
              >
                <option value="forte">Forte</option>
                <option value="consigliata">Consigliata</option>
              </select>
              <Button
                disabled={!selected || pending}
                onClick={() => {
                  run(() => createDependencyAction(examId, selected, strength));
                  setSelected('');
                }}
              >
                <Link2 className="h-4 w-4" aria-hidden />
                Collega
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Esami che dipendono da questo</CardTitle>
        </CardHeader>
        <CardContent>
          {dependents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun esame dipende da questo.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dependents.map((dependency) => (
                <li key={dependency.id} className="rounded-md border p-2">
                  {examNames[dependency.examId] ?? 'Esame'}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
