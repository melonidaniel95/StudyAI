import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import { getDueReviews, getExams, getUpcomingReviews } from '@/server/data';
import { todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ReviewSession } from './review-session';
import { UpcomingReviews } from './upcoming-reviews';

export const metadata: Metadata = { title: 'Ripassi' };
export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const today = todayIso();
  const [due, upcoming, exams] = await Promise.all([
    getDueReviews(user.id, today),
    getUpcomingReviews(user.id, today, 21),
    getExams(user.id),
  ]);

  const examNames = new Map(exams.map((exam) => [exam.id, exam.short_name ?? exam.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ripassi"
        description="Ripetizione dilazionata: intervalli 1, 3, 7, 14, 30 giorni, adattati a come è andato il richiamo."
      />

      {due.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="Nessun ripasso in scadenza oggi"
          description="I ripassi vengono creati automaticamente al termine di ogni sessione di studio. Puoi anche crearne uno dal programma di un esame."
        />
      ) : (
        <ReviewSession
          items={due.map((review) => ({
            id: review.id,
            topicId: review.topic_id,
            topicTitle: review.topic?.title ?? 'Argomento',
            examName: examNames.get(review.exam_id) ?? 'Esame',
            dueDate: review.due_date,
            intervalDays: review.interval_days,
            repetition: review.repetition,
            reason: review.reason,
          }))}
        />
      )}

      <UpcomingReviews
        today={today}
        items={upcoming.map((review) => ({
          id: review.id,
          topicTitle: review.topic?.title ?? 'Argomento',
          examName: examNames.get(review.exam_id) ?? 'Esame',
          dueDate: review.due_date,
          reason: review.reason,
        }))}
      />
    </div>
  );
}
