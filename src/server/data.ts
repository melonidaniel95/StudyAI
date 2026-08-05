/**
 * Livello di accesso ai dati.
 *
 * Tutte le query passano da qui: le pagine non parlano mai direttamente con
 * Supabase. Le letture sono raggruppate per evitare query duplicate (nessun
 * N+1) e i calcoli di dominio sono delegati a `lib/domain`.
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { addDaysIso, isoWeekday, todayIso } from '@/lib/domain/dates';
import { computeReadiness, estimateRemainingMinutes } from '@/lib/domain/readiness';
import { evaluateFeasibility } from '@/lib/domain/feasibility';
import { plannableMinutesBetween } from '@/lib/domain/availability';
import { DEFAULT_READINESS_WEIGHTS } from '@/lib/domain/types';
import type {
  AvailabilityDay,
  FeasibilityResult,
  IsoDate,
  ReadinessResult,
  UnavailableDate,
} from '@/lib/domain/types';
import type {
  ErrorLogRow,
  Exam,
  ExamAttempt,
  ExamDependency,
  ExamSession,
  Exercise,
  ExerciseAttempt,
  Flashcard,
  MockExam,
  MockExamAttempt,
  Profile,
  Question,
  QuestionAttempt,
  ReviewSchedule,
  StudyResource,
  StudySession,
  StudyTask,
  SyllabusModule,
  SyllabusTopic,
  UnavailableDateRow,
  WeeklyAvailability,
} from '@/types/db';

export interface ExamOverview {
  exam: Exam;
  sessions: ExamSession[];
  primarySession: ExamSession | null;
  backupSession: ExamSession | null;
  nextSession: ExamSession | null;
  topics: SyllabusTopic[];
  modules: SyllabusModule[];
  readiness: ReadinessResult;
  feasibility: FeasibilityResult;
  studiedMinutes: number;
  remainingMinutes: number;
  reviewCount: number;
  dueReviews: number;
  openErrors: number;
  attempts: ExamAttempt[];
  /** Numero di esami che hanno questo esame come prerequisito. */
  unlocksExams: number;
  /** Esami che devono essere superati prima di questo. */
  prerequisites: string[];
  weakTopics: SyllabusTopic[];
}

export interface DashboardData {
  profile: Profile;
  today: IsoDate;
  overviews: ExamOverview[];
  todayTasks: StudyTask[];
  backlogTasks: StudyTask[];
  dueReviews: Array<ReviewSchedule & { topic: SyllabusTopic | null; exam: Exam | null }>;
  availability: AvailabilityDay[];
  unavailable: UnavailableDate[];
  todayCapacityMinutes: number;
  weekMinutes: { planned: number; available: number };
  recentSessions: StudySession[];
}

async function db() {
  return createClient();
}

function toAvailability(rows: WeeklyAvailability[]): AvailabilityDay[] {
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));
  return Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const row = byWeekday.get(weekday);
    return {
      weekday,
      availableMinutes: row?.available_minutes ?? 0,
      isRestDay: row?.is_rest_day ?? false,
    };
  });
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await db();
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function getAvailability(userId: string): Promise<AvailabilityDay[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('weekly_availability')
    .select('*')
    .eq('user_id', userId)
    .order('weekday');
  return toAvailability((data ?? []) as WeeklyAvailability[]);
}

export async function getUnavailableDates(userId: string, from: IsoDate): Promise<UnavailableDate[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('unavailable_dates')
    .select('*')
    .eq('user_id', userId)
    .gte('date', from)
    .order('date');
  return ((data ?? []) as UnavailableDateRow[]).map((row) => ({
    date: row.date,
    availableMinutes: row.available_minutes,
    reason: row.reason,
  }));
}

export async function getExams(userId: string): Promise<Exam[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('exams')
    .select('*')
    .eq('user_id', userId)
    .eq('archived', false)
    .order('name');
  return (data ?? []) as Exam[];
}

export async function getExamDependencies(userId: string): Promise<ExamDependency[]> {
  const supabase = await db();
  const { data } = await supabase.from('exam_dependencies').select('*').eq('user_id', userId);
  return (data ?? []) as ExamDependency[];
}

export async function getExamSessions(userId: string): Promise<ExamSession[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('exam_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('exam_date');
  return (data ?? []) as ExamSession[];
}

/**
 * Costruisce la panoramica completa di tutti gli esami con una manciata di
 * query bulk, calcolando preparazione e fattibilità in memoria.
 */
export async function getExamOverviews(
  userId: string,
  options?: { today?: IsoDate },
): Promise<ExamOverview[]> {
  const supabase = await db();
  const today = options?.today ?? todayIso();

  const [
    examsRes,
    sessionsRes,
    modulesRes,
    topicsRes,
    reviewsRes,
    questionAttemptsRes,
    exerciseAttemptsRes,
    mockAttemptsRes,
    errorsRes,
    attemptsRes,
    depsRes,
    studySessionsRes,
    availabilityRows,
    unavailable,
    profile,
  ] = await Promise.all([
    supabase.from('exams').select('*').eq('user_id', userId).eq('archived', false).order('name'),
    supabase.from('exam_sessions').select('*').eq('user_id', userId).order('exam_date'),
    supabase.from('syllabus_modules').select('*').eq('user_id', userId).order('position'),
    supabase.from('syllabus_topics').select('*').eq('user_id', userId).order('position'),
    supabase.from('review_schedules').select('*').eq('user_id', userId),
    supabase.from('question_attempts').select('*').eq('user_id', userId),
    supabase.from('exercise_attempts').select('*').eq('user_id', userId),
    supabase.from('mock_exam_attempts').select('*').eq('user_id', userId),
    supabase.from('error_log').select('*').eq('user_id', userId).eq('resolved', false),
    supabase.from('exam_attempts').select('*').eq('user_id', userId),
    supabase.from('exam_dependencies').select('*').eq('user_id', userId),
    supabase.from('study_sessions').select('*').eq('user_id', userId),
    getAvailability(userId),
    getUnavailableDates(userId, today),
    getProfile(userId),
  ]);

  const exams = (examsRes.data ?? []) as Exam[];
  const sessions = (sessionsRes.data ?? []) as ExamSession[];
  const modules = (modulesRes.data ?? []) as SyllabusModule[];
  const topics = (topicsRes.data ?? []) as SyllabusTopic[];
  const reviews = (reviewsRes.data ?? []) as ReviewSchedule[];
  const questionAttempts = (questionAttemptsRes.data ?? []) as QuestionAttempt[];
  const exerciseAttempts = (exerciseAttemptsRes.data ?? []) as ExerciseAttempt[];
  const mockAttempts = (mockAttemptsRes.data ?? []) as MockExamAttempt[];
  const errors = (errorsRes.data ?? []) as ErrorLogRow[];
  const examAttempts = (attemptsRes.data ?? []) as ExamAttempt[];
  const dependencies = (depsRes.data ?? []) as ExamDependency[];
  const studySessions = (studySessionsRes.data ?? []) as StudySession[];

  const topicToExam = new Map(topics.map((t) => [t.id, t.exam_id]));
  const weights = profile?.readiness_weights ?? DEFAULT_READINESS_WEIGHTS;
  const bufferRatio = profile?.weekly_buffer_ratio ?? 0.15;

  return exams.map((exam) => {
    const examSessions = sessions.filter((s) => s.exam_id === exam.id);
    const primarySession = examSessions.find((s) => s.role === 'principale') ?? null;
    const backupSession = examSessions.find((s) => s.role === 'riserva') ?? null;
    const nextSession =
      examSessions.find((s) => s.exam_date >= today && s.status !== 'annullato') ?? null;
    const examTopics = topics.filter((t) => t.exam_id === exam.id);
    const examModules = modules.filter((m) => m.exam_id === exam.id);
    const examReviews = reviews.filter((r) => r.exam_id === exam.id);
    const examErrors = errors.filter((e) => e.exam_id === exam.id);

    const examQuestionAttempts = questionAttempts.filter(
      (a) => a.topic_id && topicToExam.get(a.topic_id) === exam.id,
    );
    const examExerciseAttempts = exerciseAttempts.filter(
      (a) => a.topic_id && topicToExam.get(a.topic_id) === exam.id,
    );
    const examMockAttempts = mockAttempts.filter((a) => a.exam_id === exam.id);
    const examStudySessions = studySessions.filter((s) => s.exam_id === exam.id);

    const studiedMinutes = examStudySessions.reduce((sum, s) => sum + s.effective_minutes, 0);

    const readiness = computeReadiness({
      examKind: exam.kind,
      hasExercises: exam.has_exercises,
      topics: examTopics.map((t) => ({
        id: t.id,
        status: t.status,
        mastery: Number(t.mastery),
        estimatedMinutes: t.estimated_minutes,
        studiedMinutes: t.total_study_minutes,
      })),
      recall: {
        attempts: examQuestionAttempts.length,
        correct: examQuestionAttempts.filter((a) => a.is_correct).length,
      },
      exercises: {
        attempts: examExerciseAttempts.length,
        correct: examExerciseAttempts.filter((a) => a.is_correct).length,
      },
      mockAttempts: examMockAttempts
        .filter((a) => a.score !== null)
        .map((a) => ({
          scoreRatio: Number(a.score) / Math.max(1, Number(a.max_score)),
          date: a.started_at.slice(0, 10),
        })),
      reviews: {
        due: examReviews.length,
        doneOnTime: examReviews.filter((r) => r.status === 'completato' || r.repetition > 0).length,
      },
      weights,
    });

    const remainingMinutes = estimateRemainingMinutes(
      examTopics.map((t) => ({
        id: t.id,
        status: t.status,
        mastery: Number(t.mastery),
        estimatedMinutes: t.estimated_minutes,
        studiedMinutes: t.total_study_minutes,
      })),
      readiness.overall,
    );

    const targetDate = primarySession?.exam_date ?? nextSession?.exam_date ?? null;
    const availableBefore = targetDate
      ? plannableMinutesBetween(today, targetDate, availabilityRows, unavailable, bufferRatio)
      : 0;

    const fourteenDaysAgo = addDaysIso(today, -14);
    const recentMinutes = examStudySessions
      .filter((s) => s.started_at.slice(0, 10) >= fourteenDaysAgo)
      .reduce((sum, s) => sum + s.effective_minutes, 0);

    const feasibility = evaluateFeasibility({
      today,
      examDate: targetDate,
      backupExamDate: backupSession?.exam_date ?? null,
      requiredMinutes: remainingMinutes,
      availableMinutesBeforeExam: availableBefore,
      readiness: readiness.overall,
      coverage: readiness.dimensions.coverage,
      recentPaceMinutesPerDay: recentMinutes / 14,
      missingReviews: examReviews.filter((r) => r.due_date < today && r.status === 'pianificato')
        .length,
      plannedMocks: examMockAttempts.length,
      doneMocks: examMockAttempts.filter((a) => a.completed_at).length,
      dataPoints:
        examStudySessions.length +
        examQuestionAttempts.length +
        examExerciseAttempts.length +
        examMockAttempts.length * 3,
    });

    return {
      exam,
      sessions: examSessions,
      primarySession,
      backupSession,
      nextSession,
      topics: examTopics,
      modules: examModules,
      readiness,
      feasibility,
      studiedMinutes,
      remainingMinutes,
      reviewCount: examReviews.length,
      dueReviews: examReviews.filter((r) => r.due_date <= today && r.status === 'pianificato').length,
      openErrors: examErrors.length,
      attempts: examAttempts.filter((a) => a.exam_id === exam.id),
      unlocksExams: dependencies.filter((d) => d.depends_on_exam_id === exam.id).length,
      prerequisites: dependencies.filter((d) => d.exam_id === exam.id).map((d) => d.depends_on_exam_id),
      weakTopics: examTopics
        .filter((t) => t.status !== 'non_iniziato' && Number(t.mastery) < 0.5)
        .slice(0, 5),
    };
  });
}

export async function getTasksBetween(
  userId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<StudyTask[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('study_tasks')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date')
    .order('position');
  return (data ?? []) as StudyTask[];
}

export async function getBacklogTasks(userId: string, today: IsoDate): Promise<StudyTask[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('study_tasks')
    .select('*')
    .eq('user_id', userId)
    .lt('scheduled_date', today)
    .in('status', ['pianificata', 'in_corso'])
    .order('scheduled_date');
  return (data ?? []) as StudyTask[];
}

export async function getDueReviews(userId: string, today: IsoDate, horizonDays = 0) {
  const supabase = await db();
  const limitDate = addDaysIso(today, horizonDays);
  const { data } = await supabase
    .from('review_schedules')
    .select('*, topic:syllabus_topics(*), exam:exams(*)')
    .eq('user_id', userId)
    .eq('status', 'pianificato')
    .lte('due_date', limitDate)
    .order('due_date');
  return (data ?? []) as Array<ReviewSchedule & { topic: SyllabusTopic | null; exam: Exam | null }>;
}

export async function getUpcomingReviews(userId: string, today: IsoDate, days = 14) {
  const supabase = await db();
  const { data } = await supabase
    .from('review_schedules')
    .select('*, topic:syllabus_topics(*), exam:exams(*)')
    .eq('user_id', userId)
    .eq('status', 'pianificato')
    .gt('due_date', today)
    .lte('due_date', addDaysIso(today, days))
    .order('due_date');
  return (data ?? []) as Array<ReviewSchedule & { topic: SyllabusTopic | null; exam: Exam | null }>;
}

export async function getRecentSessions(userId: string, limit = 20): Promise<StudySession[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as StudySession[];
}

export async function getResources(userId: string): Promise<StudyResource[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('study_resources')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as StudyResource[];
}

export async function getResourceLinks(userId: string) {
  const supabase = await db();
  const { data } = await supabase
    .from('resource_topic_links')
    .select('resource_id, topic_id')
    .eq('user_id', userId);
  return (data ?? []) as Array<{ resource_id: string; topic_id: string }>;
}

export async function getTopics(userId: string): Promise<SyllabusTopic[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('syllabus_topics')
    .select('*')
    .eq('user_id', userId)
    .order('position');
  return (data ?? []) as SyllabusTopic[];
}

export async function getQuestions(userId: string): Promise<Question[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('questions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as Question[];
}

export async function getFlashcards(userId: string): Promise<Flashcard[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('flashcards')
    .select('*')
    .eq('user_id', userId)
    .order('due_date');
  return (data ?? []) as Flashcard[];
}

export async function getExercises(userId: string): Promise<Exercise[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('exercises')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as Exercise[];
}

export async function getExerciseAttempts(userId: string): Promise<ExerciseAttempt[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('exercise_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('attempted_at', { ascending: false });
  return (data ?? []) as ExerciseAttempt[];
}

export async function getMockExams(userId: string): Promise<MockExam[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('mock_exams')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as MockExam[];
}

export async function getMockAttempts(userId: string): Promise<MockExamAttempt[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('mock_exam_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  return (data ?? []) as MockExamAttempt[];
}

export async function getErrors(userId: string): Promise<ErrorLogRow[]> {
  const supabase = await db();
  const { data } = await supabase
    .from('error_log')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_on', { ascending: false });
  return (data ?? []) as ErrorLogRow[];
}

/** Dati necessari alla dashboard e alla pagina "Oggi", in un'unica passata. */
export async function getDashboardData(userId: string): Promise<DashboardData | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;

  const today = todayIso(profile.timezone);
  const weekEnd = addDaysIso(today, 7);

  const [overviews, todayTasks, backlogTasks, dueReviews, availability, unavailable, recentSessions, weekTasks] =
    await Promise.all([
      getExamOverviews(userId, { today }),
      getTasksBetween(userId, today, today),
      getBacklogTasks(userId, today),
      getDueReviews(userId, today),
      getAvailability(userId),
      getUnavailableDates(userId, today),
      getRecentSessions(userId, 10),
      getTasksBetween(userId, today, weekEnd),
    ]);

  const todayOverride = unavailable.find((u) => u.date === today);
  const todayAvailability = availability[isoWeekday(today) - 1];
  const todayCapacityMinutes =
    todayOverride && (todayOverride.availableMinutes ?? 0) >= 0
      ? (todayOverride.availableMinutes ?? 0)
      : (todayAvailability?.isRestDay ? 0 : todayAvailability?.availableMinutes) ?? 0;

  const availableWeek = availability.reduce(
    (sum, day) => sum + (day.isRestDay ? 0 : day.availableMinutes),
    0,
  );

  return {
    profile,
    today,
    overviews,
    todayTasks,
    backlogTasks,
    dueReviews,
    availability,
    unavailable,
    todayCapacityMinutes,
    weekMinutes: {
      planned: weekTasks.reduce((sum, task) => sum + task.planned_minutes, 0),
      available: availableWeek,
    },
    recentSessions,
  };
}
