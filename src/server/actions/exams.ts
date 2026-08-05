'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { examAttemptSchema, examSchema, examSessionSchema } from '@/lib/validation/schemas';

export interface ExamActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

function revalidateExams(examId?: string) {
  revalidatePath('/esami');
  revalidatePath('/dashboard');
  revalidatePath('/calendario');
  if (examId) revalidatePath(`/esami/${examId}`);
}

export async function createExamAction(formData: FormData): Promise<ExamActionResult> {
  const user = await requireUser();
  const parsed = examSchema.safeParse({
    name: formData.get('name'),
    shortName: formData.get('shortName') ?? '',
    cfu: formData.get('cfu') || undefined,
    kind: formData.get('kind'),
    hasExercises: formData.get('hasExercises') === 'true',
    hasOral: formData.get('hasOral') === 'true',
    difficulty: formData.get('difficulty'),
    initialLevel: formData.get('initialLevel'),
    priority: formData.get('priority'),
    estimatedHours: formData.get('estimatedHours') || undefined,
    notes: formData.get('notes') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('exams')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      short_name: parsed.data.shortName || null,
      cfu: parsed.data.cfu ?? null,
      kind: parsed.data.kind,
      has_exercises: parsed.data.hasExercises,
      has_oral: parsed.data.hasOral,
      difficulty: parsed.data.difficulty,
      initial_level: parsed.data.initialLevel,
      priority: parsed.data.priority,
      estimated_hours: parsed.data.estimatedHours ?? null,
      notes: parsed.data.notes || null,
    })
    .select('id')
    .single();

  if (error) {
    return {
      ok: false,
      message: error.code === '23505' ? 'Esiste già un esame con questo nome.' : 'Non è stato possibile creare l’esame.',
    };
  }

  revalidateExams();
  return { ok: true, message: 'Esame creato.', id: (data as { id: string }).id };
}

export async function updateExamAction(examId: string, formData: FormData): Promise<ExamActionResult> {
  const user = await requireUser();
  const parsed = examSchema.safeParse({
    name: formData.get('name'),
    shortName: formData.get('shortName') ?? '',
    cfu: formData.get('cfu') || undefined,
    kind: formData.get('kind'),
    hasExercises: formData.get('hasExercises') === 'true',
    hasOral: formData.get('hasOral') === 'true',
    difficulty: formData.get('difficulty'),
    initialLevel: formData.get('initialLevel'),
    priority: formData.get('priority'),
    estimatedHours: formData.get('estimatedHours') || undefined,
    notes: formData.get('notes') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('exams')
    .update({
      name: parsed.data.name,
      short_name: parsed.data.shortName || null,
      cfu: parsed.data.cfu ?? null,
      kind: parsed.data.kind,
      has_exercises: parsed.data.hasExercises,
      has_oral: parsed.data.hasOral,
      difficulty: parsed.data.difficulty,
      initial_level: parsed.data.initialLevel,
      priority: parsed.data.priority,
      estimated_hours: parsed.data.estimatedHours ?? null,
      notes: parsed.data.notes || null,
    })
    .eq('id', examId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile aggiornare l’esame.' };

  revalidateExams(examId);
  return { ok: true, message: 'Esame aggiornato.' };
}

export async function deleteExamAction(examId: string): Promise<ExamActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from('exams').delete().eq('id', examId).eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare l’esame.' };
  revalidateExams();
  return { ok: true, message: 'Esame eliminato.' };
}

export async function updateExamStatusAction(
  examId: string,
  status: string,
): Promise<ExamActionResult> {
  const user = await requireUser();
  const allowed = ['non_iniziato', 'pianificato', 'in_studio', 'pronto', 'tentato', 'superato'];
  if (!allowed.includes(status)) return { ok: false, message: 'Stato non valido.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('exams')
    .update({ status })
    .eq('id', examId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile aggiornare lo stato.' };
  revalidateExams(examId);
  return { ok: true, message: 'Stato aggiornato.' };
}

// ---------------------------------------------------------------- appelli

export async function createExamSessionAction(formData: FormData): Promise<ExamActionResult> {
  const user = await requireUser();
  const parsed = examSessionSchema.safeParse({
    examId: formData.get('examId'),
    examDate: formData.get('examDate'),
    status: formData.get('status') ?? 'confermato',
    isEstimated: formData.get('isEstimated') === 'true',
    location: formData.get('location') ?? '',
    notes: formData.get('notes') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('exam_sessions').insert({
    user_id: user.id,
    exam_id: parsed.data.examId,
    exam_date: parsed.data.examDate,
    status: parsed.data.isEstimated ? 'stimato' : parsed.data.status,
    is_estimated: parsed.data.isEstimated,
    location: parsed.data.location || null,
    notes: parsed.data.notes || null,
  });

  if (error) {
    return {
      ok: false,
      message:
        error.code === '23505'
          ? 'Esiste già un appello per questo esame in questa data.'
          : 'Non è stato possibile creare l’appello.',
    };
  }

  revalidateExams(parsed.data.examId);
  return { ok: true, message: 'Appello aggiunto.' };
}

export async function updateExamSessionDateAction(
  sessionId: string,
  examDate: string,
): Promise<ExamActionResult> {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return { ok: false, message: 'Data non valida.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('exam_sessions')
    .update({ exam_date: examDate })
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile modificare la data.' };
  revalidateExams();
  return { ok: true, message: 'Data aggiornata.' };
}

export async function deleteExamSessionAction(sessionId: string): Promise<ExamActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('exam_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare l’appello.' };
  revalidateExams();
  return { ok: true, message: 'Appello eliminato.' };
}

/** Imposta l'appello principale o di riserva (uno solo per tipo). */
export async function setSessionRoleAction(
  sessionId: string,
  role: 'principale' | 'riserva' | 'nessuno',
): Promise<ExamActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('exam_sessions')
    .select('exam_id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return { ok: false, message: 'Appello non trovato.' };
  const examId = (data as { exam_id: string }).exam_id;

  if (role !== 'nessuno') {
    await supabase
      .from('exam_sessions')
      .update({ role: 'nessuno' })
      .eq('user_id', user.id)
      .eq('exam_id', examId)
      .eq('role', role);
  }

  const { error } = await supabase
    .from('exam_sessions')
    .update({ role })
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile impostare l’appello.' };

  revalidateExams(examId);
  revalidatePath('/piano');
  return {
    ok: true,
    message:
      role === 'principale'
        ? 'Appello principale impostato. Rigenera il piano per aggiornare le priorità.'
        : role === 'riserva'
          ? 'Appello di riserva impostato.'
          : 'Ruolo rimosso.',
  };
}

/** Duplica gli appelli di un esame sull'anno successivo, marcandoli come stimati. */
export async function duplicateSessionsNextYearAction(examId: string): Promise<ExamActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('exam_sessions')
    .select('exam_date')
    .eq('user_id', user.id)
    .eq('exam_id', examId);

  const sessions = (data ?? []) as Array<{ exam_date: string }>;
  if (sessions.length === 0) return { ok: false, message: 'Non ci sono appelli da duplicare.' };

  const rows = sessions.map((session) => {
    const [year, month, day] = session.exam_date.split('-');
    return {
      user_id: user.id,
      exam_id: examId,
      exam_date: `${Number(year) + 1}-${month}-${day}`,
      status: 'stimato' as const,
      is_estimated: true,
      notes: 'Data stimata: da confermare con il calendario ufficiale.',
    };
  });

  const { error } = await supabase.from('exam_sessions').upsert(rows, {
    onConflict: 'exam_id,exam_date',
    ignoreDuplicates: true,
  });

  if (error) return { ok: false, message: 'Non è stato possibile duplicare gli appelli.' };

  revalidateExams(examId);
  return { ok: true, message: `${rows.length} appelli stimati creati per l’anno successivo.` };
}

export async function confirmEstimatedSessionAction(sessionId: string): Promise<ExamActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('exam_sessions')
    .update({ is_estimated: false, status: 'confermato' })
    .eq('id', sessionId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile confermare l’appello.' };
  revalidateExams();
  return { ok: true, message: 'Appello confermato.' };
}

// ------------------------------------------------------------ prerequisiti

export async function createDependencyAction(
  examId: string,
  dependsOnExamId: string,
  strength: 'forte' | 'consigliata' = 'forte',
): Promise<ExamActionResult> {
  const user = await requireUser();
  if (examId === dependsOnExamId) {
    return { ok: false, message: 'Un esame non può essere prerequisito di sé stesso.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('exam_dependencies').insert({
    user_id: user.id,
    exam_id: examId,
    depends_on_exam_id: dependsOnExamId,
    strength,
  });

  if (error) {
    return {
      ok: false,
      message: error.code === '23505' ? 'Questa dipendenza esiste già.' : 'Non è stato possibile creare la dipendenza.',
    };
  }

  revalidateExams(examId);
  return { ok: true, message: 'Prerequisito aggiunto.' };
}

export async function deleteDependencyAction(dependencyId: string): Promise<ExamActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('exam_dependencies')
    .delete()
    .eq('id', dependencyId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare la dipendenza.' };
  revalidateExams();
  return { ok: true, message: 'Prerequisito rimosso.' };
}

// ------------------------------------------------------------------ esiti

export async function recordAttemptAction(formData: FormData): Promise<ExamActionResult> {
  const user = await requireUser();
  const parsed = examAttemptSchema.safeParse({
    examId: formData.get('examId'),
    examSessionId: formData.get('examSessionId') ?? '',
    attemptDate: formData.get('attemptDate'),
    outcome: formData.get('outcome'),
    grade: formData.get('grade') || undefined,
    cumLaude: formData.get('cumLaude') === 'true',
    notes: formData.get('notes') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('exam_attempts').insert({
    user_id: user.id,
    exam_id: parsed.data.examId,
    exam_session_id: parsed.data.examSessionId || null,
    attempt_date: parsed.data.attemptDate,
    outcome: parsed.data.outcome,
    grade: parsed.data.grade ?? null,
    cum_laude: parsed.data.cumLaude,
    notes: parsed.data.notes || null,
  });

  if (error) return { ok: false, message: 'Non è stato possibile registrare l’esito.' };

  await supabase
    .from('exams')
    .update({ status: parsed.data.outcome === 'superato' ? 'superato' : 'tentato' })
    .eq('id', parsed.data.examId)
    .eq('user_id', user.id);

  if (parsed.data.examSessionId) {
    await supabase
      .from('exam_sessions')
      .update({
        status: parsed.data.outcome === 'superato' ? 'superato' : 'non_superato',
      })
      .eq('id', parsed.data.examSessionId)
      .eq('user_id', user.id);
  }

  revalidateExams(parsed.data.examId);
  return { ok: true, message: 'Esito registrato.' };
}
