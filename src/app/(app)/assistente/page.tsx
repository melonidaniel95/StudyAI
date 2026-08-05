import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getErrors, getExams, getTopics } from '@/server/data';
import { getAiStatusAction } from '@/server/actions/ai';
import { PageHeader } from '@/components/shared/page-header';
import { AssistantWorkspace } from './assistant-workspace';

export const metadata: Metadata = { title: 'Assistente AI' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const [exams, topics, errors, status] = await Promise.all([
    getExams(user.id),
    getTopics(user.id),
    getErrors(user.id),
    getAiStatusAction(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assistente AI"
        description="Spiegazioni, domande, esercizi e interrogazioni. Tutto ciò che genera è marcato «Da verificare» e nulla viene salvato senza la tua conferma."
      />
      <AssistantWorkspace
        status={status}
        exams={exams.map((exam) => ({ id: exam.id, name: exam.short_name ?? exam.name }))}
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          examId: topic.exam_id,
          mastery: Number(topic.mastery),
          status: topic.status,
        }))}
        openErrors={errors
          .filter((error) => !error.resolved)
          .slice(0, 40)
          .map((error) => ({
            text: error.question_text,
            type: error.error_type,
            repetitions: error.repetitions,
          }))}
      />
    </div>
  );
}
