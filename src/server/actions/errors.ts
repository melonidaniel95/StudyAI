'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { errorLogSchema } from '@/lib/validation/schemas';
import { addDaysIso, todayIso } from '@/lib/domain/dates';

export interface ErrorActionResult {
  ok: boolean;
  message: string;
}

export async function createErrorAction(formData: FormData): Promise<ErrorActionResult> {
  const user = await requireUser();
  const parsed = errorLogSchema.safeParse({
    examId: formData.get('examId'),
    topicId: formData.get('topicId') ?? '',
    questionText: formData.get('questionText'),
    givenAnswer: formData.get('givenAnswer') ?? '',
    correctAnswer: formData.get('correctAnswer') ?? '',
    errorType: formData.get('errorType') ?? 'concettuale',
    cause: formData.get('cause') ?? '',
    correction: formData.get('correction') ?? '',
    occurredOn: formData.get('occurredOn') ?? todayIso(),
    nextAttemptDate: formData.get('nextAttemptDate') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('error_log').insert({
    user_id: user.id,
    exam_id: parsed.data.examId,
    topic_id: parsed.data.topicId || null,
    source_type: 'manuale',
    question_text: parsed.data.questionText,
    given_answer: parsed.data.givenAnswer || null,
    correct_answer: parsed.data.correctAnswer || null,
    error_type: parsed.data.errorType,
    cause: parsed.data.cause || null,
    correction: parsed.data.correction || null,
    occurred_on: parsed.data.occurredOn,
    next_attempt_date: parsed.data.nextAttemptDate || addDaysIso(parsed.data.occurredOn, 2),
  });

  if (error) return { ok: false, message: 'Non è stato possibile salvare l’errore.' };

  revalidatePath('/errori');
  revalidatePath('/esami');
  return { ok: true, message: 'Errore registrato nel quaderno.' };
}

/**
 * Registra un nuovo tentativo su un errore.
 * Se l'errore si ripete, la priorità dell'argomento collegato aumenta.
 */
export async function retryErrorAction(
  errorId: string,
  outcome: 'non_risolto' | 'parziale' | 'risolto',
): Promise<ErrorActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('error_log')
    .select('id, repetitions, topic_id, exam_id')
    .eq('id', errorId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Errore non trovato.' };
  const row = data as { id: string; repetitions: number; topic_id: string | null; exam_id: string };

  const today = todayIso();
  const repetitions = row.repetitions + 1;
  const nextAttempt =
    outcome === 'risolto' ? null : addDaysIso(today, outcome === 'parziale' ? 3 : 1);

  await supabase
    .from('error_log')
    .update({
      repetitions,
      last_outcome: outcome,
      resolved: outcome === 'risolto',
      next_attempt_date: nextAttempt,
    })
    .eq('id', errorId)
    .eq('user_id', user.id);

  // Errori ricorrenti: l'argomento torna "da ripassare" e il ripasso viene anticipato.
  if (outcome !== 'risolto' && repetitions >= 2 && row.topic_id) {
    await supabase
      .from('syllabus_topics')
      .update({ status: 'da_ripassare' })
      .eq('id', row.topic_id)
      .eq('user_id', user.id);

    await supabase.from('review_schedules').upsert(
      {
        user_id: user.id,
        topic_id: row.topic_id,
        exam_id: row.exam_id,
        due_date: addDaysIso(today, 1),
        interval_days: 1,
        status: 'pianificato',
        reason: `Ripasso anticipato: lo stesso errore si è ripetuto ${repetitions} volte.`,
      },
      { onConflict: 'topic_id' },
    );
  }

  revalidatePath('/errori');
  revalidatePath('/ripassi');
  revalidatePath('/esami');

  return {
    ok: true,
    message:
      outcome === 'risolto'
        ? 'Errore risolto e archiviato.'
        : repetitions >= 2
          ? 'Registrato. L’argomento è stato rimesso tra i ripassi ravvicinati.'
          : 'Registrato: riproveremo tra poco.',
  };
}

export async function updateErrorAction(
  errorId: string,
  values: { cause?: string; correction?: string; errorType?: string },
): Promise<ErrorActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (values.cause !== undefined) update.cause = values.cause || null;
  if (values.correction !== undefined) update.correction = values.correction || null;
  if (values.errorType !== undefined) update.error_type = values.errorType;

  const { error } = await supabase
    .from('error_log')
    .update(update)
    .eq('id', errorId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile aggiornare l’errore.' };

  revalidatePath('/errori');
  return { ok: true, message: 'Errore aggiornato.' };
}

export async function deleteErrorAction(errorId: string): Promise<ErrorActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('error_log')
    .delete()
    .eq('id', errorId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare l’errore.' };
  revalidatePath('/errori');
  return { ok: true, message: 'Voce eliminata.' };
}
