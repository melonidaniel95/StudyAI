-- ============================================================================
-- StudyOS — 0002_rls.sql
-- Row Level Security su tutte le tabelle.
-- Regola unica: ogni utente vede e modifica esclusivamente le righe in cui
-- user_id = auth.uid() (per profiles: id = auth.uid()).
-- ============================================================================

-- profiles: la chiave è "id", non "user_id"
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- Tutte le altre tabelle di dominio: policy generate in modo uniforme.
do $$
declare
  t text;
  tables text[] := array[
    'exams',
    'exam_dependencies',
    'exam_sessions',
    'exam_attempts',
    'syllabus_modules',
    'syllabus_topics',
    'topic_prerequisites',
    'study_resources',
    'resource_topic_links',
    'weekly_availability',
    'unavailable_dates',
    'study_plans',
    'study_tasks',
    'study_sessions',
    'review_schedules',
    'review_logs',
    'questions',
    'question_attempts',
    'flashcards',
    'exercises',
    'exercise_attempts',
    'mock_exams',
    'mock_exam_attempts',
    'error_log',
    'readiness_snapshots',
    'notifications',
    'ai_conversations',
    'ai_messages',
    'ai_usage'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || '_select_own', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t || '_insert_own', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t || '_delete_own', t
    );
  end loop;
end $$;

-- Revoca l'accesso diretto ai ruoli anonimi sulle tabelle sensibili di sistema
revoke all on function public.handle_new_user() from public;
