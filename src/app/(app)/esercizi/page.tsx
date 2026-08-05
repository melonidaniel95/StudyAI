import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getExams, getExerciseAttempts, getExercises, getTopics } from '@/server/data';
import { PageHeader } from '@/components/shared/page-header';
import { ExerciseWorkspace } from './exercise-workspace';

export const metadata: Metadata = { title: 'Esercizi' };
export const dynamic = 'force-dynamic';

export default async function ExercisesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const [exercises, attempts, exams, topics] = await Promise.all([
    getExercises(user.id),
    getExerciseAttempts(user.id),
    getExams(user.id),
    getTopics(user.id),
  ]);

  const attemptsByExercise = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const entry = attemptsByExercise.get(attempt.exercise_id) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (attempt.is_correct) entry.correct += 1;
    attemptsByExercise.set(attempt.exercise_id, entry);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Esercizi"
        description="Applicare è diverso da ricordare: un esercizio sbagliato finisce automaticamente nel quaderno degli errori."
      />
      <ExerciseWorkspace
        exams={exams.map((exam) => ({ id: exam.id, name: exam.short_name ?? exam.name }))}
        topics={topics.map((topic) => ({ id: topic.id, title: topic.title, examId: topic.exam_id }))}
        exercises={exercises.map((exercise) => ({
          id: exercise.id,
          examId: exercise.exam_id,
          topicId: exercise.topic_id,
          title: exercise.title,
          statement: exercise.statement,
          solution: exercise.solution,
          difficulty: exercise.difficulty,
          estimatedMinutes: exercise.estimated_minutes,
          needsVerification: exercise.needs_verification,
          stats: attemptsByExercise.get(exercise.id) ?? { total: 0, correct: 0 },
        }))}
      />
    </div>
  );
}
