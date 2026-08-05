-- ============================================================================
-- StudyOS — 0001_schema.sql
-- Schema principale: estensioni, enum, tabelle, vincoli, indici, trigger.
-- Convenzioni:
--   * chiavi primarie UUID (gen_random_uuid)
--   * ogni tabella di dominio ha user_id -> auth.users(id) per la RLS
--   * created_at / updated_at con trigger automatico
--   * giorni della settimana in formato ISO: 1 = lunedì ... 7 = domenica
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUM
-- ----------------------------------------------------------------------------
do $$ begin
  create type exam_status as enum (
    'non_iniziato', 'pianificato', 'in_studio', 'pronto', 'tentato', 'superato'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type exam_kind as enum ('scritto', 'orale', 'misto', 'idoneita', 'progetto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type topic_status as enum (
    'non_iniziato', 'in_corso', 'studiato', 'da_ripassare', 'consolidato'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum (
    'pianificata', 'in_corso', 'completata', 'saltata', 'riprogrammata'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type resource_type as enum (
    'pdf', 'libro', 'video', 'link', 'appunti', 'formulario', 'prova_precedente'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_type as enum ('aperta', 'flashcard', 'scelta_multipla', 'esercizio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum (
    'stimato', 'confermato', 'sostenuto', 'superato', 'non_superato', 'annullato'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_role as enum ('nessuno', 'principale', 'riserva');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_type as enum (
    'teoria', 'esercizi', 'ripasso', 'simulazione', 'recupero_attivo', 'lettura', 'correzione_errori', 'altro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type error_type as enum (
    'concettuale', 'calcolo', 'distrazione', 'formula_dimenticata',
    'interpretazione', 'procedimento_incompleto', 'gestione_tempo', 'esposizione_orale'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type mock_exam_kind as enum ('scritto', 'orale', 'quiz', 'misto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_level as enum ('verde', 'giallo', 'arancione', 'rosso', 'grigio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attempt_outcome as enum ('superato', 'non_superato', 'ritirato', 'assente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type review_status as enum ('pianificato', 'completato', 'saltato');
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_source as enum ('manuale', 'ai', 'importato');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Funzione trigger updated_at
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  target_date date not null default date '2027-09-30',
  timezone text not null default 'Europe/Rome',
  locale text not null default 'it-IT',
  max_session_minutes int not null default 120 check (max_session_minutes between 15 and 480),
  min_session_minutes int not null default 25 check (min_session_minutes between 5 and 120),
  -- quota di tempo settimanale che il motore NON deve pianificare (margine imprevisti)
  weekly_buffer_ratio numeric(3,2) not null default 0.15 check (weekly_buffer_ratio between 0 and 0.5),
  max_parallel_exams int not null default 2 check (max_parallel_exams between 1 and 5),
  study_preference text not null default 'misto'
    check (study_preference in ('teoria', 'esercizi', 'misto')),
  -- pesi configurabili del calcolo di preparazione (somma attesa = 1)
  readiness_weights jsonb not null default
    '{"coverage":0.20,"activeRecall":0.25,"exercises":0.25,"mock":0.20,"reviewRegularity":0.10}'::jsonb,
  notifications_enabled boolean not null default false,
  ai_enabled boolean not null default false,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea automaticamente il profilo alla registrazione
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- exams
-- ----------------------------------------------------------------------------
create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  short_name text,
  code text,
  cfu int check (cfu between 0 and 30),
  kind exam_kind not null default 'scritto',
  has_exercises boolean not null default true,
  has_oral boolean not null default false,
  difficulty int not null default 3 check (difficulty between 1 and 5),
  initial_level int not null default 1 check (initial_level between 1 and 5),
  status exam_status not null default 'non_iniziato',
  priority int not null default 3 check (priority between 1 and 5),
  color text not null default '#4C6382',
  estimated_hours numeric(6,1) check (estimated_hours >= 0),
  target_date date,
  notes text,
  syllabus_is_draft boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

drop trigger if exists trg_exams_updated on public.exams;
create trigger trg_exams_updated before update on public.exams
  for each row execute function public.set_updated_at();

create index if not exists idx_exams_user on public.exams(user_id);
create index if not exists idx_exams_user_status on public.exams(user_id, status);

-- ----------------------------------------------------------------------------
-- exam_dependencies (prerequisiti tra esami)
-- ----------------------------------------------------------------------------
create table if not exists public.exam_dependencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  depends_on_exam_id uuid not null references public.exams(id) on delete cascade,
  strength text not null default 'consigliata' check (strength in ('forte', 'consigliata')),
  note text,
  created_at timestamptz not null default now(),
  constraint exam_dependency_not_self check (exam_id <> depends_on_exam_id),
  unique (exam_id, depends_on_exam_id)
);

create index if not exists idx_exam_deps_user on public.exam_dependencies(user_id);
create index if not exists idx_exam_deps_exam on public.exam_dependencies(exam_id);

-- ----------------------------------------------------------------------------
-- exam_sessions (appelli)
-- ----------------------------------------------------------------------------
create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_date date not null,
  exam_time time,
  status session_status not null default 'confermato',
  role session_role not null default 'nessuno',
  is_estimated boolean not null default false,
  location text,
  registration_deadline date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, exam_date)
);

drop trigger if exists trg_exam_sessions_updated on public.exam_sessions;
create trigger trg_exam_sessions_updated before update on public.exam_sessions
  for each row execute function public.set_updated_at();

-- un solo appello principale e un solo appello di riserva per esame
create unique index if not exists uq_exam_primary_session
  on public.exam_sessions(exam_id) where role = 'principale';
create unique index if not exists uq_exam_backup_session
  on public.exam_sessions(exam_id) where role = 'riserva';
create index if not exists idx_exam_sessions_user_date on public.exam_sessions(user_id, exam_date);

-- ----------------------------------------------------------------------------
-- exam_attempts (esiti reali)
-- ----------------------------------------------------------------------------
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_session_id uuid references public.exam_sessions(id) on delete set null,
  attempt_date date not null default current_date,
  outcome attempt_outcome not null,
  grade int check (grade between 18 and 31),
  cum_laude boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_exam_attempts_user on public.exam_attempts(user_id, exam_id);

-- ----------------------------------------------------------------------------
-- syllabus_modules / syllabus_topics
-- ----------------------------------------------------------------------------
create table if not exists public.syllabus_modules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  is_draft boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_modules_updated on public.syllabus_modules;
create trigger trg_modules_updated before update on public.syllabus_modules
  for each row execute function public.set_updated_at();

create index if not exists idx_modules_exam on public.syllabus_modules(exam_id, position);

create table if not exists public.syllabus_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.syllabus_modules(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  estimated_minutes int not null default 60 check (estimated_minutes between 5 and 1200),
  difficulty int not null default 3 check (difficulty between 1 and 5),
  status topic_status not null default 'non_iniziato',
  -- padronanza reale 0..1, aggiornata da sessioni, ripassi, esercizi
  mastery numeric(4,3) not null default 0 check (mastery between 0 and 1),
  comprehension numeric(4,3) not null default 0 check (comprehension between 0 and 1),
  frequently_asked boolean not null default false,
  is_draft boolean not null default true,
  total_study_minutes int not null default 0,
  first_studied_at timestamptz,
  last_studied_at timestamptz,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_topics_updated on public.syllabus_topics;
create trigger trg_topics_updated before update on public.syllabus_topics
  for each row execute function public.set_updated_at();

create index if not exists idx_topics_module on public.syllabus_topics(module_id, position);
create index if not exists idx_topics_exam on public.syllabus_topics(exam_id);
create index if not exists idx_topics_user_status on public.syllabus_topics(user_id, status);

create table if not exists public.topic_prerequisites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.syllabus_topics(id) on delete cascade,
  prerequisite_topic_id uuid not null references public.syllabus_topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint topic_prereq_not_self check (topic_id <> prerequisite_topic_id),
  unique (topic_id, prerequisite_topic_id)
);

-- ----------------------------------------------------------------------------
-- study_resources / resource_topic_links
-- ----------------------------------------------------------------------------
create table if not exists public.study_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete set null,
  title text not null,
  type resource_type not null default 'pdf',
  url text,
  storage_path text,
  file_name text,
  file_size bigint check (file_size is null or file_size <= 52428800), -- max 50 MB
  mime_type text,
  author text,
  tags text[] not null default '{}',
  notes text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_has_target check (url is not null or storage_path is not null or type in ('libro', 'appunti'))
);

drop trigger if exists trg_resources_updated on public.study_resources;
create trigger trg_resources_updated before update on public.study_resources
  for each row execute function public.set_updated_at();

create index if not exists idx_resources_user on public.study_resources(user_id);
create index if not exists idx_resources_tags on public.study_resources using gin(tags);

create table if not exists public.resource_topic_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.study_resources(id) on delete cascade,
  topic_id uuid not null references public.syllabus_topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resource_id, topic_id)
);

create index if not exists idx_rtl_topic on public.resource_topic_links(topic_id);

-- ----------------------------------------------------------------------------
-- Disponibilità
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7), -- 1 = lunedì
  available_minutes int not null default 0 check (available_minutes between 0 and 960),
  preferred_start time,
  preferred_end time,
  is_rest_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, weekday)
);

drop trigger if exists trg_availability_updated on public.weekly_availability;
create trigger trg_availability_updated before update on public.weekly_availability
  for each row execute function public.set_updated_at();

create table if not exists public.unavailable_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  reason text,
  available_minutes int check (available_minutes between 0 and 960), -- null = intera giornata non disponibile
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ----------------------------------------------------------------------------
-- Pianificazione
-- ----------------------------------------------------------------------------
create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Piano principale',
  start_date date not null default current_date,
  end_date date,
  is_active boolean not null default true,
  strategy jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_plans_updated on public.study_plans;
create trigger trg_plans_updated before update on public.study_plans
  for each row execute function public.set_updated_at();

create unique index if not exists uq_active_plan on public.study_plans(user_id) where is_active;

create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.study_plans(id) on delete set null,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  review_schedule_id uuid,
  scheduled_date date not null,
  position int not null default 0,
  planned_minutes int not null check (planned_minutes between 5 and 480),
  actual_minutes int check (actual_minutes >= 0),
  activity_type activity_type not null default 'teoria',
  title text not null,
  objective text,
  status task_status not null default 'pianificata',
  priority_score numeric(6,2) not null default 0,
  priority_explanation jsonb not null default '[]'::jsonb,
  is_locked boolean not null default false, -- attività fissata a mano: il motore non la sposta
  rescheduled_from date,
  reschedule_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_tasks_updated on public.study_tasks;
create trigger trg_tasks_updated before update on public.study_tasks
  for each row execute function public.set_updated_at();

create index if not exists idx_tasks_user_date on public.study_tasks(user_id, scheduled_date);
create index if not exists idx_tasks_user_status on public.study_tasks(user_id, status);
create index if not exists idx_tasks_exam on public.study_tasks(exam_id);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.study_tasks(id) on delete set null,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  activity_type activity_type not null default 'teoria',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  planned_minutes int not null default 0,
  effective_minutes int not null default 0 check (effective_minutes >= 0),
  pause_minutes int not null default 0 check (pause_minutes >= 0),
  interruptions int not null default 0 check (interruptions >= 0),
  comprehension int check (comprehension between 1 and 5),
  recall int check (recall between 1 and 5),
  objective_completed boolean,
  difficulties text,
  notes text,
  doubts text,
  next_review_days int,
  client_uuid text, -- per la sincronizzazione offline idempotente
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sessions_updated on public.study_sessions;
create trigger trg_sessions_updated before update on public.study_sessions
  for each row execute function public.set_updated_at();

create index if not exists idx_sessions_user_start on public.study_sessions(user_id, started_at desc);
create index if not exists idx_sessions_topic on public.study_sessions(topic_id);
create unique index if not exists uq_session_client_uuid
  on public.study_sessions(user_id, client_uuid) where client_uuid is not null;

-- ----------------------------------------------------------------------------
-- Ripetizione dilazionata
-- ----------------------------------------------------------------------------
create table if not exists public.review_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.syllabus_topics(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  due_date date not null,
  interval_days int not null default 1 check (interval_days between 1 and 365),
  repetition int not null default 0 check (repetition >= 0),
  ease numeric(4,2) not null default 2.5 check (ease between 1.3 and 3.5),
  last_grade int check (last_grade between 0 and 4),
  last_reviewed_at timestamptz,
  status review_status not null default 'pianificato',
  reason text, -- spiegazione leggibile del perché di questa data
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id)
);

drop trigger if exists trg_reviews_updated on public.review_schedules;
create trigger trg_reviews_updated before update on public.review_schedules
  for each row execute function public.set_updated_at();

create index if not exists idx_reviews_user_due on public.review_schedules(user_id, due_date);

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_schedule_id uuid references public.review_schedules(id) on delete set null,
  topic_id uuid not null references public.syllabus_topics(id) on delete cascade,
  grade int not null check (grade between 0 and 4),
  previous_interval int not null default 0,
  new_interval int not null default 1,
  previous_ease numeric(4,2),
  new_ease numeric(4,2),
  explanation text,
  reviewed_at timestamptz not null default now()
);

create index if not exists idx_review_logs_user on public.review_logs(user_id, reviewed_at desc);

-- ----------------------------------------------------------------------------
-- Recupero attivo: domande, flashcard, esercizi
-- ----------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  type question_type not null default 'aperta',
  prompt text not null,
  answer text,
  evaluation_criteria text,
  options jsonb not null default '[]'::jsonb,
  correct_option int,
  difficulty int not null default 3 check (difficulty between 1 and 5),
  source content_source not null default 'manuale',
  needs_verification boolean not null default false,
  times_asked int not null default 0,
  times_correct int not null default 0,
  last_asked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_questions_updated on public.questions;
create trigger trg_questions_updated before update on public.questions
  for each row execute function public.set_updated_at();

create index if not exists idx_questions_exam on public.questions(exam_id);
create index if not exists idx_questions_topic on public.questions(topic_id);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  given_answer text,
  self_score int check (self_score between 0 and 5),
  is_correct boolean,
  seconds_used int,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_question_attempts_user on public.question_attempts(user_id, attempted_at desc);

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  front text not null,
  back text not null,
  hint text,
  difficulty int not null default 3 check (difficulty between 1 and 5),
  interval_days int not null default 1,
  ease numeric(4,2) not null default 2.5,
  repetition int not null default 0,
  due_date date not null default current_date,
  times_reviewed int not null default 0,
  times_correct int not null default 0,
  source content_source not null default 'manuale',
  needs_verification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_flashcards_updated on public.flashcards;
create trigger trg_flashcards_updated before update on public.flashcards
  for each row execute function public.set_updated_at();

create index if not exists idx_flashcards_due on public.flashcards(user_id, due_date);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  title text not null,
  statement text not null,
  solution text,
  difficulty int not null default 3 check (difficulty between 1 and 5),
  estimated_minutes int not null default 15 check (estimated_minutes between 1 and 600),
  tags text[] not null default '{}',
  source content_source not null default 'manuale',
  needs_verification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_exercises_updated on public.exercises;
create trigger trg_exercises_updated before update on public.exercises
  for each row execute function public.set_updated_at();

create index if not exists idx_exercises_exam on public.exercises(exam_id);

create table if not exists public.exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  attempted_at timestamptz not null default now(),
  minutes_used int check (minutes_used >= 0),
  is_correct boolean not null default false,
  self_score int check (self_score between 0 and 5),
  answer text,
  error_type error_type,
  notes text
);

create index if not exists idx_exercise_attempts_user on public.exercise_attempts(user_id, attempted_at desc);

-- ----------------------------------------------------------------------------
-- Simulazioni d'esame
-- ----------------------------------------------------------------------------
create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  title text not null,
  kind mock_exam_kind not null default 'scritto',
  duration_minutes int not null default 90 check (duration_minutes between 5 and 480),
  max_score numeric(6,2) not null default 30,
  pass_threshold numeric(6,2) not null default 18,
  topic_ids uuid[] not null default '{}',
  config jsonb not null default '{}'::jsonb,
  source content_source not null default 'manuale',
  needs_verification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_mock_updated on public.mock_exams;
create trigger trg_mock_updated before update on public.mock_exams
  for each row execute function public.set_updated_at();

create table if not exists public.mock_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mock_exam_id uuid not null references public.mock_exams(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  minutes_used int check (minutes_used >= 0),
  score numeric(6,2),
  max_score numeric(6,2) not null default 30,
  passed boolean,
  self_evaluation int check (self_evaluation between 1 and 5),
  topics_covered uuid[] not null default '{}',
  weak_points text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mock_attempts_user on public.mock_exam_attempts(user_id, exam_id, started_at desc);

-- ----------------------------------------------------------------------------
-- Quaderno degli errori
-- ----------------------------------------------------------------------------
create table if not exists public.error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  source_type text not null default 'manuale'
    check (source_type in ('manuale', 'domanda', 'esercizio', 'simulazione', 'sessione')),
  source_id uuid,
  question_text text not null,
  given_answer text,
  correct_answer text,
  error_type error_type not null default 'concettuale',
  cause text,
  correction text,
  attachment_path text,
  occurred_on date not null default current_date,
  repetitions int not null default 1 check (repetitions >= 1),
  last_outcome text not null default 'non_risolto'
    check (last_outcome in ('non_risolto', 'parziale', 'risolto')),
  next_attempt_date date,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_error_log_updated on public.error_log;
create trigger trg_error_log_updated before update on public.error_log
  for each row execute function public.set_updated_at();

create index if not exists idx_error_log_user on public.error_log(user_id, resolved, next_attempt_date);
create index if not exists idx_error_log_topic on public.error_log(topic_id);

-- ----------------------------------------------------------------------------
-- Snapshot di preparazione
-- ----------------------------------------------------------------------------
create table if not exists public.readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  snapshot_date date not null default current_date,
  overall numeric(5,4) not null check (overall between 0 and 1),
  coverage numeric(5,4) not null default 0,
  active_recall numeric(5,4) not null default 0,
  exercises numeric(5,4) not null default 0,
  mock numeric(5,4) not null default 0,
  review_regularity numeric(5,4) not null default 0,
  confidence numeric(5,4) not null default 0,
  risk risk_level not null default 'grigio',
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, exam_id, snapshot_date)
);

create index if not exists idx_readiness_exam on public.readiness_snapshots(exam_id, snapshot_date desc);

-- ----------------------------------------------------------------------------
-- Notifiche
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'generico',
  title text not null,
  body text,
  link text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id, scheduled_for desc);

-- ----------------------------------------------------------------------------
-- Assistente AI
-- ----------------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete set null,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  mode text not null default 'chat' check (mode in ('chat', 'interrogami', 'genera', 'analisi')),
  title text not null default 'Conversazione',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_ai_conv_updated on public.ai_conversations;
create trigger trg_ai_conv_updated before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_messages_conv on public.ai_messages(conversation_id, created_at);

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  request_count int not null default 0,
  primary key (user_id, day)
);
