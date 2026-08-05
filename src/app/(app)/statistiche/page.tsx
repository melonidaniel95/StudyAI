import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import {
  getErrors,
  getExamOverviews,
  getExerciseAttempts,
  getProfile,
  getRecentSessions,
  getTasksBetween,
} from '@/server/data';
import { addDaysIso, todayIso, weekStartIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { StatsDashboard } from './stats-dashboard';

export const metadata: Metadata = { title: 'Statistiche' };
export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const profile = await getProfile(user.id);
  if (!profile) redirect('/onboarding');

  const today = todayIso(profile.timezone);
  const from = addDaysIso(today, -84);

  const [sessions, tasks, overviews, exerciseAttempts, errors] = await Promise.all([
    getRecentSessions(user.id, 400),
    getTasksBetween(user.id, from, today),
    getExamOverviews(user.id, { today }),
    getExerciseAttempts(user.id),
    getErrors(user.id),
  ]);

  // Ore studiate per settimana
  const weekly = new Map<string, number>();
  for (const session of sessions) {
    const date = session.started_at.slice(0, 10);
    if (date < from) continue;
    const key = weekStartIso(date);
    weekly.set(key, (weekly.get(key) ?? 0) + session.effective_minutes);
  }

  // Ore per esame
  const perExam = new Map<string, number>();
  for (const session of sessions) {
    perExam.set(session.exam_id, (perExam.get(session.exam_id) ?? 0) + session.effective_minutes);
  }

  // Pianificato vs reale per settimana
  const plannedWeekly = new Map<string, number>();
  const completedWeekly = new Map<string, number>();
  for (const task of tasks) {
    const key = weekStartIso(task.scheduled_date);
    plannedWeekly.set(key, (plannedWeekly.get(key) ?? 0) + task.planned_minutes);
    if (task.status === 'completata') {
      completedWeekly.set(
        key,
        (completedWeekly.get(key) ?? 0) + (task.actual_minutes ?? task.planned_minutes),
      );
    }
  }

  // Andamento della memoria: media del richiamo dichiarato per settimana
  const recallWeekly = new Map<string, { sum: number; count: number }>();
  for (const session of sessions) {
    if (session.recall === null) continue;
    const key = weekStartIso(session.started_at.slice(0, 10));
    const entry = recallWeekly.get(key) ?? { sum: 0, count: 0 };
    entry.sum += session.recall;
    entry.count += 1;
    recallWeekly.set(key, entry);
  }

  const errorsByType = new Map<string, number>();
  for (const error of errors) {
    errorsByType.set(error.error_type, (errorsByType.get(error.error_type) ?? 0) + 1);
  }

  // Giorni consecutivi con almeno una sessione
  const studyDays = new Set(sessions.map((session) => session.started_at.slice(0, 10)));
  let streak = 0;
  let cursor = today;
  while (studyDays.has(cursor) && streak < 400) {
    streak += 1;
    cursor = addDaysIso(cursor, -1);
  }

  const completedTasks = tasks.filter((task) => task.status === 'completata');
  const plannedTasks = tasks.filter((task) => task.status !== 'riprogrammata');

  const estimateAccuracy =
    completedTasks.length > 0
      ? completedTasks.reduce(
          (sum, task) => sum + Math.abs((task.actual_minutes ?? task.planned_minutes) - task.planned_minutes),
          0,
        ) / completedTasks.length
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiche"
        description="Numeri utili per decidere, non per giudicarti: servono a capire dove il metodo funziona."
      />
      <StatsDashboard
        weeklyMinutes={[...weekly.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([week, minutes]) => ({ week, minutes }))}
        plannedVsDone={[...plannedWeekly.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([week, planned]) => ({
            week,
            planned,
            done: completedWeekly.get(week) ?? 0,
          }))}
        recallTrend={[...recallWeekly.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([week, value]) => ({ week, recall: value.sum / value.count }))}
        perExam={overviews.map((overview) => ({
          name: overview.exam.short_name ?? overview.exam.name,
          minutes: perExam.get(overview.exam.id) ?? 0,
          readiness: overview.readiness.overall,
          color: overview.exam.color,
        }))}
        errorsByType={[...errorsByType.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => ({ type, count }))}
        summary={{
          totalMinutes: sessions.reduce((sum, session) => sum + session.effective_minutes, 0),
          sessions: sessions.length,
          completionRate:
            plannedTasks.length > 0 ? completedTasks.length / plannedTasks.length : null,
          exerciseAccuracy:
            exerciseAttempts.length > 0
              ? exerciseAttempts.filter((attempt) => attempt.is_correct).length /
                exerciseAttempts.length
              : null,
          streak,
          estimateAccuracyMinutes: estimateAccuracy,
        }}
      />
    </div>
  );
}
