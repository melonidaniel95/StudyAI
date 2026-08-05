import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import { getExamDependencies, getExamOverviews } from '@/server/data';
import { todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { ExamsView } from './exams-view';
import { ExamFormDialog } from '@/components/exams/exam-form-dialog';

export const metadata: Metadata = { title: 'Esami' };
export const dynamic = 'force-dynamic';

export default async function ExamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const today = todayIso();
  const [overviews, dependencies] = await Promise.all([
    getExamOverviews(user.id, { today }),
    getExamDependencies(user.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Esami"
        description="Appelli, programmi, preparazione reale e rischio per ciascun esame."
        actions={<ExamFormDialog />}
      />

      {overviews.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nessun esame inserito"
          description="Aggiungi il primo esame: potrai poi inserire gli appelli, il programma e lasciare che StudyOS costruisca il piano."
          action={<ExamFormDialog />}
        />
      ) : (
        <ExamsView
          today={today}
          exams={overviews.map((overview) => ({
            id: overview.exam.id,
            name: overview.exam.name,
            shortName: overview.exam.short_name ?? overview.exam.name,
            color: overview.exam.color,
            status: overview.exam.status,
            kind: overview.exam.kind,
            difficulty: overview.exam.difficulty,
            priority: overview.exam.priority,
            cfu: overview.exam.cfu,
            syllabusIsDraft: overview.exam.syllabus_is_draft,
            topicCount: overview.topics.length,
            readiness: overview.readiness.overall,
            confidence: overview.readiness.confidence,
            readinessComponents: overview.readiness.components,
            coverage: overview.readiness.dimensions.coverage,
            risk: overview.feasibility.risk,
            riskLabel: overview.feasibility.label,
            riskMessage: overview.feasibility.message,
            daysRemaining: overview.feasibility.daysRemaining,
            studiedMinutes: overview.studiedMinutes,
            remainingMinutes: overview.remainingMinutes,
            primaryDate: overview.primarySession?.exam_date ?? null,
            backupDate: overview.backupSession?.exam_date ?? null,
            nextDate: overview.nextSession?.exam_date ?? null,
            sessionCount: overview.sessions.length,
            dueReviews: overview.dueReviews,
            openErrors: overview.openErrors,
            unlocksExams: overview.unlocksExams,
            prerequisites: overview.prerequisites,
          }))}
          dependencies={dependencies.map((dependency) => ({
            id: dependency.id,
            examId: dependency.exam_id,
            dependsOnExamId: dependency.depends_on_exam_id,
            strength: dependency.strength,
          }))}
        />
      )}
    </div>
  );
}
