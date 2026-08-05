'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { reviewGradeSchema } from '@/lib/validation/schemas';
import {
  applyMasteryDelta,
  capReviewToExamDate,
  computeNextReview,
} from '@/lib/domain/spaced-repetition';
import { todayIso } from '@/lib/domain/dates';
import { getProfile } from '@/server/data';
import type { RecallGrade, TopicStatus } from '@/lib/domain/types';

export interface ReviewActionResult {
  ok: boolean;
  message: string;
  explanation?: string;
  nextDate?: string;
}

/**
 * Registra l'esito di un ripasso e calcola la data successiva.
 * La spiegazione viene salvata e mostrata all'utente.
 */
export async function gradeReviewAction(
  reviewId: string,
  grade: number,
): Promise<ReviewActionResult> {
  const user = await requireUser();
  const parsed = reviewGradeSchema.safeParse({ reviewId, grade });
  if (!parsed.success) return { ok: false, message: 'Valutazione non valida.' };

  const supabase = await createClient();
  const profile = await getProfile(user.id);
  const today = todayIso(profile?.timezone ?? 'Europe/Rome');

  const { data } = await supabase
    .from('review_schedules')
    .select('*')
    .eq('id', parsed.data.reviewId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Ripasso non trovato.' };
  const review = data as {
    id: string;
    topic_id: string;
    exam_id: string;
    interval_days: number;
    repetition: number;
    ease: number;
  };

  const { data: examSessionRow } = await supabase
    .from('exam_sessions')
    .select('exam_date')
    .eq('user_id', user.id)
    .eq('exam_id', review.exam_id)
    .eq('role', 'principale')
    .maybeSingle();

  const outcome = capReviewToExamDate(
    computeNextReview(
      {
        repetition: review.repetition,
        intervalDays: review.interval_days,
        ease: Number(review.ease),
      },
      parsed.data.grade as RecallGrade,
      today,
    ),
    (examSessionRow as { exam_date: string } | null)?.exam_date ?? null,
  );

  await supabase
    .from('review_schedules')
    .update({
      due_date: outcome.dueDate,
      interval_days: outcome.intervalDays,
      repetition: outcome.repetition,
      ease: outcome.ease,
      last_grade: parsed.data.grade,
      last_reviewed_at: new Date().toISOString(),
      status: 'pianificato',
      reason: outcome.explanation,
    })
    .eq('id', review.id)
    .eq('user_id', user.id);

  await supabase.from('review_logs').insert({
    user_id: user.id,
    review_schedule_id: review.id,
    topic_id: review.topic_id,
    grade: parsed.data.grade,
    previous_interval: review.interval_days,
    new_interval: outcome.intervalDays,
    previous_ease: review.ease,
    new_ease: outcome.ease,
    explanation: outcome.explanation,
  });

  // Aggiornamento della padronanza dell'argomento
  const { data: topicRow } = await supabase
    .from('syllabus_topics')
    .select('id, mastery, status')
    .eq('id', review.topic_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (topicRow) {
    const topic = topicRow as { id: string; mastery: number; status: TopicStatus };
    const newMastery = applyMasteryDelta(Number(topic.mastery), outcome.masteryDelta);
    let status: TopicStatus = topic.status;
    if (parsed.data.grade <= 1) status = 'da_ripassare';
    else if (newMastery >= 0.85) status = 'consolidato';
    else if (status === 'da_ripassare' && parsed.data.grade >= 3) status = 'studiato';

    await supabase
      .from('syllabus_topics')
      .update({ mastery: newMastery, status, last_reviewed_at: new Date().toISOString() })
      .eq('id', topic.id)
      .eq('user_id', user.id);
  }

  for (const path of ['/ripassi', '/oggi', '/dashboard', '/esami', '/statistiche']) {
    revalidatePath(path);
  }

  return {
    ok: true,
    message: 'Ripasso registrato.',
    explanation: outcome.explanation,
    nextDate: outcome.dueDate,
  };
}

/** Rimanda un ripasso senza valutarlo. */
export async function postponeReviewAction(
  reviewId: string,
  days: number,
): Promise<ReviewActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(user.id);
  const today = todayIso(profile?.timezone ?? 'Europe/Rome');
  const safeDays = Math.min(30, Math.max(1, Math.round(days)));

  const nextDate = new Date(`${today}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + safeDays);
  const iso = nextDate.toISOString().slice(0, 10);

  const { error } = await supabase
    .from('review_schedules')
    .update({
      due_date: iso,
      reason: `Rimandato manualmente di ${safeDays} ${safeDays === 1 ? 'giorno' : 'giorni'}.`,
    })
    .eq('id', reviewId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile rimandare il ripasso.' };

  revalidatePath('/ripassi');
  revalidatePath('/oggi');
  return { ok: true, message: `Ripasso rimandato al ${iso}.`, nextDate: iso };
}

/** Crea manualmente un ripasso per un argomento. */
export async function createReviewAction(
  topicId: string,
  days = 1,
): Promise<ReviewActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(user.id);
  const today = todayIso(profile?.timezone ?? 'Europe/Rome');

  const { data: topicRow } = await supabase
    .from('syllabus_topics')
    .select('id, exam_id')
    .eq('id', topicId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!topicRow) return { ok: false, message: 'Argomento non trovato.' };

  const due = new Date(`${today}T00:00:00`);
  due.setDate(due.getDate() + Math.max(0, days));
  const iso = due.toISOString().slice(0, 10);

  const { error } = await supabase.from('review_schedules').upsert(
    {
      user_id: user.id,
      topic_id: topicId,
      exam_id: (topicRow as { exam_id: string }).exam_id,
      due_date: iso,
      interval_days: Math.max(1, days),
      status: 'pianificato',
      reason: 'Ripasso creato manualmente.',
    },
    { onConflict: 'topic_id' },
  );

  if (error) return { ok: false, message: 'Non è stato possibile creare il ripasso.' };

  revalidatePath('/ripassi');
  return { ok: true, message: `Ripasso previsto per il ${iso}.`, nextDate: iso };
}
