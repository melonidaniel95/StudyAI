'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { callAi, dailyLimit, extractJsonArray, isAiConfigured } from '@/lib/ai/provider';
import {
  EVALUATE_SYSTEM,
  EXERCISES_SYSTEM,
  EXPLAIN_SYSTEM,
  FLASHCARDS_SYSTEM,
  GAPS_SYSTEM,
  MOCK_SYSTEM,
  QUESTIONS_SYSTEM,
  QUIZ_SYSTEM,
  SYLLABUS_SYSTEM,
  ERROR_SUMMARY_SYSTEM,
} from '@/lib/ai/prompts';
import { todayIso } from '@/lib/domain/dates';

export interface AiActionResult {
  ok: boolean;
  text?: string;
  message?: string;
  /** Elementi generati, ancora da confermare dall'utente. */
  items?: unknown[];
  remaining?: number;
}

/** Verifica e incrementa il contatore giornaliero di richieste AI. */
async function consumeQuota(userId: string): Promise<{ ok: boolean; remaining: number; message?: string }> {
  const supabase = await createClient();
  const day = todayIso();

  const { data } = await supabase
    .from('ai_usage')
    .select('request_count')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();

  const used = (data as { request_count: number } | null)?.request_count ?? 0;
  const limit = dailyLimit();

  if (used >= limit) {
    return {
      ok: false,
      remaining: 0,
      message: `Hai raggiunto il limite di ${limit} richieste AI per oggi. Il contatore si azzera domani.`,
    };
  }

  await supabase
    .from('ai_usage')
    .upsert({ user_id: userId, day, request_count: used + 1 }, { onConflict: 'user_id,day' });

  return { ok: true, remaining: limit - used - 1 };
}

/** L'assistente è attivo solo se configurato e abilitato nel profilo. */
async function ensureEnabled(userId: string): Promise<string | null> {
  if (!isAiConfigured()) {
    return 'Assistente AI non configurato: imposta AI_PROVIDER e AI_API_KEY. Tutte le altre funzioni restano disponibili.';
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('ai_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (!(data as { ai_enabled: boolean } | null)?.ai_enabled) {
    return 'L’assistente AI è disattivato. Puoi attivarlo dalle impostazioni: nessun dato viene inviato senza il tuo consenso.';
  }
  return null;
}

async function run(
  userId: string,
  system: string,
  prompt: string,
  maxTokens = 1200,
): Promise<AiActionResult> {
  const blocked = await ensureEnabled(userId);
  if (blocked) return { ok: false, message: blocked };

  const quota = await consumeQuota(userId);
  if (!quota.ok) return { ok: false, message: quota.message };

  const response = await callAi({
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
  });

  if (!response.ok) return { ok: false, message: response.error };
  return { ok: true, text: response.text, remaining: quota.remaining };
}

// --------------------------------------------------------------- spiegazioni

export async function explainConceptAction(topic: string, context?: string): Promise<AiActionResult> {
  const user = await requireUser();
  if (topic.trim().length < 2) return { ok: false, message: 'Indica l’argomento da spiegare.' };
  return run(
    user.id,
    EXPLAIN_SYSTEM,
    `Argomento: ${topic}\n${context ? `Contesto dello studente: ${context}` : ''}`,
  );
}

export async function findGapsAction(summary: string): Promise<AiActionResult> {
  const user = await requireUser();
  return run(user.id, GAPS_SYSTEM, summary, 800);
}

export async function summarizeErrorsAction(errors: string): Promise<AiActionResult> {
  const user = await requireUser();
  if (errors.trim().length < 5) return { ok: false, message: 'Non ci sono errori da riassumere.' };
  return run(user.id, ERROR_SUMMARY_SYSTEM, errors, 900);
}

export async function createMockDraftAction(
  examName: string,
  topics: string[],
): Promise<AiActionResult> {
  const user = await requireUser();
  return run(
    user.id,
    MOCK_SYSTEM,
    `Esame: ${examName}\nArgomenti: ${topics.join(', ')}\nProponi una traccia di simulazione.`,
    1400,
  );
}

// ------------------------------------------------------------ generazione

interface GeneratedQuestion {
  prompt: string;
  answer?: string;
  criteria?: string;
  difficulty?: number;
}

/**
 * Genera domande aperte. NON scrive nulla nel database:
 * l'utente le rivede e conferma dalla pagina dell'assistente.
 */
export async function generateQuestionsAction(
  topic: string,
  count = 5,
): Promise<AiActionResult> {
  const user = await requireUser();
  const result = await run(
    user.id,
    QUESTIONS_SYSTEM,
    `Argomento: ${topic}. Genera ${Math.min(10, Math.max(1, count))} domande d'esame.`,
  );
  if (!result.ok) return result;
  return { ...result, items: extractJsonArray<GeneratedQuestion>(result.text ?? '') };
}

export async function generateFlashcardsAction(topic: string, count = 8): Promise<AiActionResult> {
  const user = await requireUser();
  const result = await run(
    user.id,
    FLASHCARDS_SYSTEM,
    `Argomento: ${topic}. Genera ${Math.min(15, Math.max(1, count))} flashcard.`,
  );
  if (!result.ok) return result;
  return { ...result, items: extractJsonArray(result.text ?? '') };
}

export async function generateExercisesAction(topic: string, count = 3): Promise<AiActionResult> {
  const user = await requireUser();
  const result = await run(
    user.id,
    EXERCISES_SYSTEM,
    `Argomento: ${topic}. Genera ${Math.min(6, Math.max(1, count))} esercizi progressivi.`,
    1800,
  );
  if (!result.ok) return result;
  return { ...result, items: extractJsonArray(result.text ?? '') };
}

export async function analyzeSyllabusAction(text: string): Promise<AiActionResult> {
  const user = await requireUser();
  if (text.trim().length < 20) {
    return { ok: false, message: 'Incolla un testo più lungo da analizzare.' };
  }
  const result = await run(
    user.id,
    SYLLABUS_SYSTEM,
    `Testo da analizzare:\n${text.slice(0, 12000)}`,
    1800,
  );
  if (!result.ok) return result;
  return { ...result, items: extractJsonArray(result.text ?? '') };
}

/**
 * Salva nel database i contenuti generati, dopo la conferma esplicita
 * dell'utente. Tutto viene marcato come «da verificare».
 */
export async function saveGeneratedQuestionsAction(
  examId: string,
  topicId: string | null,
  items: GeneratedQuestion[],
): Promise<AiActionResult> {
  const user = await requireUser();
  if (items.length === 0) return { ok: false, message: 'Nessun contenuto da salvare.' };

  const supabase = await createClient();
  const rows = items.slice(0, 20).map((item) => ({
    user_id: user.id,
    exam_id: examId,
    topic_id: topicId,
    type: 'aperta' as const,
    prompt: String(item.prompt ?? '').slice(0, 4000),
    answer: item.answer ? String(item.answer).slice(0, 8000) : null,
    evaluation_criteria: item.criteria ? String(item.criteria).slice(0, 4000) : null,
    difficulty: Math.min(5, Math.max(1, Number(item.difficulty ?? 3))),
    source: 'ai' as const,
    needs_verification: true,
  }));

  const { error } = await supabase.from('questions').insert(rows);
  if (error) return { ok: false, message: 'Non è stato possibile salvare le domande.' };

  revalidatePath('/domande');
  return { ok: true, message: `${rows.length} domande salvate e marcate come «Da verificare».` };
}

export async function saveGeneratedFlashcardsAction(
  examId: string,
  topicId: string | null,
  items: Array<{ front?: string; back?: string; hint?: string }>,
): Promise<AiActionResult> {
  const user = await requireUser();
  const valid = items.filter((item) => item.front && item.back).slice(0, 30);
  if (valid.length === 0) return { ok: false, message: 'Nessun contenuto valido da salvare.' };

  const supabase = await createClient();
  const { error } = await supabase.from('flashcards').insert(
    valid.map((item) => ({
      user_id: user.id,
      exam_id: examId,
      topic_id: topicId,
      front: String(item.front).slice(0, 2000),
      back: String(item.back).slice(0, 4000),
      hint: item.hint ? String(item.hint).slice(0, 500) : null,
      due_date: todayIso(),
      source: 'ai' as const,
      needs_verification: true,
    })),
  );

  if (error) return { ok: false, message: 'Non è stato possibile salvare le flashcard.' };

  revalidatePath('/domande');
  return { ok: true, message: `${valid.length} flashcard salvate e marcate come «Da verificare».` };
}

export async function saveGeneratedExercisesAction(
  examId: string,
  topicId: string | null,
  items: Array<{ title?: string; statement?: string; solution?: string; difficulty?: number; minutes?: number }>,
): Promise<AiActionResult> {
  const user = await requireUser();
  const valid = items.filter((item) => item.title && item.statement).slice(0, 20);
  if (valid.length === 0) return { ok: false, message: 'Nessun contenuto valido da salvare.' };

  const supabase = await createClient();
  const { error } = await supabase.from('exercises').insert(
    valid.map((item) => ({
      user_id: user.id,
      exam_id: examId,
      topic_id: topicId,
      title: String(item.title).slice(0, 200),
      statement: String(item.statement).slice(0, 8000),
      solution: item.solution ? String(item.solution).slice(0, 8000) : null,
      difficulty: Math.min(5, Math.max(1, Number(item.difficulty ?? 3))),
      estimated_minutes: Math.min(600, Math.max(1, Number(item.minutes ?? 15))),
      source: 'ai' as const,
      needs_verification: true,
    })),
  );

  if (error) return { ok: false, message: 'Non è stato possibile salvare gli esercizi.' };

  revalidatePath('/esercizi');
  return { ok: true, message: `${valid.length} esercizi salvati e marcati come «Da verificare».` };
}

// ------------------------------------------------------------- Interrogami

export async function askNextQuestionAction(
  topic: string,
  difficulty: number,
  previous: string[],
): Promise<AiActionResult> {
  const user = await requireUser();
  const prompt = `Argomento: ${topic}
Livello di difficoltà richiesto: ${difficulty}/5.
${previous.length > 0 ? `Domande già poste (non ripeterle):\n- ${previous.join('\n- ')}` : ''}
Fai la prossima domanda.`;
  return run(user.id, QUIZ_SYSTEM, prompt, 400);
}

export async function evaluateAnswerAction(
  question: string,
  answer: string,
  criteria?: string,
): Promise<AiActionResult> {
  const user = await requireUser();
  if (answer.trim().length === 0) {
    return { ok: false, message: 'Scrivi una risposta prima di chiedere la valutazione.' };
  }
  const prompt = `Domanda: ${question}
Risposta dello studente: ${answer}
${criteria ? `Criteri di valutazione: ${criteria}` : 'Criteri: correttezza concettuale, completezza, uso corretto delle formule.'}`;
  return run(user.id, EVALUATE_SYSTEM, prompt, 900);
}

/**
 * Aggiorna la padronanza di un argomento SOLO dopo conferma esplicita
 * dell'utente al termine di un'interrogazione.
 */
export async function confirmQuizMasteryAction(
  topicId: string,
  score: number,
): Promise<AiActionResult> {
  const user = await requireUser();
  if (score < 0 || score > 5) return { ok: false, message: 'Punteggio non valido.' };

  const supabase = await createClient();
  const { data } = await supabase
    .from('syllabus_topics')
    .select('id, mastery')
    .eq('id', topicId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Argomento non trovato.' };
  const topic = data as { id: string; mastery: number };
  const delta = (score / 5 - 0.4) * 0.15;
  const mastery = Math.min(1, Math.max(0, Number((Number(topic.mastery) + delta).toFixed(3))));

  await supabase
    .from('syllabus_topics')
    .update({ mastery })
    .eq('id', topicId)
    .eq('user_id', user.id);

  revalidatePath('/esami');
  return { ok: true, message: `Padronanza aggiornata al ${Math.round(mastery * 100)}%.` };
}

/** Stato dell'assistente, usato dalla UI per mostrare le istruzioni giuste. */
export async function getAiStatusAction(): Promise<{
  configured: boolean;
  enabled: boolean;
  limit: number;
  used: number;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from('profiles').select('ai_enabled').eq('id', user.id).maybeSingle(),
    supabase
      .from('ai_usage')
      .select('request_count')
      .eq('user_id', user.id)
      .eq('day', todayIso())
      .maybeSingle(),
  ]);

  return {
    configured: isAiConfigured(),
    enabled: Boolean((profile as { ai_enabled: boolean } | null)?.ai_enabled),
    limit: dailyLimit(),
    used: (usage as { request_count: number } | null)?.request_count ?? 0,
  };
}
