import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarClock, CalendarDays, ListChecks, RefreshCw, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import { getDashboardData } from '@/server/data';
import { formatItalianDate, formatMinutes, relativeDayLabel } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Stat } from '@/components/shared/stat';
import { RiskBadge } from '@/components/shared/risk-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TaskList } from './task-list';
import { GeneratePlanButton } from '@/components/plan/generate-plan-button';
import { BacklogCard } from '@/components/plan/backlog-card';
import { OverloadNotice } from '@/components/plan/overload-notice';
import { NotificationScheduler } from '@/components/pwa/notification-scheduler';

export const metadata: Metadata = { title: 'Oggi' };
export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const data = await getDashboardData(user.id);
  if (!data) redirect('/onboarding');

  const { today, todayTasks, backlogTasks, dueReviews, overviews, todayCapacityMinutes } = data;

  const activeTasks = todayTasks.filter((task) => task.status !== 'saltata');
  const plannedMinutes = activeTasks
    .filter((task) => task.status !== 'completata')
    .reduce((sum, task) => sum + task.planned_minutes, 0);
  const doneMinutes = activeTasks
    .filter((task) => task.status === 'completata')
    .reduce((sum, task) => sum + (task.actual_minutes ?? task.planned_minutes), 0);

  const examsById = new Map(overviews.map((o) => [o.exam.id, o]));

  const nextExam = overviews
    .filter((o) => o.primarySession || o.nextSession)
    .map((o) => ({ overview: o, date: (o.primarySession ?? o.nextSession)!.exam_date }))
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <div className="space-y-6">
      <NotificationScheduler
        enabled={data.profile.notifications_enabled}
        dueReviews={dueReviews.length}
        pendingTasks={activeTasks.filter((task) => task.status !== 'completata').length}
      />
      <PageHeader
        title="Il tuo piano di oggi"
        description={formatItalianDate(today)}
        actions={<GeneratePlanButton />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Tempo disponibile"
          value={formatMinutes(todayCapacityMinutes)}
          hint={`Pianificato: ${formatMinutes(plannedMinutes)}`}
          icon={CalendarClock}
        />
        <Stat
          label="Già studiato oggi"
          value={formatMinutes(doneMinutes)}
          hint={`${activeTasks.filter((t) => t.status === 'completata').length} attività completate`}
          icon={ListChecks}
        />
        <Stat
          label="Ripassi in scadenza"
          value={String(dueReviews.length)}
          hint={dueReviews.length > 0 ? 'Hanno la precedenza sul nuovo programma' : 'Nessuno per oggi'}
          icon={RefreshCw}
        />
        <Stat
          label="Prossimo appello"
          value={nextExam ? relativeDayLabel(today, nextExam.date) : '—'}
          hint={nextExam ? (nextExam.overview.exam.short_name ?? nextExam.overview.exam.name) : 'Nessun appello impostato'}
          icon={CalendarDays}
        />
      </div>

      <OverloadNotice
        plannedMinutes={plannedMinutes + doneMinutes}
        capacityMinutes={todayCapacityMinutes}
        bufferRatio={Number(data.profile.weekly_buffer_ratio)}
      />

      {nextExam ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Prossimo esame: {nextExam.overview.exam.short_name ?? nextExam.overview.exam.name}
              </span>
              <RiskBadge risk={nextExam.overview.feasibility.risk} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {formatItalianDate(nextExam.date)} · {relativeDayLabel(today, nextExam.date)} ·
              preparazione {Math.round(nextExam.overview.readiness.overall * 100)}%
            </p>
            <p>{nextExam.overview.feasibility.message}</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {nextExam.overview.feasibility.reasons.slice(0, 2).map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href={`/esami/${nextExam.overview.exam.id}`}>Apri la scheda dell’esame</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {backlogTasks.length > 0 ? <BacklogCard count={backlogTasks.length} /> : null}

      {activeTasks.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Oggi non c’è ancora niente in programma"
          description={
            overviews.length === 0
              ? 'Aggiungi il tuo primo esame, poi genera il piano: StudyOS distribuirà il lavoro sul tempo che hai davvero.'
              : 'Genera il piano automatico: verrà costruito sul tuo tempo reale, lasciando un margine per gli imprevisti.'
          }
          action={
            overviews.length === 0 ? (
              <Button asChild>
                <Link href="/esami">Vai agli esami</Link>
              </Button>
            ) : (
              <GeneratePlanButton />
            )
          }
        />
      ) : (
        <TaskList
          tasks={activeTasks}
          exams={Object.fromEntries(
            [...examsById.entries()].map(([id, overview]) => [
              id,
              {
                name: overview.exam.short_name ?? overview.exam.name,
                color: overview.exam.color,
              },
            ]),
          )}
          topicTitles={Object.fromEntries(
            overviews.flatMap((o) => o.topics.map((t) => [t.id, t.title] as const)),
          )}
        />
      )}

      {dueReviews.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Ripassi in scadenza</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {dueReviews.length} argomenti da rivedere: bastano pochi minuti ciascuno.
            </p>
            <Button asChild size="sm">
              <Link href="/ripassi">Inizia i ripassi</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
