'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Gauge, Save, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ConfirmButton } from '@/components/shared/confirm-button';
import {
  deleteSegmentAction,
  recalibratePaceAction,
  updateExamPaceAction,
} from '@/server/actions/materials';
import { resourceProgress } from '@/lib/domain/materials';
import { formatMinutes, formatShortDate } from '@/lib/domain/dates';
import { percent } from '@/lib/utils';

interface SegmentRow {
  id: string;
  title: string;
  resourceTitle: string;
  lectureNumber: number | null;
  pageStart: number;
  pageEnd: number;
  pagesDone: number;
  estimatedMinutes: number;
  actualMinutes: number;
  kind: 'teoria' | 'esercizi' | 'riferimento';
  contentDifficulty: number | null;
}

export function MaterialOverview({
  examId,
  segments,
  minutesPerPage,
  minutesPerPageExercises,
  paceSamples,
  paceUpdatedAt,
}: {
  examId: string;
  segments: SegmentRow[];
  minutesPerPage: number;
  minutesPerPageExercises: number;
  paceSamples: number;
  paceUpdatedAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pace, setPace] = useState(String(minutesPerPage));
  const [paceExercises, setPaceExercises] = useState(String(minutesPerPageExercises));

  const grouped = useMemo(() => {
    const map = new Map<string, SegmentRow[]>();
    for (const segment of segments) {
      const key =
        segment.lectureNumber !== null
          ? `L${String(segment.lectureNumber).padStart(2, '0')} — ${segment.resourceTitle}`
          : segment.resourceTitle;
      const list = map.get(key) ?? [];
      list.push(segment);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'it'));
  }, [segments]);

  const studiable = segments.filter((segment) => segment.kind !== 'riferimento');
  const totalPages = studiable.reduce(
    (sum, segment) => sum + (segment.pageEnd - segment.pageStart + 1),
    0,
  );
  const donePages = studiable.reduce((sum, segment) => sum + segment.pagesDone, 0);
  const totalMinutes = studiable.reduce((sum, segment) => sum + segment.estimatedMinutes, 0);
  const doneMinutes = studiable.reduce((sum, segment) => sum + segment.actualMinutes, 0);

  const progress = resourceProgress(
    studiable.map((segment) => ({
      pageCount: segment.pageEnd - segment.pageStart + 1,
      pagesDone: segment.pagesDone,
    })),
  );

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message, { duration: 8000 });
      else toast.error(result.message);
      router.refresh();
    });
  }

  if (segments.length === 0) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Avanzamento sul materiale</CardTitle>
          <CardDescription>
            {donePages} pagine coperte su {totalPages} · {formatMinutes(doneMinutes)} studiati su{' '}
            {formatMinutes(totalMinutes)} stimati
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Pagine coperte</span>
              <span className="font-semibold tabular-nums">{percent(progress)}%</span>
            </div>
            <Progress value={percent(progress)} aria-label="Pagine coperte" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ov-pace">Minuti per pagina — teoria</Label>
              <Input
                id="ov-pace"
                type="number"
                min={0.1}
                max={60}
                step={0.5}
                value={pace}
                onChange={(event) => setPace(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-pace-ex">Minuti per pagina — esercizi</Label>
              <Input
                id="ov-pace-ex"
                type="number"
                min={0.1}
                max={90}
                step={0.5}
                value={paceExercises}
                onChange={(event) => setPaceExercises(event.target.value)}
              />
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" aria-hidden />
            {paceSamples > 0
              ? `Ritmo tarato su ${paceSamples} sessioni${paceUpdatedAt ? ` · ultimo aggiornamento ${formatShortDate(paceUpdatedAt.slice(0, 10))}` : ''}.`
              : 'Ritmo non ancora tarato: servono almeno 3 sessioni con le pagine registrate.'}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => updateExamPaceAction(examId, Number(pace), Number(paceExercises)))}
            >
              <Save className="h-4 w-4" aria-hidden />
              Salva ritmo
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => recalibratePaceAction(examId))}
            >
              <Wand2 className="h-4 w-4" aria-hidden />
              Ricalibra sui miei tempi reali
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Blocchi di pagine ({segments.length})</CardTitle>
          <CardDescription>
            Ogni blocco diventa un’attività del piano con l’intervallo esatto da coprire.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {grouped.map(([resourceTitle, list]) => (
            <div key={resourceTitle} className="space-y-1.5">
              <p className="text-sm font-medium">{resourceTitle}</p>
              <ul className="space-y-1">
                {list
                  .sort((a, b) => a.pageStart - b.pageStart)
                  .map((segment) => {
                    const pages = segment.pageEnd - segment.pageStart + 1;
                    const done = Math.min(segment.pagesDone, pages);
                    return (
                      <li
                        key={segment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{segment.title}</span>
                          <span className="text-xs text-muted-foreground">
                            pagine {segment.pageStart}-{segment.pageEnd} · {done}/{pages} coperte
                            {segment.actualMinutes > 0
                              ? ` · ${formatMinutes(segment.actualMinutes)} reali`
                              : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {segment.kind !== 'teoria' ? (
                            <Badge variant={segment.kind === 'esercizi' ? 'secondary' : 'muted'}>
                              {segment.kind === 'esercizi' ? 'esercizi' : 'riferimento'}
                            </Badge>
                          ) : null}
                          {segment.contentDifficulty ? (
                            <Badge
                              variant={segment.contentDifficulty >= 4 ? 'accent' : 'muted'}
                              title="Difficoltà stimata dall’AI sul contenuto reale"
                            >
                              Difficoltà {segment.contentDifficulty}/5
                            </Badge>
                          ) : null}
                          {done >= pages ? <Badge variant="accent">Completo</Badge> : null}
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {segment.estimatedMinutes > 0
                              ? formatMinutes(segment.estimatedMinutes)
                              : '—'}
                          </span>
                          <ConfirmButton
                            trigger={
                              <Button size="icon" variant="ghost" aria-label="Elimina blocco">
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            }
                            title="Eliminare il blocco?"
                            description="Verrà eliminato anche l’argomento collegato nel programma."
                            onConfirm={async () => {
                              const result = await deleteSegmentAction(segment.id);
                              if (result.ok) toast.success(result.message);
                              else toast.error(result.message);
                              router.refresh();
                            }}
                          />
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
