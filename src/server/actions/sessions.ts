'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { sessionCompletionSchema } from '@/lib/validation/schemas';
import { scheduleFirstReview, capReviewToExamDate, applyMasteryDelta } from '@/lib/domain/spaced-repetition';
import { todayIso } from '@/lib/domain/dates';
import { getProfile } from '@/server/data';
import type { TopicStatus } from '@/lib/domain/types';

export interface SessionActionResult {
  ok: boolean;
  message: string;
  sessionId?: string;
  reviewExplanation?: string;
}

const PATHS = ['/oggi', '/dashboard', '/piano', '/ripassi', '/esami', '/statistiche'];

function revalidateAll() {
  for (const path of PATHS) revalidatePath(path);
}

/** Avvia una sessione di studio a partire da un'attività del piano. */
export async function startSessionAction(taskId: string): Promise<SessionActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('study_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Attività non trovata.' };
  const task = data as {
    id: string;
    exam_id: string;
    topic_id: string | null;
    planned_minutes: number;
    activity_type: string;
  };

  // Se esiste già una sessione aperta per questa attività la si riutilizza.
  const { data: existing } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .is('ended_at', null)
    .maybeSingle();

  if (existing) {
    return { ok: true, message: 'Sessione ripresa.', sessionId: (existing as { id: string }).id };
  }

  const { data: created, error } = await supabase
    .from('study_sessions')
    .insert({
      user_id: user.id,
      task_id: task.id,
      exam_id: task.exam_id,
      topic_id: task.topic_id,
      activity_type: task.activity_type,
      planned_minutes: task.planned_minutes,
    })
    .select('id')
    .single();

  if (error || !created) return { ok: false, message: 'Non è stato possibile avviare la sessione.' };

  await supabase
    .from('study_tasks')
    .update({ status: 'in_corso' })
    .eq('id', taskId)
    .eq('user_id', user.id);

  revalidateAll();
  return { ok: true, message: 'Sessione avviata.', sessionId: (created as { id: string }).id };
}

/** Sessione libera, non collegata al piano. */
export async function startFreeSessionAction(
  examId: string,
  topicId: string | null,
  plannedMinutes: number,
): Promise<SessionActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('study_sessions')
    .insert({
      user_id: user.id,
      exam_id: examId,
      topic_id: topicId,
      planned_minutes: Math.min(480, Math.max(5, Math.round(plannedMinutes))),
      activity_type: 'teoria',
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, message: 'Non è stato possibile avviare la sessione.' };
  revalidateAll();
  return { ok: true, message: 'Sessione avviata.', sessionId: (data as { id: string }).id };
}

/**
 * Conclusione guidata della sessione: aggiorna sessione, argomento,
 * attività del piano e programma il primo ripasso.
 */
export async function completeSessionAction(
  formData: FormData,
): Promise<SessionActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const parsed = sessionCompletionSchema.safeParse({
    sessionId: formData.get('sessionId'),
    effectiveMinutes: formData.get('effectiveMinutes'),
    pauseMinutes: formData.get('pauseMinutes') ?? 0,
    interruptions: formData.get('interruptions') ?? 0,
    comprehension: formData.get('comprehension'),
    recall: formData.get('recall'),
    objectiveCompleted: formData.get('objectiveCompleted') === 'true',
    difficulties: formData.get('difficulties') ?? '',
    doubts: formData.get('doubts') ?? '',
    nextReviewDays: formData.get('nextReviewDays') ?? undefined,
    addError: formData.get('addError') === 'true',
    errorText: formData.get('errorText') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }
  const input = parsed.data;

  const { data: sessionRow } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('id', input.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sessionRow) return { ok: false, message: 'Sessione non trovata.' };
  const session = sessionRow as {
    id: string;
    task_id: string | null;
    exam_id: string;
    topic_id: string | null;
  };

  const profile = await getProfile(user.id);
  const today = todayIso(profile?.timezone ?? 'Europe/Rome');

  await supabase
    .from('study_sessions')
    .update({
      ended_at: new Date().toISOString(),
      effective_minutes: input.effectiveMinutes,
      pause_minutes: input.pauseMinutes,
      interruptions: input.interruptions,
      comprehension: input.comprehension,
      recall: input.recall,
      objective_completed: input.objectiveCompleted,
      difficulties: input.difficulties || null,
      doubts: input.doubts || null,
      next_review_days: input.nextReviewDays ?? null,
    })
    .eq('id', session.id)
    .eq('user_id', user.id);

  if (session.task_id) {
    await supabase
      .from('study_tasks')
      .update({ status: 'completata', actual_minutes: input.effectiveMinutes })
      .eq('id', session.task_id)
      .eq('user_id', user.id);
  }

  let reviewExplanation: string | undefined;

  if (session.topic_id) {
    const { data: topicRow } = await supabase
      .from('syllabus_topics')
      .select('*')
      .eq('id', session.topic_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (topicRow) {
      const topic = topicRow as {
        id: string;
        exam_id: string;
        mastery: number;
        comprehension: number;
        total_study_minutes: number;
        status: TopicStatus;
        first_studied_at: string | null;
      };

      // La padronanza cresce solo se c'è stato un richiamo effettivo,
      // non per il semplice fatto di aver aperto il materiale.
      const recallGain = (input.recall - 1) / 4; // 0..1
      const newMastery = applyMasteryDelta(Number(topic.mastery), (recallGain - 0.35) * 0.25);
      const newComprehension = applyMasteryDelta(
        Number(topic.comprehension),
        ((input.comprehension - 1) / 4 - 0.3) * 0.25,
      );

      let status: TopicStatus = topic.status;
      if (input.objectiveCompleted && input.recall >= 4) status = 'studiato';
      else if (input.objectiveCompleted && input.recall <= 2) status = 'da_ripassare';
      else if (status === 'non_iniziato') status = 'in_corso';
      if (newMastery >= 0.85 && input.recall >= 4) status = 'consolidato';

      await supabase
        .from('syllabus_topics')
        .update({
          mastery: newMastery,
          comprehension: newComprehension,
          status,
          total_study_minutes: topic.total_study_minutes + input.effectiveMinutes,
          last_studied_at: new Date().toISOString(),
          first_studied_at: topic.first_studied_at ?? new Date().toISOString(),
        })
        .eq('id', topic.id)
        .eq('user_id', user.id);

      // Programmazione del primo ripasso (o aggiornamento di quello esistente).
      const { data: examSessionRow } = await supabase
        .from('exam_sessions')
        .select('exam_date')
        .eq('user_id', user.id)
        .eq('exam_id', topic.exam_id)
        .eq('role', 'principale')
        .maybeSingle();

      const examDate = (examSessionRow as { exam_date: string } | null)?.exam_date ?? null;
      const outcome = capReviewToExamDate(
        scheduleFirstReview(today, input.recall, input.nextReviewDays ?? null),
        examDate,
      );
      reviewExplanation = outcome.explanation;

      await supabase.from('review_schedules').upsert(
        {
          user_id: user.id,
          topic_id: topic.id,
          exam_id: topic.exam_id,
          due_date: outcome.dueDate,
          interval_days: outcome.intervalDays,
          repetition: 0,
          ease: outcome.ease,
          status: 'pianificato',
          reason: outcome.explanation,
        },
        { onConflict: 'topic_id' },
      );
    }
  }

  if (input.addError && input.errorText) {
    await supabase.from('error_log').insert({
      user_id: user.id,
      exam_id: session.exam_id,
      topic_id: session.topic_id,
      source_type: 'sessione',
      source_id: session.id,
      question_text: input.errorText,
      error_type: 'concettuale',
      occurred_on: today,
    });
  }

  revalidateAll();

  return {
    ok: true,
    message: 'Sessione registrata.',
    reviewExplanation,
  };
}

/** Registra un'interruzione durante la sessione. */
export async function addInterruptionAction(sessionId: string): Promise<SessionActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from('study_sessions')
    .select('interruptions')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return { ok: false, message: 'Sessione non trovata.' };

  await supabase
    .from('study_sessions')
    .update({ interruptions: (data as { interruptions: number }).interruptions + 1 })
    .eq('id', sessionId)
    .eq('user_id', user.id);

  return { ok: true, message: 'Interruzione registrata.' };
}

/**
 * Sincronizzazione di una sessione registrata offline.
 * `clientUuid` garantisce l'idempotenza: reinviare gli stessi dati non duplica.
 */
export async function syncOfflineSessionAction(payload: {
  clientUuid: string;
  examId: string;
  topicId: string | null;
  taskId: string | null;
  startedAt: string;
  effectiveMinutes: number;
  comprehension: number;
  recall: number;
  objectiveCompleted: boolean;
  notes?: string;
}): Promise<SessionActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('client_uuid', payload.clientUuid)
    .maybeSingle();

  if (existing) return { ok: true, message: 'Sessione già sincronizzata.' };

  const { error } = await supabase.from('study_sessions').insert({
    user_id: user.id,
    client_uuid: payload.clientUuid,
    exam_id: payload.examId,
    topic_id: payload.topicId,
    task_id: payload.taskId,
    started_at: payload.startedAt,
    ended_at: new Date().toISOString(),
    effective_minutes: Math.max(0, Math.min(600, Math.round(payload.effectiveMinutes))),
    comprehension: payload.comprehension,
    recall: payload.recall,
    objective_completed: payload.objectiveCompleted,
    notes: payload.notes ?? null,
  });

  if (error) return { ok: false, message: 'Sincronizzazione non riuscita.' };

  if (payload.taskId) {
    await supabase
      .from('study_tasks')
      .update({ status: 'completata', actual_minutes: Math.round(payload.effectiveMinutes) })
      .eq('id', payload.taskId)
      .eq('user_id', user.id);
  }

  revalidateAll();
  return { ok: true, message: 'Sessione sincronizzata.' };
}
