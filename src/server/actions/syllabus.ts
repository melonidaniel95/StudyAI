'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { importSyllabusSchema, moduleSchema, topicSchema } from '@/lib/validation/schemas';
import type { TopicStatus } from '@/lib/domain/types';

export interface SyllabusActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

function revalidateExam(examId: string) {
  revalidatePath(`/esami/${examId}`);
  revalidatePath('/esami');
  revalidatePath('/piano');
}

export async function createModuleAction(formData: FormData): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const parsed = moduleSchema.safeParse({
    examId: formData.get('examId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from('syllabus_modules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('exam_id', parsed.data.examId);

  const { data, error } = await supabase
    .from('syllabus_modules')
    .insert({
      user_id: user.id,
      exam_id: parsed.data.examId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      position: (count ?? 0) + 1,
      is_draft: false,
    })
    .select('id')
    .single();

  if (error) return { ok: false, message: 'Non è stato possibile creare il modulo.' };

  revalidateExam(parsed.data.examId);
  return { ok: true, message: 'Modulo creato.', id: (data as { id: string }).id };
}

export async function updateModuleAction(
  moduleId: string,
  title: string,
): Promise<SyllabusActionResult> {
  const user = await requireUser();
  if (title.trim().length < 2) return { ok: false, message: 'Titolo troppo corto.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('syllabus_modules')
    .update({ title: title.trim(), is_draft: false })
    .eq('id', moduleId)
    .eq('user_id', user.id)
    .select('exam_id')
    .single();

  if (error) return { ok: false, message: 'Non è stato possibile aggiornare il modulo.' };
  revalidateExam((data as { exam_id: string }).exam_id);
  return { ok: true, message: 'Modulo aggiornato.' };
}

export async function deleteModuleAction(moduleId: string): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from('syllabus_modules')
    .select('exam_id')
    .eq('id', moduleId)
    .eq('user_id', user.id)
    .maybeSingle();

  const { error } = await supabase
    .from('syllabus_modules')
    .delete()
    .eq('id', moduleId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile eliminare il modulo.' };
  if (data) revalidateExam((data as { exam_id: string }).exam_id);
  return { ok: true, message: 'Modulo eliminato con i suoi argomenti.' };
}

export async function createTopicAction(formData: FormData): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const parsed = topicSchema.safeParse({
    moduleId: formData.get('moduleId'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    estimatedMinutes: formData.get('estimatedMinutes') ?? 60,
    difficulty: formData.get('difficulty') ?? 3,
    frequentlyAsked: formData.get('frequentlyAsked') === 'true',
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { data: moduleRow } = await supabase
    .from('syllabus_modules')
    .select('exam_id')
    .eq('id', parsed.data.moduleId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!moduleRow) return { ok: false, message: 'Modulo non trovato.' };
  const examId = (moduleRow as { exam_id: string }).exam_id;

  const { count } = await supabase
    .from('syllabus_topics')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('module_id', parsed.data.moduleId);

  const { data, error } = await supabase
    .from('syllabus_topics')
    .insert({
      user_id: user.id,
      module_id: parsed.data.moduleId,
      exam_id: examId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      estimated_minutes: parsed.data.estimatedMinutes,
      difficulty: parsed.data.difficulty,
      frequently_asked: parsed.data.frequentlyAsked,
      position: (count ?? 0) + 1,
      is_draft: false,
    })
    .select('id')
    .single();

  if (error) return { ok: false, message: 'Non è stato possibile creare l’argomento.' };

  revalidateExam(examId);
  return { ok: true, message: 'Argomento creato.', id: (data as { id: string }).id };
}

export async function updateTopicAction(
  topicId: string,
  values: {
    title?: string;
    estimatedMinutes?: number;
    difficulty?: number;
    status?: TopicStatus;
    frequentlyAsked?: boolean;
    description?: string;
  },
): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const update: Record<string, unknown> = { is_draft: false };
  if (values.title !== undefined) {
    if (values.title.trim().length < 2) return { ok: false, message: 'Titolo troppo corto.' };
    update.title = values.title.trim();
  }
  if (values.estimatedMinutes !== undefined) {
    if (values.estimatedMinutes < 5 || values.estimatedMinutes > 1200) {
      return { ok: false, message: 'Il tempo stimato deve essere tra 5 e 1200 minuti.' };
    }
    update.estimated_minutes = Math.round(values.estimatedMinutes);
  }
  if (values.difficulty !== undefined) {
    if (values.difficulty < 1 || values.difficulty > 5) {
      return { ok: false, message: 'La difficoltà deve essere tra 1 e 5.' };
    }
    update.difficulty = Math.round(values.difficulty);
  }
  if (values.status !== undefined) update.status = values.status;
  if (values.frequentlyAsked !== undefined) update.frequently_asked = values.frequentlyAsked;
  if (values.description !== undefined) update.description = values.description || null;

  const { data, error } = await supabase
    .from('syllabus_topics')
    .update(update)
    .eq('id', topicId)
    .eq('user_id', user.id)
    .select('exam_id')
    .single();

  if (error) return { ok: false, message: 'Non è stato possibile aggiornare l’argomento.' };
  revalidateExam((data as { exam_id: string }).exam_id);
  return { ok: true, message: 'Argomento aggiornato.' };
}

export async function deleteTopicAction(topicId: string): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from('syllabus_topics')
    .select('exam_id')
    .eq('id', topicId)
    .eq('user_id', user.id)
    .maybeSingle();

  const { error } = await supabase
    .from('syllabus_topics')
    .delete()
    .eq('id', topicId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile eliminare l’argomento.' };
  if (data) revalidateExam((data as { exam_id: string }).exam_id);
  return { ok: true, message: 'Argomento eliminato.' };
}

/** Riordina gli argomenti di un modulo (trascinamento). */
export async function reorderTopicsAction(
  moduleId: string,
  orderedIds: string[],
): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: moduleRow } = await supabase
    .from('syllabus_modules')
    .select('exam_id')
    .eq('id', moduleId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!moduleRow) return { ok: false, message: 'Modulo non trovato.' };

  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    if (!id) continue;
    await supabase
      .from('syllabus_topics')
      .update({ position: index + 1 })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('module_id', moduleId);
  }

  revalidateExam((moduleRow as { exam_id: string }).exam_id);
  return { ok: true, message: 'Ordine aggiornato.' };
}

export async function reorderModulesAction(
  examId: string,
  orderedIds: string[],
): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    if (!id) continue;
    await supabase
      .from('syllabus_modules')
      .update({ position: index + 1 })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('exam_id', examId);
  }

  revalidateExam(examId);
  return { ok: true, message: 'Ordine aggiornato.' };
}

/**
 * Importa un programma da testo libero.
 * Righe senza rientro e senza trattino = moduli; righe con "-", "*" o rientro = argomenti.
 */
export async function importSyllabusAction(formData: FormData): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const parsed = importSyllabusSchema.safeParse({
    examId: formData.get('examId'),
    text: formData.get('text'),
    defaultMinutes: formData.get('defaultMinutes') ?? 60,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const lines = parsed.data.text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const structure: Array<{ title: string; topics: string[] }> = [];
  for (const rawLine of lines) {
    const isTopic = /^[\s]*[-*•]/.test(rawLine) || /^\s{2,}/.test(rawLine);
    const title = rawLine.replace(/^[\s]*[-*•]\s*/, '').trim();
    if (!title) continue;
    const last = structure[structure.length - 1];
    if (isTopic && last) {
      last.topics.push(title);
    } else {
      structure.push({ title, topics: [] });
    }
  }

  if (structure.length === 0) {
    return { ok: false, message: 'Non è stato riconosciuto nessun modulo nel testo.' };
  }

  const { count } = await supabase
    .from('syllabus_modules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('exam_id', parsed.data.examId);

  let position = count ?? 0;
  let createdTopics = 0;

  for (const item of structure) {
    position += 1;
    const { data: moduleRow, error } = await supabase
      .from('syllabus_modules')
      .insert({
        user_id: user.id,
        exam_id: parsed.data.examId,
        title: item.title,
        position,
        is_draft: true,
        description: 'Importato da testo: verifica con il programma ufficiale.',
      })
      .select('id')
      .single();

    if (error || !moduleRow) continue;
    const moduleId = (moduleRow as { id: string }).id;

    // Un modulo senza argomenti diventa esso stesso un argomento.
    const topics = item.topics.length > 0 ? item.topics : [item.title];
    const rows = topics.map((title, index) => ({
      user_id: user.id,
      module_id: moduleId,
      exam_id: parsed.data.examId,
      title,
      position: index + 1,
      estimated_minutes: parsed.data.defaultMinutes,
      is_draft: true,
    }));
    const { error: topicError } = await supabase.from('syllabus_topics').insert(rows);
    if (!topicError) createdTopics += rows.length;
  }

  revalidateExam(parsed.data.examId);
  return {
    ok: true,
    message: `Importati ${structure.length} moduli e ${createdTopics} argomenti. Sono marcati come bozza: verificali con il programma ufficiale.`,
  };
}

/** Contrassegna il programma come verificato (non più bozza). */
export async function confirmSyllabusAction(examId: string): Promise<SyllabusActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from('syllabus_modules')
    .update({ is_draft: false })
    .eq('user_id', user.id)
    .eq('exam_id', examId);
  await supabase
    .from('syllabus_topics')
    .update({ is_draft: false })
    .eq('user_id', user.id)
    .eq('exam_id', examId);
  await supabase
    .from('exams')
    .update({ syllabus_is_draft: false })
    .eq('id', examId)
    .eq('user_id', user.id);

  revalidateExam(examId);
  return { ok: true, message: 'Programma contrassegnato come verificato.' };
}
