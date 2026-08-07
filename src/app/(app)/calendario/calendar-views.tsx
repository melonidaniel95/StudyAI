'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { CalendarOff, ChevronLeft, ChevronRight, GraduationCap, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { moveTaskAction } from '@/server/actions/planning';
import {
  addDaysIso,
  daysBetween,
  formatItalianDate,
  formatMinutes,
  isoWeekday,
  weekStartIso,
} from '@/lib/domain/dates';
import type { ActivityType, IsoDate, SessionRole, TaskStatus } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { ExamIcon } from '@/lib/exam-icons';

interface CalendarTask {
  id: string;
  date: IsoDate;
  examId: string;
  title: string;
  minutes: number;
  activityType: ActivityType;
  status: TaskStatus;
}

interface ExamDate {
  date: IsoDate;
  examId: string;
  label: string;
  role: SessionRole;
  isEstimated: boolean;
}

interface ReviewDate {
  date: IsoDate;
  title: string;
  examId: string;
}

const WEEKDAY_LABELS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

export function CalendarViews({
  today,
  targetDate,
  exams,
  tasks,
  examDates,
  reviews,
  unavailable,
}: {
  today: IsoDate;
  targetDate: IsoDate;
  exams: Record<string, { name: string; color: string; icon: string }>;
  tasks: CalendarTask[];
  examDates: ExamDate[];
  reviews: ReviewDate[];
  unavailable: Array<{ date: IsoDate; reason: string | null }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [anchor, setAnchor] = useState<IsoDate>(today);
  const [dragged, setDragged] = useState<string | null>(null);
  /*
   * Per impostazione predefinita compaiono solo gli appelli che hai scelto
   * (principale e riserva): mostrarli tutti riempie il calendario di date
   * che non stai preparando. L'elenco completo resta a un clic di distanza,
   * utile quando devi decidere quale appello selezionare.
   */
  const [mostraTuttiGliAppelli, setMostraTuttiGliAppelli] = useState(false);

  const appelliVisibili = useMemo(
    () => (mostraTuttiGliAppelli ? examDates : examDates.filter((item) => item.role !== 'nessuno')),
    [examDates, mostraTuttiGliAppelli],
  );
  const appelliNascosti = examDates.length - appelliVisibili.length;

  const tasksByDate = useMemo(() => {
    const map = new Map<IsoDate, CalendarTask[]>();
    for (const task of tasks) {
      const list = map.get(task.date) ?? [];
      list.push(task);
      map.set(task.date, list);
    }
    return map;
  }, [tasks]);

  const examsByDate = useMemo(() => {
    const map = new Map<IsoDate, ExamDate[]>();
    for (const item of appelliVisibili) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [appelliVisibili]);

  const reviewsByDate = useMemo(() => {
    const map = new Map<IsoDate, ReviewDate[]>();
    for (const item of reviews) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [reviews]);

  const unavailableSet = useMemo(
    () => new Map(unavailable.map((item) => [item.date, item.reason])),
    [unavailable],
  );

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

  // ---- vista mese ----
  const monthStart = `${anchor.slice(0, 7)}-01`;
  const monthGrid = useMemo(() => {
    const firstWeekday = isoWeekday(monthStart);
    const start = addDaysIso(monthStart, -(firstWeekday - 1));
    return Array.from({ length: 42 }, (_, index) => addDaysIso(start, index));
  }, [monthStart]);

  const weekDays = useMemo(() => {
    const start = weekStartIso(anchor);
    return Array.from({ length: 7 }, (_, index) => addDaysIso(start, index));
  }, [anchor]);

  function DayCell({ date, compact = false }: { date: IsoDate; compact?: boolean }) {
    const dayTasks = tasksByDate.get(date) ?? [];
    const dayExams = examsByDate.get(date) ?? [];
    const dayReviews = reviewsByDate.get(date) ?? [];
    const isUnavailable = unavailableSet.has(date);
    const isToday = date === today;
    const inMonth = date.slice(0, 7) === anchor.slice(0, 7);

    return (
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => drop(date)}
        className={cn(
          'min-h-24 rounded-md border p-1.5 text-xs',
          isToday && 'border-primary ring-1 ring-primary',
          isUnavailable && 'bg-muted/60',
          !inMonth && !compact && 'opacity-45',
        )}
      >
        <p className="mb-1 flex items-center justify-between font-medium">
          <span>{Number(date.slice(8, 10))}</span>
          {isUnavailable ? <CalendarOff className="h-3 w-3" aria-hidden /> : null}
        </p>

        {dayExams.map((item) => (
          <p
            key={`${item.examId}-${item.date}`}
            className="mb-0.5 flex items-center gap-1 truncate rounded bg-accent/20 px-1 py-0.5"
          >
            <GraduationCap className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
            {item.isEstimated ? <span aria-label="data stimata">~</span> : null}
          </p>
        ))}

        {dayReviews.slice(0, 2).map((item) => (
          <p key={`${item.title}-${item.date}`} className="mb-0.5 flex items-center gap-1 truncate text-muted-foreground">
            <RefreshCw className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{item.title}</span>
          </p>
        ))}

        {dayTasks.slice(0, compact ? 6 : 3).map((task) => (
          <p
            key={task.id}
            draggable
            onDragStart={() => setDragged(task.id)}
            className={cn(
              'mb-0.5 flex cursor-grab items-center gap-1 truncate rounded px-1 py-0.5',
              task.status === 'completata' ? 'line-through opacity-60' : 'bg-secondary/60',
            )}
            title={`${task.title} · ${formatMinutes(task.minutes)}`}
          >
            <ExamIcon icon={exams[task.examId]?.icon} color={exams[task.examId]?.color} size={11} />
            <span className="truncate">{task.title}</span>
          </p>
        ))}

        {dayTasks.length > (compact ? 6 : 3) ? (
          <p className="text-muted-foreground">+{dayTasks.length - (compact ? 6 : 3)} altre</p>
        ) : null}
      </div>
    );
  }

  return (
    <Tabs defaultValue="mese">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="giorno">Giorno</TabsTrigger>
          <TabsTrigger value="settimana">Settimana</TabsTrigger>
          <TabsTrigger value="mese">Mese</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={mostraTuttiGliAppelli}
              onChange={(event) => setMostraTuttiGliAppelli(event.target.checked)}
            />
            {mostraTuttiGliAppelli
              ? 'Tutti gli appelli'
              : `Solo appelli scelti${appelliNascosti > 0 ? ` (${appelliNascosti} nascosti)` : ''}`}
          </label>
          <Button
            variant="outline"
            size="icon"
            aria-label="Periodo precedente"
            onClick={() => setAnchor((value) => addDaysIso(value, -30))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
            Oggi
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Periodo successivo"
            onClick={() => setAnchor((value) => addDaysIso(value, 30))}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <TabsContent value="giorno">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="font-medium">{formatItalianDate(anchor)}</p>
            <DayCell date={anchor} compact />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="settimana">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {weekDays.map((date, index) => (
            <div key={date} className="space-y-1">
              <p className="text-center text-xs font-medium text-muted-foreground">
                {WEEKDAY_LABELS[index]}
              </p>
              <DayCell date={date} compact />
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="mese">
        <p className="mb-2 text-sm font-medium capitalize">
          {formatItalianDate(monthStart, 'MMMM yyyy')}
        </p>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <p key={label} className="pb-1 text-center text-xs font-medium text-muted-foreground">
              {label}
            </p>
          ))}
          {monthGrid.map((date) => (
            <DayCell key={date} date={date} />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="timeline">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              Da oggi alla data obiettivo ({formatItalianDate(targetDate)}) mancano{' '}
              {daysBetween(today, targetDate)} giorni.
            </p>
            <ol className="space-y-2">
              {appelliVisibili
                .filter((item) => item.date >= today)
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((item) => (
                  <li
                    key={`${item.examId}-${item.date}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <ExamIcon icon={exams[item.examId]?.icon} color={exams[item.examId]?.color} size={15} />
                      {item.label}
                      {item.role === 'principale' ? <Badge>Principale</Badge> : null}
                      {item.role === 'riserva' ? <Badge variant="secondary">Riserva</Badge> : null}
                      {item.isEstimated ? <Badge variant="accent">Stimata</Badge> : null}
                    </span>
                    <span className="text-muted-foreground">
                      {formatItalianDate(item.date)} · tra {daysBetween(today, item.date)} giorni
                    </span>
                  </li>
                ))}
            </ol>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
