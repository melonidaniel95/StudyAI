/**
 * Isolamento dei dati utente.
 *
 * Questi test non richiedono un database: analizzano le migrazioni e il codice
 * server per garantire due invarianti del progetto.
 *  1. la RLS è attiva su tutte le tabelle di dominio, con policy su auth.uid();
 *  2. ogni query o mutazione lato server è filtrata per utente.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const schemaSql = readFileSync(path.join(root, 'supabase/migrations/0001_schema.sql'), 'utf8');
const rlsSql = readFileSync(path.join(root, 'supabase/migrations/0002_rls.sql'), 'utf8');
const storageSql = readFileSync(path.join(root, 'supabase/migrations/0003_storage.sql'), 'utf8');
const seedSql = readFileSync(path.join(root, 'supabase/migrations/0004_seed_function.sql'), 'utf8');

const DOMAIN_TABLES = [
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
  'ai_usage',
];

describe('schema e RLS', () => {
  it('crea tutte le tabelle previste dal modello dati', () => {
    for (const table of [...DOMAIN_TABLES, 'profiles']) {
      expect(schemaSql).toContain(`create table if not exists public.${table}`);
    }
  });

  it('collega ogni tabella di dominio all’utente', () => {
    for (const table of DOMAIN_TABLES) {
      const start = schemaSql.indexOf(`create table if not exists public.${table} (`);
      expect(start, `tabella ${table} non trovata`).toBeGreaterThan(-1);
      const body = schemaSql.slice(start, schemaSql.indexOf(');', start));
      expect(body, `${table} non ha user_id`).toContain('user_id uuid not null references auth.users(id)');
    }
  });

  it('elenca tutte le tabelle di dominio nelle policy RLS', () => {
    for (const table of DOMAIN_TABLES) {
      expect(rlsSql, `${table} non è nell'elenco RLS`).toContain(`'${table}'`);
    }
  });

  it('usa auth.uid() in tutte le policy', () => {
    expect(rlsSql).toContain('auth.uid() = user_id');
    expect(rlsSql).toContain('auth.uid() = id'); // profiles
    expect(rlsSql).toContain('force row level security');
  });

  it('protegge lo storage con una cartella per utente', () => {
    expect(storageSql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(storageSql).toContain("'study-materials'");
    expect(storageSql).toContain('public, file_size_limit');
  });

  it('non rende pubblico il bucket dei materiali', () => {
    expect(storageSql).toMatch(/'study-materials',\s*'study-materials',\s*false/);
  });
});

describe('funzione di seed', () => {
  const exams = [
    'Amministrazione di Sistemi IT e Cloud',
    'Applicazioni Industriali Elettriche',
    'Architettura dei Calcolatori Elettronici',
    'Elementi di Elettronica',
    'Fondamenti di Controlli Automatici',
    'Idoneità di Lingua Inglese B2',
    'Ingegneria del Software',
    'Matematica Applicata',
    "Metodi Probabilistici per l''Ingegneria",
    'Modelli e Algoritmi per il Supporto alle Decisioni',
    'Programmazione di Sistemi Mobili',
    'Reti di Telecomunicazione',
    'Sistemi Operativi',
    'Tecnologie Internet',
  ];

  it('crea i 14 esami richiesti', () => {
    for (const exam of exams) {
      expect(seedSql, `manca ${exam}`).toContain(exam);
    }
  });

  it('imposta gli appelli principali di Elettronica e Metodi', () => {
    expect(seedSql).toContain("exam_date = date '2026-08-27'");
    expect(seedSql).toContain("exam_date = date '2026-09-15'");
  });

  it('crea le 8 relazioni di prerequisito', () => {
    const start = seedSql.indexOf('exam_dependencies');
    const block = seedSql.slice(start, seedSql.indexOf('appelli', start));
    const matches = block.match(/\('.+',\s+'.+'\)/g) ?? [];
    expect(matches.length).toBe(8);
  });

  it('lascia Ingegneria del Software senza appelli', () => {
    const start = seedSql.indexOf('insert into public.exam_sessions');
    const end = seedSql.indexOf('as s(exam_name, exam_date)');
    const block = seedSql.slice(start, end);
    expect(block).not.toContain("('Ingegneria del Software'");
  });

  it('marca i programmi dimostrativi come bozza', () => {
    expect(seedSql).toContain('Struttura iniziale da verificare');
    expect(seedSql).toContain('is_draft');
  });

  it('è idempotente', () => {
    expect(seedSql).toContain('Dati iniziali già presenti');
  });

  it('non è eseguibile da utenti anonimi', () => {
    expect(seedSql).toContain('revoke all on function public.seed_initial_data() from public');
    expect(seedSql).toContain('grant execute on function public.seed_initial_data() to authenticated');
  });
});

function collectFiles(dir: string, extension: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, extension));
    else if (entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

describe('query lato server', () => {
  const files = [
    ...collectFiles(path.join(root, 'src/server'), '.ts'),
  ];

  it('filtra sempre per utente o usa una funzione protetta', () => {
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const statements = content.split('supabase\n').join('supabase');
      const chains = statements.match(/supabase\s*\.from\([^)]*\)[\s\S]{0,600}?;/g) ?? [];
      for (const chain of chains) {
        // Su `profiles` la chiave è `id`; su tutte le altre tabelle è `user_id`.
        const isProfiles = chain.includes("from('profiles')");
        // Le insert usano una variabile di righe costruita con user_id: user.id
        const isInsertWithOwnedRows =
          /\.(insert|upsert)\(\s*(rows|valid|chunk)\b/.test(chain) && content.includes('user_id: user.id');
        const filtered =
          chain.includes(".eq('user_id'") ||
          (isProfiles && /\.eq\('id',\s*(user\.id|userId)\)/.test(chain)) ||
          chain.includes('user_id: user.id') ||
          chain.includes('user_id,') || // upsert con onConflict su user_id
          isInsertWithOwnedRows ||
          chain.includes('rpc(');
        expect(filtered, `Query senza filtro utente in ${path.relative(root, file)}:\n${chain.slice(0, 200)}`).toBe(true);
      }
    }
  });

  it('non contiene chiavi o segreti in chiaro', () => {
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // JWT
      expect(content).not.toMatch(/sk-[A-Za-z0-9]{20,}/); // chiavi API
    }
  });
});
