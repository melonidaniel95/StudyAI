'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  Info,
  Play,
  SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { completeTaskAction, skipTaskAction, updateTaskDurationAction } from '@/server/actions/planning';
import { startSessionAction } from '@/server/actions/sessions';
import { formatMinutes } from '@/lib/domain/dates';
import type { StudyTask } from '@/types/db';
import type { ActivityType } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { ExamIcon } from '@/lib/exam-icons';

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

interface TaskListProps {
  tasks: StudyTask[];
  exams: Record<string, { name: string; color: string; icon: string }>;
  topicTitles: Record<string, string>;
}

export function TaskList({ tasks, exams, topicTitles }: TaskListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draftMinutes, setDraftMinutes] = useState(0);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  function start(taskId: string) {
    startTransition(async () => {
      const result = await startSessionAction(taskId);
      if (result.ok && result.sessionId) {
        router.push(`/sessione/${result.sessionId}`);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => {
        const exam = exams[task.exam_id];
        const done = task.status === 'completata';
        const topicTitle = task.topic_id ? topicTitles[task.topic_id] : undefined;

        return (
          <li key={task.id}>
            <Card className={cn(done && 'opacity-70')}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ExamIcon icon={exam?.icon} color={exam?.color} size={15} />
                      <span className="text-xs font-medium text-muted-foreground">
                        {exam?.name ?? 'Esame'}
                      </span>
                      <Badge variant="muted">{ACTIVITY_LABELS[task.activity_type]}</Badge>
                      {done ? <Badge variant="accent">Completata</Badge> : null}
                    </div>
                    <p className={cn('font-medium', done && 'line-through')}>{task.title}</p>
                    {topicTitle && !task.title.includes(topicTitle) ? (
                      <p className="text-xs text-muted-foreground">Argomento: {topicTitle}</p>
                    ) : null}
                    {task.objective ? (
                      <p className="text-sm text-muted-foreground">{task.objective}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" aria-hidden />
                    {editing === task.id ? (
                      <span className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={5}
                          max={480}
                          step={5}
                          value={draftMinutes}
                          onChange={(event) => setDraftMinutes(Number(event.target.value))}
                          className="h-8 w-20"
                          aria-label="Durata in minuti"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => {
                            setEditing(null);
                            run(() => updateTaskDurationAction(task.id, draftMinutes));
                          }}
                        >
                          Salva
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rounded px-1 tabular-nums underline-offset-4 hover:underline"
                        onClick={() => {
                          setEditing(task.id);
                          setDraftMinutes(task.planned_minutes);
                        }}
                        aria-label={`Modifica durata: attualmente ${task.planned_minutes} minuti`}
                      >
                        {formatMinutes(task.planned_minutes)}
                      </button>
                    )}
                  </div>
                </div>

                {task.priority_explanation.length > 0 ? (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="why" className="border-b-0">
                      <AccordionTrigger className="py-1 text-xs text-muted-foreground hover:no-underline">
                        <span className="flex items-center gap-1.5">
                          <Info className="h-3.5 w-3.5" aria-hidden />
                          Perché è in questa posizione
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-2">
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {task.priority_explanation.map((reason) => (
                            <li key={reason}>• {reason}</li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ) : null}

                {!done ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => start(task.id)} disabled={pending}>
                      <Play className="h-4 w-4" aria-hidden />
                      Inizia sessione
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => completeTaskAction(task.id))}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                      Completa
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => skipTaskAction(task.id))}
                    >
                      <SkipForward className="h-4 w-4" aria-hidden />
                      Non posso farlo oggi
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
      <li className="pt-1 text-center text-xs text-muted-foreground">
        <ChevronDown className="mx-auto mb-1 h-4 w-4" aria-hidden />
        Le attività sono ordinate per priorità: urgenza, distanza dalla preparazione e arretrati.
      </li>
    </ul>
  );
}
