'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import {
  exerciseAttemptSchema,
  exerciseSchema,
  flashcardSchema,
  questionSchema,
} from '@/lib/validation/schemas';
import { applyMasteryDelta, computeNextReview } from '@/lib/domain/spaced-repetition';
import { todayIso } from '@/lib/domain/dates';
import type { RecallGrade } from '@/lib/domain/types';

export interface PracticeActionResult {
  ok: boolean;
  message: string;
  id?: string;
  explanation?: string;
}

const PATHS = ['/domande', '/esercizi', '/oggi', '/dashboard', '/esami', '/statistiche'];

function revalidateAll() {
  for (const path of PATHS) revalidatePath(path);
}

// ------------------------------------------------------------------ domande

export async function createQuestionAction(formData: FormData): Promise<PracticeActionResult> {
  const user = await requireUser();
  const parsed = questionSchema.safeParse({
    examId: formData.get('examId'),
    topicId: formData.get('topicId') ?? '',
    type: formData.get('type') ?? 'aperta',
    prompt: formData.get('prompt'),
    answer: formData.get('answer') ?? '',
    evaluationCriteria: formData.get('evaluationCriteria') ?? '',
    difficulty: formData.get('difficulty') ?? 3,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('questions')
    .insert({
      user_id: user.id,
      exam_id: parsed.data.examId,
      topic_id: parsed.data.topicId || null,
      type: parsed.data.type,
      prompt: parsed.data.prompt,
      answer: parsed.data.answer || null,
      evaluation_criteria: parsed.data.evaluationCriteria || null,
      difficulty: parsed.data.difficulty,
      source: 'manuale',
    })
    .select('id')
    .single();

  if (error) return { ok: false, message: 'Non è stato possibile creare la domanda.' };

  revalidateAll();
  return { ok: true, message: 'Domanda creata.', id: (data as { id: string }).id };
}

export async function deleteQuestionAction(questionId: string): Promise<PracticeActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('id', questionId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare la domanda.' };
  revalidateAll();
  return { ok: true, message: 'Domanda eliminata.' };
}

/** Registra il tentativo su una domanda aperta o a scelta multipla. */
export async function answerQuestionAction(
  questionId: string,
  values: { givenAnswer: string; selfScore: number; isCorrect: boolean },
): Promise<PracticeActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('questions')
    .select('id, topic_id, times_asked, times_correct')
    .eq('id', questionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Domanda non trovata.' };
  const question = data as {
    id: string;
    topic_id: string | null;
    times_asked: number;
    times_correct: number;
  };

  const score = Math.min(5, Math.max(0, Math.round(values.selfScore)));

  await supabase.from('question_attempts').insert({
    user_id: user.id,
    question_id: questionId,
    topic_id: question.topic_id,
    given_answer: values.givenAnswer || null,
    self_score: score,
    is_correct: values.isCorrect,
  });

  await supabase
    .from('questions')
    .update({
      times_asked: question.times_asked + 1,
      times_correct: question.times_correct + (values.isCorrect ? 1 : 0),
      last_asked_at: new Date().toISOString(),
    })
    .eq('id', questionId)
    .eq('user_id', user.id);

  // Il recupero attivo aggiorna la padronanza dell'argomento.
  if (question.topic_id) {
    const { data: topicRow } = await supabase
      .from('syllabus_topics')
      .select('id, mastery')
      .eq('id', question.topic_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (topicRow) {
      const topic = topicRow as { id: string; mastery: number };
      const delta = (score / 5 - 0.4) * 0.12;
      await supabase
        .from('syllabus_topics')
        .update({ mastery: applyMasteryDelta(Number(topic.mastery), delta) })
        .eq('id', topic.id)
        .eq('user_id', user.id);
    }
  }

  revalidateAll();
  return { ok: true, message: values.isCorrect ? 'Risposta registrata.' : 'Registrato: da rivedere.' };
}

// ---------------------------------------------------------------- flashcard

export async function createFlashcardAction(formData: FormData): Promise<PracticeActionResult> {
  const user = await requireUser();
  const parsed = flashcardSchema.safeParse({
    examId: formData.get('examId'),
    topicId: formData.get('topicId') ?? '',
    front: formData.get('front'),
    back: formData.get('back'),
    hint: formData.get('hint') ?? '',
    difficulty: formData.get('difficulty') ?? 3,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('flashcards').insert({
    user_id: user.id,
    exam_id: parsed.data.examId,
    topic_id: parsed.data.topicId || null,
    front: parsed.data.front,
    back: parsed.data.back,
    hint: parsed.data.hint || null,
    difficulty: parsed.data.difficulty,
    due_date: todayIso(),
  });

  if (error) return { ok: false, message: 'Non è stato possibile creare la flashcard.' };

  revalidateAll();
  return { ok: true, message: 'Flashcard creata.' };
}

export async function deleteFlashcardAction(cardId: string): Promise<PracticeActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from('flashcards').delete().eq('id', cardId).eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare la flashcard.' };
  revalidateAll();
  return { ok: true, message: 'Flashcard eliminata.' };
}

/** Valuta una flashcard con lo stesso algoritmo dei ripassi. */
export async function reviewFlashcardAction(
  cardId: string,
  grade: number,
): Promise<PracticeActionResult> {
  const user = await requireUser();
  if (grade < 0 || grade > 4) return { ok: false, message: 'Valutazione non valida.' };

  const supabase = await createClient();
  const { data } = await supabase
    .from('flashcards')
    .select('*')
    .eq('id', cardId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Flashcard non trovata.' };
  const card = data as {
    id: string;
    interval_days: number;
    ease: number;
    repetition: number;
    times_reviewed: number;
    times_correct: number;
    topic_id: string | null;
  };

  const outcome = computeNextReview(
    { repetition: card.repetition, intervalDays: card.interval_days, ease: Number(card.ease) },
    grade as RecallGrade,
    todayIso(),
  );

  await supabase
    .from('flashcards')
    .update({
      interval_days: outcome.intervalDays,
      ease: outcome.ease,
      repetition: outcome.repetition,
      due_date: outcome.dueDate,
      times_reviewed: card.times_reviewed + 1,
      times_correct: card.times_correct + (grade >= 3 ? 1 : 0),
    })
    .eq('id', cardId)
    .eq('user_id', user.id);

  if (card.topic_id) {
    const { data: topicRow } = await supabase
      .from('syllabus_topics')
      .select('id, mastery')
      .eq('id', card.topic_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (topicRow) {
      const topic = topicRow as { id: string; mastery: number };
      await supabase
        .from('syllabus_topics')
        .update({ mastery: applyMasteryDelta(Number(topic.mastery), outcome.masteryDelta * 0.4) })
        .eq('id', topic.id)
        .eq('user_id', user.id);
    }
  }

  revalidateAll();
  return { ok: true, message: 'Flashcard aggiornata.', explanation: outcome.explanation };
}

// ---------------------------------------------------------------- esercizi

export async function createExerciseAction(formData: FormData): Promise<PracticeActionResult> {
  const user = await requireUser();
  const parsed = exerciseSchema.safeParse({
    examId: formData.get('examId'),
    topicId: formData.get('topicId') ?? '',
    title: formData.get('title'),
    statement: formData.get('statement'),
    solution: formData.get('solution') ?? '',
    difficulty: formData.get('difficulty') ?? 3,
    estimatedMinutes: formData.get('estimatedMinutes') ?? 15,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('exercises').insert({
    user_id: user.id,
    exam_id: parsed.data.examId,
    topic_id: parsed.data.topicId || null,
    title: parsed.data.title,
    statement: parsed.data.statement,
    solution: parsed.data.solution || null,
    difficulty: parsed.data.difficulty,
    estimated_minutes: parsed.data.estimatedMinutes,
  });

  if (error) return { ok: false, message: 'Non è stato possibile creare l’esercizio.' };

  revalidateAll();
  return { ok: true, message: 'Esercizio creato.' };
}

export async function deleteExerciseAction(exerciseId: string): Promise<PracticeActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('exercises')
    .delete()
    .eq('id', exerciseId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare l’esercizio.' };
  revalidateAll();
  return { ok: true, message: 'Esercizio eliminato.' };
}

/**
 * Registra il tentativo su un esercizio. Se è sbagliato viene creata
 * automaticamente una voce nel quaderno degli errori.
 */
export async function recordExerciseAttemptAction(
  formData: FormData,
): Promise<PracticeActionResult> {
  const user = await requireUser();
  const parsed = exerciseAttemptSchema.safeParse({
    exerciseId: formData.get('exerciseId'),
    isCorrect: formData.get('isCorrect') === 'true',
    selfScore: formData.get('selfScore') ?? 3,
    minutesUsed: formData.get('minutesUsed') || undefined,
    answer: formData.get('answer') ?? '',
    errorType: formData.get('errorType') || undefined,
    notes: formData.get('notes') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('exercises')
    .select('id, exam_id, topic_id, title, statement, solution')
    .eq('id', parsed.data.exerciseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Esercizio non trovato.' };
  const exercise = data as {
    id: string;
    exam_id: string;
    topic_id: string | null;
    title: string;
    statement: string;
    solution: string | null;
  };

  await supabase.from('exercise_attempts').insert({
    user_id: user.id,
    exercise_id: exercise.id,
    topic_id: exercise.topic_id,
    minutes_used: parsed.data.minutesUsed ?? null,
    is_correct: parsed.data.isCorrect,
    self_score: parsed.data.selfScore,
    answer: parsed.data.answer || null,
    error_type: parsed.data.errorType ?? null,
    notes: parsed.data.notes || null,
  });

  if (exercise.topic_id) {
    const { data: topicRow } = await supabase
      .from('syllabus_topics')
      .select('id, mastery')
      .eq('id', exercise.topic_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (topicRow) {
      const topic = topicRow as { id: string; mastery: number };
      const delta = parsed.data.isCorrect ? 0.08 : -0.06;
      await supabase
        .from('syllabus_topics')
        .update({ mastery: applyMasteryDelta(Number(topic.mastery), delta) })
        .eq('id', topic.id)
        .eq('user_id', user.id);
    }
  }

  if (!parsed.data.isCorrect) {
    await supabase.from('error_log').insert({
      user_id: user.id,
      exam_id: exercise.exam_id,
      topic_id: exercise.topic_id,
      source_type: 'esercizio',
      source_id: exercise.id,
      question_text: `${exercise.title}: ${exercise.statement.slice(0, 500)}`,
      given_answer: parsed.data.answer || null,
      correct_answer: exercise.solution,
      error_type: parsed.data.errorType ?? 'concettuale',
      notes: parsed.data.notes || null,
      occurred_on: todayIso(),
    });
  }

  revalidateAll();
  revalidatePath('/errori');

  return {
    ok: true,
    message: parsed.data.isCorrect
      ? 'Esercizio registrato come corretto.'
      : 'Registrato. L’errore è stato aggiunto al quaderno per essere rifatto.',
  };
}
