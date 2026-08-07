-- ============================================================================
-- StudyAI — 0006_icone_e_analisi_ai.sql
--
-- 1. Icona per ogni materia, per riconoscerla a colpo d'occhio.
-- 2. Difficoltà stimata dal contenuto reale, non solo dichiarata dall'utente.
-- 3. Analisi AI del materiale: concetti chiave, prerequisiti, esercizi e quiz
--    generati a partire dal testo delle slide.
-- ============================================================================

-- ---------------------------------------------------------------- icone
alter table public.exams
  -- nome dell'icona Lucide (elenco curato in src/lib/exam-icons.ts)
  add column if not exists icon text not null default 'book-open';

-- ------------------------------------------- difficoltà misurata sul contenuto
alter table public.syllabus_topics
  -- difficoltà stimata dall'analisi del testo (1..5); null = non analizzato
  add column if not exists content_difficulty int
    check (content_difficulty is null or content_difficulty between 1 and 5),
  -- densità di formule/simboli: alza il tempo per pagina
  add column if not exists formula_density numeric(4,3)
    check (formula_density is null or formula_density between 0 and 1),
  -- concetti chiave estratti dal materiale
  add column if not exists key_concepts text[] not null default '{}',
  add column if not exists analyzed_at timestamptz;

alter table public.resource_segments
  add column if not exists content_difficulty int
    check (content_difficulty is null or content_difficulty between 1 and 5),
  add column if not exists formula_density numeric(4,3)
    check (formula_density is null or formula_density between 0 and 1),
  -- estratto del testo, usato per l'analisi e non ricalcolato ogni volta
  add column if not exists text_sample text,
  add column if not exists word_count int check (word_count is null or word_count >= 0),
  add column if not exists analyzed_at timestamptz;

-- --------------------------------------------- stato dell'analisi per esame
create table if not exists public.material_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  status text not null default 'in_corso'
    check (status in ('in_corso', 'completata', 'fallita', 'annullata')),
  -- avanzamento: blocchi analizzati su totale
  segments_total int not null default 0 check (segments_total >= 0),
  segments_done int not null default 0 check (segments_done >= 0),
  questions_created int not null default 0,
  exercises_created int not null default 0,
  flashcards_created int not null default 0,
  /* sintesi leggibile: ordine consigliato, prerequisiti, punti critici */
  summary text,
  prerequisites jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_material_analyses_updated on public.material_analyses;
create trigger trg_material_analyses_updated before update on public.material_analyses
  for each row execute function public.set_updated_at();

create index if not exists idx_material_analyses_exam
  on public.material_analyses(user_id, exam_id, started_at desc);

alter table public.material_analyses enable row level security;
alter table public.material_analyses force row level security;

drop policy if exists "material_analyses_select_own" on public.material_analyses;
create policy "material_analyses_select_own" on public.material_analyses
  for select using (auth.uid() = user_id);

drop policy if exists "material_analyses_insert_own" on public.material_analyses;
create policy "material_analyses_insert_own" on public.material_analyses
  for insert with check (auth.uid() = user_id);

drop policy if exists "material_analyses_update_own" on public.material_analyses;
create policy "material_analyses_update_own" on public.material_analyses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "material_analyses_delete_own" on public.material_analyses;
create policy "material_analyses_delete_own" on public.material_analyses
  for delete using (auth.uid() = user_id);

-- ------------------------------------------ icone predefinite per i 14 esami
-- Solo per chi ha già i dati: le nuove installazioni le ricevono dal seed.
update public.exams set icon = case
  when name ilike '%elettronica%'                    then 'cpu'
  when name ilike '%applicazioni industriali%'       then 'zap'
  when name ilike '%architettura dei calcolatori%'   then 'microchip'
  when name ilike '%controlli automatici%'           then 'sliders-horizontal'
  when name ilike '%inglese%'                        then 'languages'
  when name ilike '%ingegneria del software%'        then 'git-branch'
  when name ilike '%matematica%'                     then 'sigma'
  when name ilike '%probabilistic%'                  then 'dices'
  when name ilike '%modelli e algoritmi%'            then 'network'
  when name ilike '%sistemi mobili%'                 then 'smartphone'
  when name ilike '%reti di telecomunicazione%'      then 'radio-tower'
  when name ilike '%sistemi operativi%'              then 'terminal'
  when name ilike '%tecnologie internet%'            then 'globe'
  when name ilike '%cloud%'                          then 'cloud'
  else 'book-open'
end
where icon = 'book-open';
