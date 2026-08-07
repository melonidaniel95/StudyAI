import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import {
  getExamOverviews,
  getProfile,
  getTasksBetween,
  getUnavailableDates,
  getUpcomingReviews,
} from '@/server/data';
import { addDaysIso, todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { CalendarViews } from './calendar-views';

export const metadata: Metadata = { title: 'Calendario' };
export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const profile = await getProfile(user.id);
  if (!profile) redirect('/onboarding');

  const today = todayIso(profile.timezone);
  const from = addDaysIso(today, -14);
  const to = addDaysIso(today, 120);

  const [tasks, overviews, unavailable, reviews] = await Promise.all([
    getTasksBetween(user.id, from, to),
    getExamOverviews(user.id, { today }),
    getUnavailableDates(user.id, from),
    getUpcomingReviews(user.id, today, 90),
  ]);

  const examMap = Object.fromEntries(
    overviews.map((overview) => [
      overview.exam.id,
      {
        name: overview.exam.short_name ?? overview.exam.name,
        color: overview.exam.color,
        icon: overview.exam.icon ?? 'book-open',
      },
    ]),
  );

  const examDates = overviews.flatMap((overview) =>
    overview.sessions
      .filter((session) => session.exam_date >= from && session.exam_date <= to)
      .map((session) => ({
        date: session.exam_date,
        examId: overview.exam.id,
        label: overview.exam.short_name ?? overview.exam.name,
        role: session.role,
        isEstimated: session.is_estimated,
      })),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario"
        description="Appelli, attività, ripassi e giornate non disponibili, fino alla data obiettivo."
      />
      <CalendarViews
        today={today}
        targetDate={profile.target_date}
        exams={examMap}
        tasks={tasks.map((task) => ({
          id: task.id,
          date: task.scheduled_date,
          examId: task.exam_id,
          title: task.title,
          minutes: task.planned_minutes,
          activityType: task.activity_type,
          status: task.status,
        }))}
        examDates={examDates}
        reviews={reviews.map((review) => ({
          date: review.due_date,
          title: review.topic?.title ?? 'Ripasso',
          examId: review.exam_id,
        }))}
        unavailable={unavailable.map((item) => ({
          date: item.date,
          reason: item.reason ?? null,
        }))}
      />
    </div>
  );
}
