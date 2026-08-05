/**
 * Tipi delle righe del database.
 *
 * Sono scritti a mano e allineati alle migrazioni in `supabase/migrations`.
 * Se generi i tipi con `supabase gen types typescript` puoi sostituire questo
 * file, mantenendo i nomi esportati.
 */
import type {
  ActivityType,
  ExamKind,
  ExamStatus,
  IsoDate,
  RiskLevel,
  SessionRole,
  TaskStatus,
  TopicStatus,
} from '@/lib/domain/types';

export type SessionStatus =
  | 'stimato'
  | 'confermato'
  | 'sostenuto'
  | 'superato'
  | 'non_superato'
  | 'annullato';

export type ResourceType =
  | 'pdf'
  | 'libro'
  | 'video'
  | 'link'
  | 'appunti'
  | 'formulario'
  | 'prova_precedente';

export type QuestionType = 'aperta' | 'flashcard' | 'scelta_multipla' | 'esercizio';

export type ErrorTypeValue =
  | 'concettuale'
  | 'calcolo'
  | 'distrazione'
  | 'formula_dimenticata'
  | 'interpretazione'
  | 'procedimento_incompleto'
  | 'gestione_tempo'
  | 'esposizione_orale';

export type MockExamKind = 'scritto' | 'orale' | 'quiz' | 'misto';
export type AttemptOutcome = 'superato' | 'non_superato' | 'ritirato' | 'assente';
export type ReviewStatusValue = 'pianificato' | 'completato' | 'saltato';
export type ContentSource = 'manuale' | 'ai' | 'importato';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  target_date: IsoDate;
  timezone: string;
  locale: string;
  max_session_minutes: number;
  min_session_minutes: number;
  weekly_buffer_ratio: number;
  max_parallel_exams: number;
  study_preference: 'teoria' | 'esercizi' | 'misto';
  readiness_weights: {
    coverage: number;
    activeRecall: number;
    exercises: number;
    mock: number;
    reviewRegularity: number;
  };
  notifications_enabled: boolean;
  ai_enabled: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Exam {
  id: string;
  user_id: string;
  name: string;
  short_name: string | null;
  code: string | null;
  cfu: number | null;
  kind: ExamKind;
  has_exercises: boolean;
  has_oral: boolean;
  difficulty: number;
  initial_level: number;
  status: ExamStatus;
  priority: number;
  color: string;
  estimated_hours: number | null;
  target_date: IsoDate | null;
  notes: string | null;
  syllabus_is_draft: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExamDependency {
  id: string;
  user_id: string;
  exam_id: string;
  depends_on_exam_id: string;
  strength: 'forte' | 'consigliata';
  note: string | null;
  created_at: string;
}

export interface ExamSession {
  id: string;
  user_id: string;
  exam_id: string;
  exam_date: IsoDate;
  exam_time: string | null;
  status: SessionStatus;
  role: SessionRole;
  is_estimated: boolean;
  location: string | null;
  registration_deadline: IsoDate | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExamAttempt {
  id: string;
  user_id: string;
  exam_id: string;
  exam_session_id: string | null;
  attempt_date: IsoDate;
  outcome: AttemptOutcome;
  grade: number | null;
  cum_laude: boolean;
  notes: string | null;
  created_at: string;
}

export interface SyllabusModule {
  id: string;
  user_id: string;
  exam_id: string;
  title: string;
  description: string | null;
  position: number;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyllabusTopic {
  id: string;
  user_id: string;
  module_id: string;
  exam_id: string;
  title: string;
  description: string | null;
  position: number;
  estimated_minutes: number;
  difficulty: number;
  status: TopicStatus;
  mastery: number;
  comprehension: number;
  frequently_asked: boolean;
  is_draft: boolean;
  total_study_minutes: number;
  first_studied_at: string | null;
  last_studied_at: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyResource {
  id: string;
  user_id: string;
  exam_id: string | null;
  title: string;
  type: ResourceType;
  url: string | null;
  storage_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  author: string | null;
  tags: string[];
  notes: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResourceTopicLink {
  id: string;
  user_id: string;
  resource_id: string;
  topic_id: string;
  created_at: string;
}

export interface WeeklyAvailability {
  id: string;
  user_id: string;
  weekday: number;
  available_minutes: number;
  preferred_start: string | null;
  preferred_end: string | null;
  is_rest_day: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnavailableDateRow {
  id: string;
  user_id: string;
  date: IsoDate;
  reason: string | null;
  available_minutes: number | null;
  created_at: string;
}

export interface StudyPlan {
  id: string;
  user_id: string;
  name: string;
  start_date: IsoDate;
  end_date: IsoDate | null;
  is_active: boolean;
  strategy: Record<string, unknown>;
  generated_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyTask {
  id: string;
  user_id: string;
  plan_id: string | null;
  exam_id: string;
  topic_id: string | null;
  review_schedule_id: string | null;
  scheduled_date: IsoDate;
  position: number;
  planned_minutes: number;
  actual_minutes: number | null;
  activity_type: ActivityType;
  title: string;
  objective: string | null;
  status: TaskStatus;
  priority_score: number;
  priority_explanation: string[];
  is_locked: boolean;
  rescheduled_from: IsoDate | null;
  reschedule_count: number;
  created_at: string;
  updated_at: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  task_id: string | null;
  exam_id: string;
  topic_id: string | null;
  activity_type: ActivityType;
  started_at: string;
  ended_at: string | null;
  planned_minutes: number;
  effective_minutes: number;
  pause_minutes: number;
  interruptions: number;
  comprehension: number | null;
  recall: number | null;
  objective_completed: boolean | null;
  difficulties: string | null;
  notes: string | null;
  doubts: string | null;
  next_review_days: number | null;
  client_uuid: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewSchedule {
  id: string;
  user_id: string;
  topic_id: string;
  exam_id: string;
  due_date: IsoDate;
  interval_days: number;
  repetition: number;
  ease: number;
  last_grade: number | null;
  last_reviewed_at: string | null;
  status: ReviewStatusValue;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewLog {
  id: string;
  user_id: string;
  review_schedule_id: string | null;
  topic_id: string;
  grade: number;
  previous_interval: number;
  new_interval: number;
  previous_ease: number | null;
  new_ease: number | null;
  explanation: string | null;
  reviewed_at: string;
}

export interface Question {
  id: string;
  user_id: string;
  exam_id: string;
  topic_id: string | null;
  type: QuestionType;
  prompt: string;
  answer: string | null;
  evaluation_criteria: string | null;
  options: string[];
  correct_option: number | null;
  difficulty: number;
  source: ContentSource;
  needs_verification: boolean;
  times_asked: number;
  times_correct: number;
  last_asked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionAttempt {
  id: string;
  user_id: string;
  question_id: string;
  topic_id: string | null;
  given_answer: string | null;
  self_score: number | null;
  is_correct: boolean | null;
  seconds_used: number | null;
  attempted_at: string;
}

export interface Flashcard {
  id: string;
  user_id: string;
  exam_id: string;
  topic_id: string | null;
  front: string;
  back: string;
  hint: string | null;
  difficulty: number;
  interval_days: number;
  ease: number;
  repetition: number;
  due_date: IsoDate;
  times_reviewed: number;
  times_correct: number;
  source: ContentSource;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}

export interface Exercise {
  id: string;
  user_id: string;
  exam_id: string;
  topic_id: string | null;
  title: string;
  statement: string;
  solution: string | null;
  difficulty: number;
  estimated_minutes: number;
  tags: string[];
  source: ContentSource;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExerciseAttempt {
  id: string;
  user_id: string;
  exercise_id: string;
  topic_id: string | null;
  attempted_at: string;
  minutes_used: number | null;
  is_correct: boolean;
  self_score: number | null;
  answer: string | null;
  error_type: ErrorTypeValue | null;
  notes: string | null;
}

export interface MockExam {
  id: string;
  user_id: string;
  exam_id: string;
  title: string;
  kind: MockExamKind;
  duration_minutes: number;
  max_score: number;
  pass_threshold: number;
  topic_ids: string[];
  config: Record<string, unknown>;
  source: ContentSource;
  needs_verification: boolean;
  created_at: string;
  updated_at: string;
}

export interface MockExamAttempt {
  id: string;
  user_id: string;
  mock_exam_id: string;
  exam_id: string;
  started_at: string;
  completed_at: string | null;
  minutes_used: number | null;
  score: number | null;
  max_score: number;
  passed: boolean | null;
  self_evaluation: number | null;
  topics_covered: string[];
  weak_points: string | null;
  notes: string | null;
  created_at: string;
}

export interface ErrorLogRow {
  id: string;
  user_id: string;
  exam_id: string;
  topic_id: string | null;
  source_type: 'manuale' | 'domanda' | 'esercizio' | 'simulazione' | 'sessione';
  source_id: string | null;
  question_text: string;
  given_answer: string | null;
  correct_answer: string | null;
  error_type: ErrorTypeValue;
  cause: string | null;
  correction: string | null;
  attachment_path: string | null;
  occurred_on: IsoDate;
  repetitions: number;
  last_outcome: 'non_risolto' | 'parziale' | 'risolto';
  next_attempt_date: IsoDate | null;
  resolved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReadinessSnapshot {
  id: string;
  user_id: string;
  exam_id: string;
  snapshot_date: IsoDate;
  overall: number;
  coverage: number;
  active_recall: number;
  exercises: number;
  mock: number;
  review_regularity: number;
  confidence: number;
  risk: RiskLevel;
  breakdown: Record<string, unknown>;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  scheduled_for: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AiConversation {
  id: string;
  user_id: string;
  exam_id: string | null;
  topic_id: string | null;
  mode: 'chat' | 'interrogami' | 'genera' | 'analisi';
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
