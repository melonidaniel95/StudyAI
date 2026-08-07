-- ============================================================================
-- StudyAI — 0005_materiale_e_segmenti.sql
--
-- Pianificazione basata sul materiale reale.
--
-- Idea: una risorsa (slide, dispensa, libro) viene divisa in SEGMENTI con un
-- intervallo di pagine. Ogni segmento è collegato a un argomento del programma
-- e porta con sé una stima di tempo calcolata da pagine × minuti-per-pagina.
-- Il ritmo (minuti per pagina) viene ricalibrato dalle sessioni realmente
-- svolte, così le stime diventano sempre più aderenti alla realtà.
-- ============================================================================

-- ------------------------------------------------- risorse: dati sul materiale
alter table public.study_resources
  add column if not exists page_count int check (page_count is null or page_count between 1 and 20000),
  -- struttura estratta dal PDF (indice/segnalibri), conservata per riferimento
  add column if not exists outline jsonb not null default '[]'::jsonb,
  -- numero d'ordine della lezione, se la risorsa è una lezione di un corso
  add column if not exists lecture_number int check (lecture_number is null or lecture_number >= 0),
  add column if not exists processed_at timestamptz;

create index if not exists idx_resources_exam on public.study_resources(user_id, exam_id);

-- --------------------------------------------------------- ritmo di studio
-- Minuti per pagina/slide, per esame. Viene tarato sulle sessioni reali.
alter table public.exams
  add column if not exists minutes_per_page numeric(5,2) not null default 2.0
    check (minutes_per_page between 0.1 and 60),
  add column if not exists minutes_per_page_exercises numeric(5,2) not null default 5.0
    check (minutes_per_page_exercises between 0.1 and 90),
  -- quante misurazioni reali hanno contribuito alla taratura
  add column if not exists pace_samples int not null default 0 check (pace_samples >= 0),
  add column if not exists pace_updated_at timestamptz;

-- ------------------------------------------------------------- segmenti
create table if not exists public.resource_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id uuid not null references public.study_resources(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  topic_id uuid references public.syllabus_topics(id) on delete set null,
  title text not null,
  position int not null default 0,
  page_start int not null check (page_start >= 1),
  page_end int not null check (page_end >= 1),
  -- pagine già coperte: aggiornato dalle sessioni di studio
  pages_done int not null default 0 check (pages_done >= 0),
  estimated_minutes int not null default 0 check (estimated_minutes >= 0),
  actual_minutes int not null default 0 check (actual_minutes >= 0),
  -- 'teoria' o 'esercizi': cambia il ritmo applicato
  kind text not null default 'teoria' check (kind in ('teoria', 'esercizi', 'riferimento')),
  is_draft boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint segment_pages_ordered check (page_end >= page_start)
);

drop trigger if exists trg_segments_updated on public.resource_segments;
create trigger trg_segments_updated before update on public.resource_segments
  for each row execute function public.set_updated_at();

create index if not exists idx_segments_resource on public.resource_segments(resource_id, position);
create index if not exists idx_segments_exam on public.resource_segments(user_id, exam_id);
create index if not exists idx_segments_topic on public.resource_segments(topic_id);

-- --------------------------------------- collegamento con piano e sessioni
alter table public.study_tasks
  add column if not exists resource_id uuid references public.study_resources(id) on delete set null,
  add column if not exists segment_id uuid references public.resource_segments(id) on delete set null,
  add column if not exists page_start int check (page_start is null or page_start >= 1),
  add column if not exists page_end int check (page_end is null or page_end >= 1);

alter table public.study_sessions
  add column if not exists resource_id uuid references public.study_resources(id) on delete set null,
  add column if not exists segment_id uuid references public.resource_segments(id) on delete set null,
  add column if not exists pages_covered int check (pages_covered is null or pages_covered >= 0);

-- ---------------------------------------------------------- RLS sui segmenti
alter table public.resource_segments enable row level security;
alter table public.resource_segments force row level security;

drop policy if exists "resource_segments_select_own" on public.resource_segments;
create policy "resource_segments_select_own" on public.resource_segments
  for select using (auth.uid() = user_id);

drop policy if exists "resource_segments_insert_own" on public.resource_segments;
create policy "resource_segments_insert_own" on public.resource_segments
  for insert with check (auth.uid() = user_id);

drop policy if exists "resource_segments_update_own" on public.resource_segments;
create policy "resource_segments_update_own" on public.resource_segments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "resource_segments_delete_own" on public.resource_segments;
create policy "resource_segments_delete_own" on public.resource_segments
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------ taratura del ritmo
-- Ricalcola i minuti per pagina di un esame a partire dalle sessioni reali.
-- Media pesata: le misurazioni recenti contano di più, il valore resta entro
-- limiti ragionevoli per evitare che una sessione anomala distorca il piano.
create or replace function public.recalibrate_exam_pace(p_exam_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_pace numeric;
  v_samples int;
begin
  if v_user is null then
    raise exception 'Utente non autenticato';
  end if;

  select
    sum(s.effective_minutes)::numeric / nullif(sum(s.pages_covered), 0),
    count(*)
  into v_pace, v_samples
  from public.study_sessions s
  where s.user_id = v_user
    and s.exam_id = p_exam_id
    and s.pages_covered is not null
    and s.pages_covered > 0
    and s.effective_minutes > 0
    and s.started_at > now() - interval '120 days';

  if v_pace is null or v_samples < 3 then
    return null; -- troppo pochi dati: si tiene il valore attuale
  end if;

  v_pace := least(greatest(v_pace, 0.2), 30);

  update public.exams
     set minutes_per_page = round(v_pace, 2),
         pace_samples = v_samples,
         pace_updated_at = now()
   where id = p_exam_id
     and user_id = v_user;

  return round(v_pace, 2);
end;
$fn$;

revoke all on function public.recalibrate_exam_pace(uuid) from public;
grant execute on function public.recalibrate_exam_pace(uuid) to authenticated;
