import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/supabase/server';
import { getExamOverviews, getMockAttempts, getMockExams } from '@/server/data';
import { todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { MockWorkspace } from './mock-workspace';

export const metadata: Metadata = { title: 'Simulazioni' };
export const dynamic = 'force-dynamic';

export default async function MockExamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const today = todayIso();
  const [mocks, attempts, overviews] = await Promise.all([
    getMockExams(user.id),
    getMockAttempts(user.id),
    getExamOverviews(user.id, { today }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulazioni d’esame"
        description="Negli ultimi giorni prima dell’appello contano più le simulazioni e la correzione degli errori che i nuovi argomenti."
      />
      <MockWorkspace
        today={today}
        exams={overviews.map((overview) => ({
          id: overview.exam.id,
          name: overview.exam.short_name ?? overview.exam.name,
          kind: overview.exam.kind,
          examDate: overview.primarySession?.exam_date ?? null,
          daysRemaining: overview.feasibility.daysRemaining,
          topics: overview.topics.map((topic) => ({ id: topic.id, title: topic.title })),
        }))}
        mocks={mocks.map((mock) => ({
          id: mock.id,
          examId: mock.exam_id,
          title: mock.title,
          kind: mock.kind,
          durationMinutes: mock.duration_minutes,
          maxScore: Number(mock.max_score),
          passThreshold: Number(mock.pass_threshold),
          topicIds: mock.topic_ids,
        }))}
        attempts={attempts.map((attempt) => ({
          id: attempt.id,
          mockExamId: attempt.mock_exam_id,
          examId: attempt.exam_id,
          date: attempt.started_at.slice(0, 10),
          score: attempt.score === null ? null : Number(attempt.score),
          maxScore: Number(attempt.max_score),
          minutesUsed: attempt.minutes_used,
          passed: attempt.passed,
          selfEvaluation: attempt.self_evaluation,
          weakPoints: attempt.weak_points,
        }))}
      />
    </div>
  );
}
