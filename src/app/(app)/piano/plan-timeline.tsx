'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CalendarOff, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { moveTaskAction } from '@/server/actions/planning';
import { formatItalianDate, formatMinutes } from '@/lib/domain/dates';
import type { ActivityType, IsoDate, TaskStatus } from '@/lib/domain/types';

interface PlanTask {
  id: string;
  date: IsoDate;
  examId: string;
  title: string;
  activityType: ActivityType;
  plannedMinutes: number;
  status: TaskStatus;
  explanation: string[];
}

interface CapacityDay {
  date: IsoDate;
  plannable: number;
  isUnavailable: boolean;
  reason: string | null;
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  teoria: 'Teoria',
  esercizi: 'Esercizi',
  ripasso: 'Ripasso',
  simulazione: 'Simulazione',
  recupero_attivo: 'Recupero attivo',
  lettura: 'Lettura',
  correzione_errori: 'Correzione errori',
  altro: 'Altro',
};

export function PlanTimeline({
  tasks,
  capacity,
  exams,
  today,
}: {
  tasks: PlanTask[];
  capacity: CapacityDay[];
  exams: Record<string, { name: string; color: string }>;
  today: IsoDate;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragged, setDragged] = useState<string | null>(null);

  const byDate = new Map<IsoDate, PlanTask[]>();
  for (const task of tasks) {
    const list = byDate.get(task.date) ?? [];
    list.push(task);
    byDate.set(task.date, list);
  }

  function drop(date: IsoDate) {
    if (!dragged) return;
    const taskId = dragged;
    setDragged(null);
    startTransition(async () => {
      const result = await moveTaskAction(taskId, date);
      if (result.ok) toast.success(result.message, { duration: 7000 });
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <ol className="space-y-3">
      {capacity.map((day) => {
        const dayTasks = byDate.get(day.date) ?? [];
        const planned = dayTasks
          .filter((task) => task.status !== 'saltata')
          .reduce((sum, task) => sum + task.plannedMinutes, 0);
        const over = day.plannable > 0 && planned > day.plannable;

        return (
          <li
            key={day.date}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => drop(day.date)}
          >
            <Card className={day.isUnavailable ? 'border-dashed bg-muted/30' : undefined}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {formatItalianDate(day.date)}
                    {day.date === today ? <Badge className="ml-2">Oggi</Badge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {day.isUnavailable ? (
                      <span className="flex items-center gap-1">
                        <CalendarOff className="h-3.5 w-3.5" aria-hidden />
                        Non disponibile{day.reason ? ` · ${day.reason}` : ''}
                      </span>
                    ) : (
                      `${formatMinutes(planned)} su ${formatMinutes(day.plannable)} pianificabili`
                    )}
                  </p>
                </div>

                {over ? (
                  <p className="flex items-center gap-1.5 rounded-md bg-accent/10 p-2 text-xs">
                    <Info className="h-3.5 w-3.5 text-accent" aria-hidden />
                    Questa giornata supera il tempo che ti eri dato.
                  </p>
                ) : null}

                {dayTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessuna attività pianificata.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {dayTasks.map((task) => (
                      <li
                        key={task.id}
                        draggable
                        onDragStart={() => setDragged(task.id)}
                        className="flex cursor-grab flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: exams[task.examId]?.color ?? '#4C6382' }}
                            aria-hidden
                          />
                          <span className="truncate">{task.title}</span>
                          <Badge variant="muted">{ACTIVITY_LABELS[task.activityType]}</Badge>
                          {task.status === 'completata' ? (
                            <Badge variant="accent">Fatta</Badge>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatMinutes(task.plannedMinutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </li>
        );
      })}
      <li className="pt-1 text-center text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => router.refresh()}>
          Trascina un’attività su un altro giorno per spostarla
        </Button>
      </li>
    </ol>
  );
}
