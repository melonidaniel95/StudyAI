-- ============================================================================
-- StudyOS — 0004_seed_function.sql
-- Funzione di seed richiamata alla fine dell'onboarding.
-- Popola, SOLO per l'utente autenticato: 14 esami, prerequisiti, appelli 2026,
-- disponibilità settimanale, piano attivo e i due programmi dimostrativi
-- (Elementi di Elettronica, Metodi Probabilistici) marcati come BOZZA.
-- È idempotente: se l'utente ha già degli esami non fa nulla.
-- ============================================================================

create or replace function public.seed_initial_data()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  v_count int;
  v_exam_elettronica uuid;
  v_exam_metodi uuid;
  v_mod uuid;
begin
  if uid is null then
    raise exception 'Utente non autenticato';
  end if;

  select count(*) into v_count from public.exams where user_id = uid;
  if v_count > 0 then
    return json_build_object('seeded', false, 'reason', 'Dati iniziali già presenti');
  end if;

  -- ------------------------------------------------------------------ esami
  insert into public.exams
    (user_id, name, short_name, kind, has_exercises, has_oral, difficulty, priority, cfu, estimated_hours, color, target_date)
  values
    (uid, 'Amministrazione di Sistemi IT e Cloud', 'Sistemi IT e Cloud', 'misto',    true,  true,  3, 2, 6,  70,  '#4C6382', date '2027-09-30'),
    (uid, 'Applicazioni Industriali Elettriche',   'Appl. Ind. Elettriche', 'scritto', true,  false, 4, 2, 6,  90,  '#6B8CA8', date '2027-09-30'),
    (uid, 'Architettura dei Calcolatori Elettronici', 'Architettura Calc.', 'scritto', true,  false, 4, 3, 9,  110, '#4C6382', date '2027-09-30'),
    (uid, 'Elementi di Elettronica',               'Elettronica',        'scritto', true,  false, 4, 5, 9,  100, '#B98B4A', date '2026-08-27'),
    (uid, 'Fondamenti di Controlli Automatici',    'Controlli Automatici', 'scritto', true, false, 5, 2, 9,  120, '#6B8CA8', date '2027-09-30'),
    (uid, 'Idoneità di Lingua Inglese B2',         'Inglese B2',         'idoneita', true, true,  2, 3, 3,  40,  '#8FA9BF', date '2027-09-30'),
    (uid, 'Ingegneria del Software',               'Ing. del Software',  'misto',   true,  true,  3, 2, 9,  90,  '#4C6382', date '2027-09-30'),
    (uid, 'Matematica Applicata',                  'Matematica Applicata', 'scritto', true, false, 5, 3, 9,  120, '#6B8CA8', date '2027-09-30'),
    (uid, 'Metodi Probabilistici per l''Ingegneria', 'Metodi Probabilistici', 'scritto', true, false, 4, 5, 6, 90, '#B98B4A', date '2026-09-15'),
    (uid, 'Modelli e Algoritmi per il Supporto alle Decisioni', 'Modelli e Algoritmi', 'scritto', true, false, 4, 2, 6, 80, '#4C6382', date '2027-09-30'),
    (uid, 'Programmazione di Sistemi Mobili',      'Sistemi Mobili',     'progetto', true, true,  3, 2, 6,  80,  '#6B8CA8', date '2027-09-30'),
    (uid, 'Reti di Telecomunicazione',             'Reti di TLC',        'scritto', true,  false, 4, 2, 9,  100, '#4C6382', date '2027-09-30'),
    (uid, 'Sistemi Operativi',                     'Sistemi Operativi',  'scritto', true,  false, 4, 3, 9,  100, '#6B8CA8', date '2027-09-30'),
    (uid, 'Tecnologie Internet',                   'Tecnologie Internet', 'scritto', true, false, 3, 2, 6,  70,  '#8FA9BF', date '2027-09-30');

  -- ------------------------------------------------------------ prerequisiti
  insert into public.exam_dependencies (user_id, exam_id, depends_on_exam_id, strength)
  select uid, child.id, parent.id, 'forte'
  from (values
    ('Metodi Probabilistici per l''Ingegneria',                 'Matematica Applicata'),
    ('Fondamenti di Controlli Automatici',                      'Matematica Applicata'),
    ('Modelli e Algoritmi per il Supporto alle Decisioni',      'Metodi Probabilistici per l''Ingegneria'),
    ('Applicazioni Industriali Elettriche',                     'Elementi di Elettronica'),
    ('Sistemi Operativi',                                       'Architettura dei Calcolatori Elettronici'),
    ('Amministrazione di Sistemi IT e Cloud',                   'Architettura dei Calcolatori Elettronici'),
    ('Tecnologie Internet',                                     'Reti di Telecomunicazione'),
    ('Programmazione di Sistemi Mobili',                        'Ingegneria del Software')
  ) as d(child_name, parent_name)
  join public.exams child  on child.user_id  = uid and child.name  = d.child_name
  join public.exams parent on parent.user_id = uid and parent.name = d.parent_name;

  -- ---------------------------------------------------------------- appelli
  insert into public.exam_sessions (user_id, exam_id, exam_date, status, is_estimated)
  select uid, e.id, s.exam_date::date, 'confermato', false
  from (values
    ('Amministrazione di Sistemi IT e Cloud', '2026-01-09'),
    ('Amministrazione di Sistemi IT e Cloud', '2026-02-06'),
    ('Amministrazione di Sistemi IT e Cloud', '2026-06-19'),
    ('Amministrazione di Sistemi IT e Cloud', '2026-07-06'),
    ('Amministrazione di Sistemi IT e Cloud', '2026-08-28'),
    ('Amministrazione di Sistemi IT e Cloud', '2026-09-11'),

    ('Applicazioni Industriali Elettriche', '2026-01-20'),
    ('Applicazioni Industriali Elettriche', '2026-02-09'),
    ('Applicazioni Industriali Elettriche', '2026-06-10'),
    ('Applicazioni Industriali Elettriche', '2026-07-17'),
    ('Applicazioni Industriali Elettriche', '2026-08-05'),
    ('Applicazioni Industriali Elettriche', '2026-08-27'),
    ('Applicazioni Industriali Elettriche', '2026-09-09'),

    ('Architettura dei Calcolatori Elettronici', '2026-01-15'),
    ('Architettura dei Calcolatori Elettronici', '2026-02-18'),
    ('Architettura dei Calcolatori Elettronici', '2026-06-22'),
    ('Architettura dei Calcolatori Elettronici', '2026-07-10'),
    ('Architettura dei Calcolatori Elettronici', '2026-07-28'),
    ('Architettura dei Calcolatori Elettronici', '2026-09-01'),
    ('Architettura dei Calcolatori Elettronici', '2026-09-11'),

    ('Elementi di Elettronica', '2026-01-20'),
    ('Elementi di Elettronica', '2026-02-09'),
    ('Elementi di Elettronica', '2026-06-10'),
    ('Elementi di Elettronica', '2026-07-17'),
    ('Elementi di Elettronica', '2026-08-05'),
    ('Elementi di Elettronica', '2026-08-27'),
    ('Elementi di Elettronica', '2026-09-09'),

    ('Fondamenti di Controlli Automatici', '2026-01-21'),
    ('Fondamenti di Controlli Automatici', '2026-02-17'),
    ('Fondamenti di Controlli Automatici', '2026-06-08'),
    ('Fondamenti di Controlli Automatici', '2026-06-29'),
    ('Fondamenti di Controlli Automatici', '2026-07-22'),
    ('Fondamenti di Controlli Automatici', '2026-08-31'),
    ('Fondamenti di Controlli Automatici', '2026-09-14'),

    ('Idoneità di Lingua Inglese B2', '2026-01-23'),
    ('Idoneità di Lingua Inglese B2', '2026-06-16'),
    ('Idoneità di Lingua Inglese B2', '2026-09-09'),

    ('Matematica Applicata', '2026-01-09'),
    ('Matematica Applicata', '2026-01-23'),
    ('Matematica Applicata', '2026-02-06'),
    ('Matematica Applicata', '2026-03-30'),
    ('Matematica Applicata', '2026-06-16'),
    ('Matematica Applicata', '2026-07-07'),
    ('Matematica Applicata', '2026-09-04'),
    ('Matematica Applicata', '2026-09-14'),

    ('Metodi Probabilistici per l''Ingegneria', '2026-01-21'),
    ('Metodi Probabilistici per l''Ingegneria', '2026-02-12'),
    ('Metodi Probabilistici per l''Ingegneria', '2026-06-11'),
    ('Metodi Probabilistici per l''Ingegneria', '2026-06-30'),
    ('Metodi Probabilistici per l''Ingegneria', '2026-07-20'),
    ('Metodi Probabilistici per l''Ingegneria', '2026-09-02'),
    ('Metodi Probabilistici per l''Ingegneria', '2026-09-15'),

    ('Modelli e Algoritmi per il Supporto alle Decisioni', '2026-01-09'),
    ('Modelli e Algoritmi per il Supporto alle Decisioni', '2026-02-06'),
    ('Modelli e Algoritmi per il Supporto alle Decisioni', '2026-06-12'),
    ('Modelli e Algoritmi per il Supporto alle Decisioni', '2026-07-03'),
    ('Modelli e Algoritmi per il Supporto alle Decisioni', '2026-07-22'),
    ('Modelli e Algoritmi per il Supporto alle Decisioni', '2026-08-31'),
    ('Modelli e Algoritmi per il Supporto alle Decisioni', '2026-09-14'),

    ('Programmazione di Sistemi Mobili', '2026-02-05'),
    ('Programmazione di Sistemi Mobili', '2026-06-16'),
    ('Programmazione di Sistemi Mobili', '2026-06-30'),
    ('Programmazione di Sistemi Mobili', '2026-07-14'),
    ('Programmazione di Sistemi Mobili', '2026-09-01'),
    ('Programmazione di Sistemi Mobili', '2026-09-16'),

    ('Reti di Telecomunicazione', '2026-01-08'),
    ('Reti di Telecomunicazione', '2026-06-09'),
    ('Reti di Telecomunicazione', '2026-06-18'),
    ('Reti di Telecomunicazione', '2026-07-23'),
    ('Reti di Telecomunicazione', '2026-08-27'),
    ('Reti di Telecomunicazione', '2026-09-15'),

    ('Sistemi Operativi', '2026-01-15'),
    ('Sistemi Operativi', '2026-02-12'),
    ('Sistemi Operativi', '2026-06-17'),
    ('Sistemi Operativi', '2026-06-30'),
    ('Sistemi Operativi', '2026-07-23'),
    ('Sistemi Operativi', '2026-09-01'),
    ('Sistemi Operativi', '2026-09-15'),

    ('Tecnologie Internet', '2026-01-23'),
    ('Tecnologie Internet', '2026-02-20'),
    ('Tecnologie Internet', '2026-03-20'),
    ('Tecnologie Internet', '2026-04-24')
  ) as s(exam_name, exam_date)
  join public.exams e on e.user_id = uid and e.name = s.exam_name;

  -- Nota: Ingegneria del Software resta volutamente senza appelli (date non ancora disponibili).

  select id into v_exam_elettronica from public.exams where user_id = uid and name = 'Elementi di Elettronica';
  select id into v_exam_metodi from public.exams where user_id = uid and name = 'Metodi Probabilistici per l''Ingegneria';

  -- ------------------------------------------------- appelli principali/riserva
  update public.exam_sessions set role = 'principale'
    where user_id = uid and exam_id = v_exam_elettronica and exam_date = date '2026-08-27';
  update public.exam_sessions set role = 'riserva'
    where user_id = uid and exam_id = v_exam_elettronica and exam_date = date '2026-09-09';

  update public.exam_sessions set role = 'principale'
    where user_id = uid and exam_id = v_exam_metodi and exam_date = date '2026-09-15';
  update public.exam_sessions set role = 'riserva'
    where user_id = uid and exam_id = v_exam_metodi and exam_date = date '2026-09-02';

  update public.exams set status = 'pianificato'
    where user_id = uid and id in (v_exam_elettronica, v_exam_metodi);

  -- --------------------------------------------------- disponibilità di default
  insert into public.weekly_availability (user_id, weekday, available_minutes, preferred_start, is_rest_day)
  select uid,
         g,
         case when g <= 5 then 120 else 240 end,
         case when g <= 5 then time '21:00' else time '09:30' end,
         false
  from generate_series(1, 7) as g
  on conflict (user_id, weekday) do nothing;

  -- ----------------------------------------------------------- piano attivo
  insert into public.study_plans (user_id, name, start_date, end_date, is_active, strategy, notes)
  values (
    uid,
    'Piano principale',
    current_date,
    date '2027-09-30',
    true,
    jsonb_build_object(
      'bufferRatio', 0.15,
      'maxParallelExams', 2,
      'note', 'Priorità immediata: Elettronica fino al 27/08/2026, poi trasferimento su Metodi.'
    ),
    'Piano generato automaticamente al termine dell''onboarding.'
  )
  on conflict do nothing;

  -- ============================ PROGRAMMA DEMO — ELEMENTI DI ELETTRONICA =====
  -- Struttura iniziale da verificare con il programma ufficiale.
  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_elettronica, 'Fisica dei semiconduttori',
          'Struttura iniziale da verificare con il programma ufficiale.', 1, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, is_draft)
  values
    (uid, v_mod, v_exam_elettronica, 'Semiconduttori', 1, 90, 3, true),
    (uid, v_mod, v_exam_elettronica, 'Portatori di carica', 2, 90, 3, true),
    (uid, v_mod, v_exam_elettronica, 'Drogaggio', 3, 75, 3, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_elettronica, 'Giunzione PN', 'Struttura iniziale da verificare.', 2, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, frequently_asked, is_draft)
  values
    (uid, v_mod, v_exam_elettronica, 'Giunzione PN', 1, 120, 4, true, true),
    (uid, v_mod, v_exam_elettronica, 'Regione di svuotamento', 2, 90, 4, false, true),
    (uid, v_mod, v_exam_elettronica, 'Tensione di built-in', 3, 75, 4, true, true),
    (uid, v_mod, v_exam_elettronica, 'Polarizzazione diretta e inversa', 4, 105, 4, true, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_elettronica, 'Diodi', 'Struttura iniziale da verificare.', 3, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, frequently_asked, is_draft)
  values
    (uid, v_mod, v_exam_elettronica, 'Modello del diodo', 1, 105, 4, true, true),
    (uid, v_mod, v_exam_elettronica, 'Circuiti con diodi', 2, 150, 4, true, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_elettronica, 'Transistor', 'Struttura iniziale da verificare.', 4, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, frequently_asked, is_draft)
  values
    (uid, v_mod, v_exam_elettronica, 'BJT', 1, 180, 5, true, true),
    (uid, v_mod, v_exam_elettronica, 'MOSFET', 2, 180, 5, true, true),
    (uid, v_mod, v_exam_elettronica, 'Linearizzazione e piccolo segnale', 3, 150, 5, true, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_elettronica, 'Verifica finale', 'Esercitazione e simulazione.', 5, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, is_draft)
  values
    (uid, v_mod, v_exam_elettronica, 'Esercizi riepilogativi', 1, 240, 4, true),
    (uid, v_mod, v_exam_elettronica, 'Simulazione finale', 2, 120, 4, true);

  -- ============================ PROGRAMMA DEMO — METODI PROBABILISTICI =======
  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_metodi, 'Fondamenti di probabilità',
          'Struttura iniziale da verificare con il programma ufficiale.', 1, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, frequently_asked, is_draft)
  values
    (uid, v_mod, v_exam_metodi, 'Elementi di probabilità', 1, 90, 3, false, true),
    (uid, v_mod, v_exam_metodi, 'Probabilità condizionata', 2, 90, 4, true, true),
    (uid, v_mod, v_exam_metodi, 'Teorema di Bayes', 3, 90, 4, true, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_metodi, 'Variabili aleatorie', 'Struttura iniziale da verificare.', 2, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, frequently_asked, is_draft)
  values
    (uid, v_mod, v_exam_metodi, 'Variabili aleatorie', 1, 105, 4, true, true),
    (uid, v_mod, v_exam_metodi, 'Distribuzioni discrete', 2, 120, 4, true, true),
    (uid, v_mod, v_exam_metodi, 'Distribuzioni continue', 3, 120, 4, true, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_metodi, 'Momenti', 'Struttura iniziale da verificare.', 3, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, frequently_asked, is_draft)
  values
    (uid, v_mod, v_exam_metodi, 'Valore atteso', 1, 75, 3, true, true),
    (uid, v_mod, v_exam_metodi, 'Varianza', 2, 75, 3, true, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_metodi, 'Variabili congiunte e trasformazioni', 'Struttura iniziale da verificare.', 4, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, frequently_asked, is_draft)
  values
    (uid, v_mod, v_exam_metodi, 'Variabili congiunte', 1, 120, 5, true, true),
    (uid, v_mod, v_exam_metodi, 'Trasformazioni di variabili aleatorie', 2, 120, 5, false, true);

  insert into public.syllabus_modules (user_id, exam_id, title, description, position, is_draft)
  values (uid, v_exam_metodi, 'Stima e verifica', 'Struttura iniziale da verificare.', 5, true)
  returning id into v_mod;
  insert into public.syllabus_topics (user_id, module_id, exam_id, title, position, estimated_minutes, difficulty, is_draft)
  values
    (uid, v_mod, v_exam_metodi, 'Stima', 1, 120, 4, true),
    (uid, v_mod, v_exam_metodi, 'Esercizi riepilogativi', 2, 240, 4, true),
    (uid, v_mod, v_exam_metodi, 'Simulazione finale', 3, 120, 4, true);

  return json_build_object(
    'seeded', true,
    'exams', 14,
    'note', 'I programmi di Elettronica e Metodi sono una struttura iniziale da verificare.'
  );
end;
$fn$;

revoke all on function public.seed_initial_data() from public;
grant execute on function public.seed_initial_data() to authenticated;
