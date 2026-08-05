import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getErrors, getExams, getTopics } from '@/server/data';
import { todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorNotebook } from './error-notebook';

export const metadata: Metadata = { title: 'Quaderno degli errori' };
export const dynamic = 'force-dynamic';

export default async function ErrorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const [errors, exams, topics] = await Promise.all([
    getErrors(user.id),
    getExams(user.id),
    getTopics(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quaderno degli errori"
        description="Ogni errore rifatto vale più di una rilettura. Gli errori ricorrenti alzano automaticamente la priorità dell’argomento."
      />
      <ErrorNotebook
        today={todayIso()}
        exams={exams.map((exam) => ({ id: exam.id, name: exam.short_name ?? exam.name }))}
        topics={topics.map((topic) => ({ id: topic.id, title: topic.title, examId: topic.exam_id }))}
        errors={errors.map((error) => ({
          id: error.id,
          examId: error.exam_id,
          topicId: error.topic_id,
          sourceType: error.source_type,
          questionText: error.question_text,
          givenAnswer: error.given_answer,
          correctAnswer: error.correct_answer,
          errorType: error.error_type,
          cause: error.cause,
          correction: error.correction,
          occurredOn: error.occurred_on,
          repetitions: error.repetitions,
          lastOutcome: error.last_outcome,
          nextAttemptDate: error.next_attempt_date,
          resolved: error.resolved,
        }))}
      />
    </div>
  );
}
