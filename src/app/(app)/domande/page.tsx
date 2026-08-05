import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getExams, getFlashcards, getQuestions, getTopics } from '@/server/data';
import { todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { RecallWorkspace } from './recall-workspace';

export const metadata: Metadata = { title: 'Domande e flashcard' };
export const dynamic = 'force-dynamic';

export default async function QuestionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const [questions, flashcards, exams, topics] = await Promise.all([
    getQuestions(user.id),
    getFlashcards(user.id),
    getExams(user.id),
    getTopics(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domande e flashcard"
        description="Recupero attivo: rispondi prima di guardare. È così che si misura davvero la memoria."
      />
      <RecallWorkspace
        today={todayIso()}
        exams={exams.map((exam) => ({ id: exam.id, name: exam.short_name ?? exam.name }))}
        topics={topics.map((topic) => ({ id: topic.id, title: topic.title, examId: topic.exam_id }))}
        questions={questions.map((question) => ({
          id: question.id,
          examId: question.exam_id,
          topicId: question.topic_id,
          type: question.type,
          prompt: question.prompt,
          answer: question.answer,
          criteria: question.evaluation_criteria,
          difficulty: question.difficulty,
          timesAsked: question.times_asked,
          timesCorrect: question.times_correct,
          needsVerification: question.needs_verification,
        }))}
        flashcards={flashcards.map((card) => ({
          id: card.id,
          examId: card.exam_id,
          topicId: card.topic_id,
          front: card.front,
          back: card.back,
          hint: card.hint,
          dueDate: card.due_date,
          timesReviewed: card.times_reviewed,
          timesCorrect: card.times_correct,
          needsVerification: card.needs_verification,
        }))}
      />
    </div>
  );
}
