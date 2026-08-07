'use server';

/**
 * Analisi AI del materiale di una materia.
 *
 * L'AI legge il testo realmente estratto dalle slide (salvato durante
 * l'importazione, quindi senza riscaricare nulla) e per ogni blocco produce:
 *
 *  - una difficoltà 1..5 basata sul contenuto, non dichiarata a occhio;
 *  - i concetti chiave;
 *  - i prerequisiti fra argomenti;
 *  - domande di verifica, esercizi e flashcard.
 *
 * L'analisi procede a lotti: ogni chiamata tratta pochi blocchi, così una
 * materia con 40 lezioni non finisce in un'unica richiesta enorme e
 * l'avanzamento resta visibile. Tutto ciò che viene generato è marcato
 * «Da verificare» e nulla sostituisce quello che hai scritto tu.
 */
import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { callAi, extractJsonArray, isAiConfigured } from '@/lib/ai/provider';
import { MATERIAL_ANALYSIS_SYSTEM } from '@/lib/ai/prompts';
import { todayIso } from '@/lib/domain/dates';

export interface AnalysisProgress {
  ok: boolean;
  message: string;
  analysisId?: string;
  done?: number;
  total?: number;
  finished?: boolean;
  created?: { questions: number; exercises: number; flashcards: number };
}

/** Quanti blocchi vengono mandati all'AI in una singola richiesta. */
const BATCH_SIZE = 4;

interface AnalyzedSegment {
  id: string;
  difficulty?: number;
  concepts?: string[];
  requires?: string[];
  questions?: Array<{ prompt?: string; answer?: string; criteria?: string }>;
  exercises?: Array<{ title?: string; statement?: string; solution?: string; minutes?: number }>;
  flashcards?: Array<{ front?: string; back?: string }>;
}

/** Avvia (o riprende) l'analisi del materiale di un esame. */
export async function startMaterialAnalysisAction(examId: string): Promise<AnalysisProgress> {
  const user = await requireUser();

  if (!isAiConfigured()) {
    return {
      ok: false,
      message:
        'Assistente AI non configurato: imposta AI_PROVIDER e AI_API_KEY nel file .env.local.',
    };
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_enabled')
    .eq('id', user.id)
    .maybeSingle();
  if (!(profile as { ai_enabled: boolean } | null)?.ai_enabled) {
    return {
      ok: false,
      message: 'Attiva l’assistente AI dalle impostazioni: senza il tuo consenso non invio nulla.',
    };
  }

  const { count } = await supabase
    .from('resource_segments')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('exam_id', examId)
    .neq('kind', 'riferimento');

  const total = count ?? 0;
  if (total === 0) {
    return {
      ok: false,
      message: 'Nessun materiale da analizzare: carica prima le slide dalla scheda Materiale.',
    };
  }

  // Riprende un'analisi già in corso invece di crearne una nuova.
  const { data: esistente } = await supabase
    .from('material_analyses')
    .select('id, segments_done, segments_total')
    .eq('user_id', user.id)
    .eq('exam_id', examId)
    .eq('status', 'in_corso')
    .maybeSingle();

  if (esistente) {
    const row = esistente as { id: string; segments_done: number; segments_total: number };
    return {
      ok: true,
      analysisId: row.id,
      done: row.segments_done,
      total: row.segments_total,
      message: 'Analisi ripresa da dove era rimasta.',
    };
  }

  const { data, error } = await supabase
    .from('material_analyses')
    .insert({
      user_id: user.id,
      exam_id: examId,
      status: 'in_corso',
      segments_total: total,
      segments_done: 0,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, message: 'Non è stato possibile avviare l’analisi.' };
  }

  return {
    ok: true,
    analysisId: (data as { id: string }).id,
    done: 0,
    total,
    message: `Analisi avviata su ${total} blocchi di materiale.`,
  };
}

/**
 * Analizza il lotto successivo. Va richiamata finché `finished` non è `true`.
 * Restituisce sempre l'avanzamento, così l'interfaccia può mostrare una barra.
 */
export async function analyzeNextBatchAction(analysisId: string): Promise<AnalysisProgress> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: analysisRow } = await supabase
    .from('material_analyses')
    .select('*')
    .eq('id', analysisId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!analysisRow) return { ok: false, message: 'Analisi non trovata.' };
  const analysis = analysisRow as {
    id: string;
    exam_id: string;
    status: string;
    segments_total: number;
    segments_done: number;
    questions_created: number;
    exercises_created: number;
    flashcards_created: number;
  };

  if (analysis.status !== 'in_corso') {
    return { ok: true, finished: true, message: 'Analisi già conclusa.', analysisId };
  }

  // Esame: difficoltà dichiarata e nome, per contestualizzare il prompt.
  const { data: examRow } = await supabase
    .from('exams')
    .select('name, short_name, difficulty, has_exercises')
    .eq('id', analysis.exam_id)
    .eq('user_id', user.id)
    .maybeSingle();
  const exam = examRow as {
    name: string;
    short_name: string | null;
    difficulty: number;
    has_exercises: boolean;
  } | null;

  // Blocchi non ancora analizzati, in ordine di programma.
  const { data: segmentRows } = await supabase
    .from('resource_segments')
    .select('id, topic_id, title, page_start, page_end, kind, text_sample, word_count')
    .eq('user_id', user.id)
    .eq('exam_id', analysis.exam_id)
    .neq('kind', 'riferimento')
    .is('analyzed_at', null)
    .order('position')
    .limit(BATCH_SIZE);

  const segments = (segmentRows ?? []) as Array<{
    id: string;
    topic_id: string | null;
    title: string;
    page_start: number;
    page_end: number;
    kind: string;
    text_sample: string | null;
    word_count: number | null;
  }>;

  if (segments.length === 0) {
    await supabase
      .from('material_analyses')
      .update({
        status: 'completata',
        completed_at: new Date().toISOString(),
        summary: `Analizzati ${analysis.segments_done} blocchi: create ${analysis.questions_created} domande, ${analysis.exercises_created} esercizi e ${analysis.flashcards_created} flashcard.`,
      })
      .eq('id', analysisId)
      .eq('user_id', user.id);

    revalidatePath(`/esami/${analysis.exam_id}`);
    revalidatePath('/domande');
    revalidatePath('/esercizi');
    revalidatePath('/piano');

    return {
      ok: true,
      finished: true,
      analysisId,
      done: analysis.segments_done,
      total: analysis.segments_total,
      message: 'Analisi completata. Rigenera il piano per usare le nuove stime.',
      created: {
        questions: analysis.questions_created,
        exercises: analysis.exercises_created,
        flashcards: analysis.flashcards_created,
      },
    };
  }

  // ---- Richiesta all'AI ----
  const prompt = [
    `Materia: ${exam?.short_name ?? exam?.name ?? 'esame universitario'}`,
    `Difficoltà dichiarata della materia: ${exam?.difficulty ?? 3}/5`,
    exam?.has_exercises ? 'La materia prevede esercizi.' : 'La materia non prevede esercizi numerici.',
    '',
    'Blocchi di materiale da analizzare:',
    ...segments.map((segment, index) =>
      [
        `--- BLOCCO ${index + 1} (id: ${segment.id}) ---`,
        `Titolo: ${segment.title}`,
        `Pagine: ${segment.page_start}-${segment.page_end} (${segment.word_count ?? 0} parole)`,
        `Tipo: ${segment.kind}`,
        'Testo estratto:',
        segment.text_sample?.slice(0, 3500) || '(testo non disponibile: usa il titolo)',
      ].join('\n'),
    ),
  ].join('\n');

  const response = await callAi({
    system: MATERIAL_ANALYSIS_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 4000,
    temperature: 0.2,
  });

  if (!response.ok) {
    await supabase
      .from('material_analyses')
      .update({ status: 'fallita', error_message: response.error ?? 'Errore sconosciuto' })
      .eq('id', analysisId)
      .eq('user_id', user.id);
    return { ok: false, message: response.error ?? 'Il servizio AI non ha risposto.' };
  }

  const analyzed = extractJsonArray<AnalyzedSegment>(response.text);
  const perId = new Map(analyzed.filter((item) => item.id).map((item) => [item.id, item]));

  let questions = 0;
  let exercises = 0;
  let flashcards = 0;
  const today = todayIso();

  for (const segment of segments) {
    const risultato = perId.get(segment.id);

    const difficulty =
      risultato?.difficulty && risultato.difficulty >= 1 && risultato.difficulty <= 5
        ? Math.round(risultato.difficulty)
        : null;
    const concepts = (risultato?.concepts ?? [])
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      .slice(0, 12)
      .map((c) => c.trim().slice(0, 120));

    await supabase
      .from('resource_segments')
      .update({ content_difficulty: difficulty, analyzed_at: new Date().toISOString() })
      .eq('id', segment.id)
      .eq('user_id', user.id);

    if (segment.topic_id) {
      await supabase
        .from('syllabus_topics')
        .update({
          content_difficulty: difficulty,
          key_concepts: concepts,
          analyzed_at: new Date().toISOString(),
          // La difficoltà misurata sul contenuto sostituisce quella di default.
          ...(difficulty ? { difficulty } : {}),
        })
        .eq('id', segment.topic_id)
        .eq('user_id', user.id);
    }

    // --- contenuti generati, tutti da verificare ---
    const domande = (risultato?.questions ?? []).filter((q) => q.prompt).slice(0, 3);
    if (domande.length > 0) {
      const { error } = await supabase.from('questions').insert(
        domande.map((q) => ({
          user_id: user.id,
          exam_id: analysis.exam_id,
          topic_id: segment.topic_id,
          type: 'aperta' as const,
          prompt: String(q.prompt).slice(0, 4000),
          answer: q.answer ? String(q.answer).slice(0, 8000) : null,
          evaluation_criteria: q.criteria ? String(q.criteria).slice(0, 4000) : null,
          difficulty: difficulty ?? 3,
          source: 'ai' as const,
          needs_verification: true,
        })),
      );
      if (!error) questions += domande.length;
    }

    const eserciziGenerati = (risultato?.exercises ?? [])
      .filter((e) => e.title && e.statement)
      .slice(0, 3);
    if (eserciziGenerati.length > 0 && exam?.has_exercises !== false) {
      const { error } = await supabase.from('exercises').insert(
        eserciziGenerati.map((e) => ({
          user_id: user.id,
          exam_id: analysis.exam_id,
          topic_id: segment.topic_id,
          title: String(e.title).slice(0, 200),
          statement: String(e.statement).slice(0, 8000),
          solution: e.solution ? String(e.solution).slice(0, 8000) : null,
          difficulty: difficulty ?? 3,
          estimated_minutes: Math.min(600, Math.max(1, Number(e.minutes ?? 15))),
          source: 'ai' as const,
          needs_verification: true,
        })),
      );
      if (!error) exercises += eserciziGenerati.length;
    }

    const carte = (risultato?.flashcards ?? []).filter((f) => f.front && f.back).slice(0, 4);
    if (carte.length > 0) {
      const { error } = await supabase.from('flashcards').insert(
        carte.map((f) => ({
          user_id: user.id,
          exam_id: analysis.exam_id,
          topic_id: segment.topic_id,
          front: String(f.front).slice(0, 2000),
          back: String(f.back).slice(0, 4000),
          difficulty: difficulty ?? 3,
          due_date: today,
          source: 'ai' as const,
          needs_verification: true,
        })),
      );
      if (!error) flashcards += carte.length;
    }
  }

  const done = analysis.segments_done + segments.length;

  await supabase
    .from('material_analyses')
    .update({
      segments_done: done,
      questions_created: analysis.questions_created + questions,
      exercises_created: analysis.exercises_created + exercises,
      flashcards_created: analysis.flashcards_created + flashcards,
    })
    .eq('id', analysisId)
    .eq('user_id', user.id);

  return {
    ok: true,
    analysisId,
    done,
    total: analysis.segments_total,
    finished: false,
    created: { questions, exercises, flashcards },
    message: `Analizzati ${done} blocchi su ${analysis.segments_total}.`,
  };
}

/** Interrompe l'analisi in corso senza perdere ciò che è già stato fatto. */
export async function cancelMaterialAnalysisAction(analysisId: string): Promise<AnalysisProgress> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('material_analyses')
    .update({ status: 'annullata', completed_at: new Date().toISOString() })
    .eq('id', analysisId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile annullare l’analisi.' };
  return { ok: true, message: 'Analisi interrotta. I blocchi già analizzati restano validi.' };
}

/** Stato dell'ultima analisi di un esame. */
export async function getAnalysisStatusAction(examId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from('material_analyses')
    .select('*')
    .eq('user_id', user.id)
    .eq('exam_id', examId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as {
    id: string;
    status: string;
    segments_done: number;
    segments_total: number;
    questions_created: number;
    exercises_created: number;
    flashcards_created: number;
    summary: string | null;
  } | null;
}
