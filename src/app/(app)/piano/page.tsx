import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import {
  getAvailability,
  getBacklogTasks,
  getExamOverviews,
  getProfile,
  getTasksBetween,
  getUnavailableDates,
} from '@/server/data';
import { addDaysIso, todayIso } from '@/lib/domain/dates';
import { buildCapacityCalendar } from '@/lib/domain/availability';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { GeneratePlanButton } from '@/components/plan/generate-plan-button';
import { BacklogCard } from '@/components/plan/backlog-card';
import { PlanTimeline } from './plan-timeline';
import { WeeklyLoadChart } from '@/components/plan/weekly-load-chart';

export const metadata: Metadata = { title: 'Piano' };
export const dynamic = 'force-dynamic';

const HORIZON_DAYS = 28;

export default async function PlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const profile = await getProfile(user.id);
  if (!profile) redirect('/onboarding');

  const today = todayIso(profile.timezone);
  const end = addDaysIso(today, HORIZON_DAYS);

  const [tasks, overviews, availability, unavailable, backlog] = await Promise.all([
    getTasksBetween(user.id, today, end),
    getExamOverviews(user.id, { today }),
    getAvailability(user.id),
    getUnavailableDates(user.id, today),
    getBacklogTasks(user.id, today),
  ]);

  const capacity = buildCapacityCalendar(
    today,
    HORIZON_DAYS,
    availability,
    unavailable,
    Number(profile.weekly_buffer_ratio),
  );

  const examMap = Object.fromEntries(
    overviews.map((overview) => [
      overview.exam.id,
      { name: overview.exam.short_name ?? overview.exam.name, color: overview.exam.color },
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Piano di studio"
        description={`Prossimi ${HORIZON_DAYS} giorni. Il motore usa al massimo il ${Math.round((1 - Number(profile.weekly_buffer_ratio)) * 100)}% del tempo disponibile.`}
        actions={<GeneratePlanButton />}
      />

      {backlog.length > 0 ? <BacklogCard count={backlog.length} /> : null}

      <WeeklyLoadChart
        days={capacity.map((day) => ({
          date: day.date,
          plannable: day.plannableMinutes,
          raw: day.rawMinutes,
          planned: tasks
            .filter((task) => task.scheduled_date === day.date && task.status !== 'saltata')
            .reduce((sum, task) => sum + task.planned_minutes, 0),
        }))}
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Il piano è vuoto"
          description="Genera il piano automatico: verranno distribuite teoria, esercizi, ripassi e simulazioni sul tempo che hai davvero."
          action={<GeneratePlanButton label="Genera il piano" />}
        />
      ) : (
        <PlanTimeline
          today={today}
          exams={examMap}
          capacity={capacity.map((day) => ({
            date: day.date,
            plannable: day.plannableMinutes,
            isUnavailable: day.isUnavailable,
            reason: day.reason ?? null,
          }))}
          tasks={tasks.map((task) => ({
            id: task.id,
            date: task.scheduled_date,
            examId: task.exam_id,
            title: task.title,
            activityType: task.activity_type,
            plannedMinutes: task.planned_minutes,
            status: task.status,
            explanation: task.priority_explanation,
          }))}
        />
      )}
    </div>
  );
}
