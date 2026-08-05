import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BookOpen, Clock, RefreshCw, TriangleAlert } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import { getExamDependencies, getExamOverviews } from '@/server/data';
import { formatMinutes, relativeDayLabel, todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { ReadinessBar } from '@/components/shared/readiness-bar';
import { RiskBadge } from '@/components/shared/risk-badge';
import { Stat } from '@/components/shared/stat';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExamFormDialog } from '@/components/exams/exam-form-dialog';
import { SessionManager } from '@/components/exams/session-manager';
import { SyllabusEditor } from '@/components/exams/syllabus-editor';
import { DependencyManager } from '@/components/exams/dependency-manager';
import { AttemptForm } from '@/components/exams/attempt-form';
import { percent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ examId: string }>;
}): Promise<Metadata> {
  const { examId } = await params;
  const user = await getCurrentUser();
  if (!user) return { title: 'Esame' };
  const overviews = await getExamOverviews(user.id);
  const overview = overviews.find((item) => item.exam.id === examId);
  return { title: overview?.exam.short_name ?? overview?.exam.name ?? 'Esame' };
}

export default async function ExamDetailPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const today = todayIso();
  const [overviews, dependencies] = await Promise.all([
    getExamOverviews(user.id, { today }),
    getExamDependencies(user.id),
  ]);

  const overview = overviews.find((item) => item.exam.id === examId);
  if (!overview) notFound();

  const { exam, readiness, feasibility } = overview;
  const examDependencies = dependencies.filter((d) => d.exam_id === examId);
  const dependents = dependencies.filter((d) => d.depends_on_exam_id === examId);
  const examNames = new Map(overviews.map((o) => [o.exam.id, o.exam.short_name ?? o.exam.name]));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/esami">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Tutti gli esami
        </Link>
      </Button>

      <PageHeader
        title={exam.name}
        description={
          overview.primarySession
            ? `Appello principale: ${overview.primarySession.exam_date} (${relativeDayLabel(today, overview.primarySession.exam_date)})`
            : overview.sessions.length === 0
              ? 'Nessun appello disponibile: le date non sono ancora state pubblicate.'
              : 'Nessun appello principale selezionato.'
        }
        actions={
          <ExamFormDialog
            exam={{
              id: exam.id,
              name: exam.name,
              shortName: exam.short_name ?? '',
              cfu: exam.cfu ? String(exam.cfu) : '',
              kind: exam.kind,
              hasExercises: exam.has_exercises,
              hasOral: exam.has_oral,
              difficulty: exam.difficulty,
              initialLevel: exam.initial_level,
              priority: exam.priority,
              estimatedHours: exam.estimated_hours ? String(exam.estimated_hours) : '',
              notes: exam.notes ?? '',
            }}
          />
        }
      />

      {exam.syllabus_is_draft && overview.topics.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p>
            Il programma è una <strong>struttura iniziale da verificare</strong> con il programma
            ufficiale. Puoi confermarlo dalla scheda Programma.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2">
              Preparazione reale
              <RiskBadge risk={feasibility.risk} label={feasibility.label} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReadinessBar
              value={readiness.overall}
              components={readiness.components}
              confidence={readiness.confidence}
            />
            <p className="text-sm text-muted-foreground">{readiness.summary}</p>

            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                { label: 'Programma coperto', value: readiness.dimensions.coverage },
                { label: 'Comprensione', value: readiness.dimensions.comprehension },
                { label: 'Memoria', value: readiness.dimensions.memory },
                { label: 'Applicazione', value: readiness.dimensions.application },
                { label: 'Simulazioni', value: readiness.dimensions.mock },
                { label: 'Affidabilità della stima', value: readiness.confidence },
              ].map((item) => (
                <div key={item.label} className="rounded-md border p-3">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{percent(item.value)}%</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
              <p className="font-medium">Come è calcolata</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {readiness.components
                  .filter((component) => component.applicable)
                  .map((component) => (
                    <li key={component.key}>
                      • <strong>{component.label}</strong> ({percent(component.weight)}%):{' '}
                      {component.explanation}
                    </li>
                  ))}
                {readiness.components
                  .filter((component) => !component.applicable)
                  .map((component) => (
                    <li key={component.key} className="italic">
                      • {component.label}: {component.explanation}
                    </li>
                  ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Stat
            label="Ore studiate"
            value={formatMinutes(overview.studiedMinutes)}
            icon={Clock}
            hint={`Stimate rimanenti: ${formatMinutes(overview.remainingMinutes)}`}
          />
          <Stat
            label="Ripassi"
            value={String(overview.reviewCount)}
            icon={RefreshCw}
            hint={`${overview.dueReviews} in scadenza`}
          />
          <Stat
            label="Argomenti"
            value={String(overview.topics.length)}
            icon={BookOpen}
            hint={`${overview.topics.filter((t) => t.status === 'consolidato').length} consolidati`}
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Valutazione di fattibilità</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{feasibility.message}</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {feasibility.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
              {feasibility.suggestBackup ? (
                <p className="rounded-md bg-accent/10 p-2 text-xs">
                  Potresti valutare l’appello di riserva. StudyOS non lo cambia da solo: decidi tu
                  dalla scheda Appelli.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {overview.weakTopics.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Punti deboli</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {overview.weakTopics.map((topic) => (
                  <p key={topic.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{topic.title}</span>
                    <Badge variant="muted">{percent(Number(topic.mastery))}%</Badge>
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="programma">
        <TabsList className="flex-wrap">
          <TabsTrigger value="programma">Programma</TabsTrigger>
          <TabsTrigger value="appelli">Appelli</TabsTrigger>
          <TabsTrigger value="prerequisiti">Prerequisiti</TabsTrigger>
          <TabsTrigger value="esiti">Esiti</TabsTrigger>
        </TabsList>

        <TabsContent value="programma">
          <SyllabusEditor
            examId={exam.id}
            syllabusIsDraft={exam.syllabus_is_draft}
            modules={overview.modules.map((module) => ({
              id: module.id,
              title: module.title,
              position: module.position,
              isDraft: module.is_draft,
              topics: overview.topics
                .filter((topic) => topic.module_id === module.id)
                .sort((a, b) => a.position - b.position)
                .map((topic) => ({
                  id: topic.id,
                  title: topic.title,
                  estimatedMinutes: topic.estimated_minutes,
                  difficulty: topic.difficulty,
                  status: topic.status,
                  mastery: Number(topic.mastery),
                  frequentlyAsked: topic.frequently_asked,
                  studiedMinutes: topic.total_study_minutes,
                  lastStudiedAt: topic.last_studied_at,
                  lastReviewedAt: topic.last_reviewed_at,
                })),
            }))}
          />
        </TabsContent>

        <TabsContent value="appelli">
          <SessionManager
            examId={exam.id}
            today={today}
            sessions={overview.sessions.map((session) => ({
              id: session.id,
              date: session.exam_date,
              role: session.role,
              status: session.status,
              isEstimated: session.is_estimated,
              location: session.location,
            }))}
          />
        </TabsContent>

        <TabsContent value="prerequisiti">
          <DependencyManager
            examId={exam.id}
            examNames={Object.fromEntries(examNames)}
            prerequisites={examDependencies.map((dependency) => ({
              id: dependency.id,
              examId: dependency.depends_on_exam_id,
              strength: dependency.strength,
            }))}
            dependents={dependents.map((dependency) => ({
              id: dependency.id,
              examId: dependency.exam_id,
              strength: dependency.strength,
            }))}
            availableExams={overviews
              .filter((item) => item.exam.id !== examId)
              .map((item) => ({ id: item.exam.id, name: item.exam.short_name ?? item.exam.name }))}
          />
        </TabsContent>

        <TabsContent value="esiti">
          <AttemptForm
            examId={exam.id}
            today={today}
            sessions={overview.sessions.map((session) => ({
              id: session.id,
              date: session.exam_date,
            }))}
            attempts={overview.attempts.map((attempt) => ({
              id: attempt.id,
              date: attempt.attempt_date,
              outcome: attempt.outcome,
              grade: attempt.grade,
              cumLaude: attempt.cum_laude,
              notes: attempt.notes,
            }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
