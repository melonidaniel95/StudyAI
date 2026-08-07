'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, requireUser } from '@/lib/supabase/server';
import { calibratePace, type PaceSample } from '@/lib/domain/materials';
import { addDaysIso, todayIso } from '@/lib/domain/dates';
import { MAX_FILE_SIZE, isAllowedMimeType } from '@/lib/uploads';

export interface MaterialActionResult {
  ok: boolean;
  message: string;
  created?: { resources: number; modules: number; topics: number; segments: number };
  explanation?: string;
}

const segmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  pageStart: z.coerce.number().int().min(1).max(20000),
  pageEnd: z.coerce.number().int().min(1).max(20000),
  estimatedMinutes: z.coerce.number().int().min(0).max(1200),
  kind: z.enum(['teoria', 'esercizi', 'riferimento']),
  difficulty: z.coerce.number().int().min(1).max(5).default(3),
  /* Testo estratto nel browser: alimenta l'analisi AI senza riscaricare il PDF. */
  textSample: z.string().max(8000).optional(),
  wordCount: z.coerce.number().int().min(0).max(500000).optional(),
  formulaDensity: z.coerce.number().min(0).max(1).optional(),
});

const fileSchema = z.object({
  title: z.string().trim().min(1).max(200),
  fileName: z.string().trim().max(300),
  storagePath: z.string().trim().max(500),
  mimeType: z.string().trim().max(120),
  fileSize: z.coerce.number().int().min(0),
  pageCount: z.coerce.number().int().min(1).max(20000),
  lectureNumber: z.coerce.number().int().min(0).max(99).nullable(),
  type: z.enum(['pdf', 'libro', 'appunti', 'formulario', 'prova_precedente']).default('pdf'),
  outlineSource: z.enum(['indice', 'titoli', 'nessuna']),
  segments: z.array(segmentSchema).min(1).max(200),
});

const importSchema = z.object({
  examId: z.string().uuid(),
  files: z.array(fileSchema).min(1).max(40),
});

export type MaterialImportInput = z.infer<typeof importSchema>;

/**
 * Importa il materiale di una materia e lo trasforma in programma pianificabile.
 *
 * Per ogni file caricato crea:
 *  - una risorsa (`study_resources`) con numero di pagine e indice estratto;
 *  - un modulo del programma (`syllabus_modules`);
 *  - un argomento per ogni segmento (`syllabus_topics`), con il tempo stimato
 *    calcolato sulle pagine reali;
 *  - un segmento (`resource_segments`) che lega argomento, risorsa e intervallo
 *    di pagine: è quello che permette attività del tipo «slide 45-72».
 *
 * Le parti di riferimento (indice, bibliografia) vengono registrate come
 * segmenti ma non generano argomenti da studiare.
 */
export async function importMaterialAction(
  input: MaterialImportInput,
): Promise<MaterialActionResult> {
  const user = await requireUser();
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();

  // L'esame deve appartenere all'utente.
  const { data: examRow } = await supabase
    .from('exams')
    .select('id, short_name, name')
    .eq('id', parsed.data.examId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!examRow) return { ok: false, message: 'Esame non trovato.' };

  // Posizione di partenza dei moduli.
  const { count: moduleCount } = await supabase
    .from('syllabus_modules')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('exam_id', parsed.data.examId);

  let position = moduleCount ?? 0;
  const created = { resources: 0, modules: 0, topics: 0, segments: 0 };

  for (const file of parsed.data.files) {
    // Controlli sul file caricato, ripetuti lato server.
    if (!file.storagePath.startsWith(`${user.id}/`)) {
      return { ok: false, message: `Percorso non valido per «${file.fileName}».` };
    }
    if (file.mimeType && !isAllowedMimeType(file.mimeType)) {
      return { ok: false, message: `Tipo di file non consentito: «${file.fileName}».` };
    }
    if (file.fileSize > MAX_FILE_SIZE) {
      return { ok: false, message: `«${file.fileName}» supera il limite di 50 MB.` };
    }
    for (const segment of file.segments) {
      if (segment.pageEnd < segment.pageStart) {
        return { ok: false, message: `Intervallo di pagine non valido in «${file.title}».` };
      }
      if (segment.pageEnd > file.pageCount) {
        return { ok: false, message: `«${file.title}» ha segmenti oltre l'ultima pagina.` };
      }
    }

    // 1. Risorsa
    const { data: resourceRow, error: resourceError } = await supabase
      .from('study_resources')
      .insert({
        user_id: user.id,
        exam_id: parsed.data.examId,
        title: file.title,
        type: file.type,
        storage_path: file.storagePath,
        file_name: file.fileName,
        file_size: file.fileSize,
        mime_type: file.mimeType,
        page_count: file.pageCount,
        lecture_number: file.lectureNumber,
        outline: file.segments.map((segment) => ({
          title: segment.title,
          page: segment.pageStart,
          level: 0,
        })),
        processed_at: new Date().toISOString(),
        tags: ['materiale'],
      })
      .select('id')
      .single();

    if (resourceError || !resourceRow) {
      return { ok: false, message: `Non è stato possibile salvare «${file.title}».` };
    }
    const resourceId = (resourceRow as { id: string }).id;
    created.resources += 1;

    // 2. Modulo del programma
    position += 1;
    const moduleTitle =
      file.lectureNumber !== null
        ? `L${String(file.lectureNumber).padStart(2, '0')} — ${file.title}`
        : file.title;

    const { data: moduleRow, error: moduleError } = await supabase
      .from('syllabus_modules')
      .insert({
        user_id: user.id,
        exam_id: parsed.data.examId,
        title: moduleTitle.slice(0, 160),
        description: `Da ${file.fileName} · ${file.pageCount} pagine · struttura ricavata ${
          file.outlineSource === 'indice'
            ? "dall'indice del PDF"
            : file.outlineSource === 'titoli'
              ? 'dai titoli delle pagine'
              : 'a blocchi omogenei'
        }.`,
        position,
        is_draft: true,
      })
      .select('id')
      .single();

    if (moduleError || !moduleRow) {
      return { ok: false, message: `Non è stato possibile creare il modulo per «${file.title}».` };
    }
    const moduleId = (moduleRow as { id: string }).id;
    created.modules += 1;

    // 3. Argomenti + segmenti
    const studiable = file.segments.filter((segment) => segment.kind !== 'riferimento');

    for (const [index, segment] of file.segments.entries()) {
      let topicId: string | null = null;

      if (segment.kind !== 'riferimento') {
        const { data: topicRow } = await supabase
          .from('syllabus_topics')
          .insert({
            user_id: user.id,
            module_id: moduleId,
            exam_id: parsed.data.examId,
            title: segment.title.slice(0, 200),
            description: `${file.title} · pagine ${segment.pageStart}-${segment.pageEnd}`,
            position: index + 1,
            estimated_minutes: Math.max(5, Math.min(1200, segment.estimatedMinutes)),
            difficulty: segment.difficulty,
            is_draft: true,
          })
          .select('id')
          .single();
        topicId = (topicRow as { id: string } | null)?.id ?? null;
        if (topicId) created.topics += 1;
      }

      const { error: segmentError } = await supabase.from('resource_segments').insert({
        user_id: user.id,
        resource_id: resourceId,
        exam_id: parsed.data.examId,
        topic_id: topicId,
        title: segment.title.slice(0, 200),
        position: index + 1,
        page_start: segment.pageStart,
        page_end: segment.pageEnd,
        estimated_minutes: segment.estimatedMinutes,
        kind: segment.kind,
        is_draft: true,
        text_sample: segment.textSample ?? null,
        word_count: segment.wordCount ?? null,
        formula_density: segment.formulaDensity ?? null,
      });
      if (!segmentError) created.segments += 1;

      // Collegamento risorsa ↔ argomento, usato nella sessione di studio.
      if (topicId) {
        await supabase
          .from('resource_topic_links')
          .insert({ user_id: user.id, resource_id: resourceId, topic_id: topicId });
      }
    }

    if (studiable.length === 0) {
      // Nessun contenuto studiabile: il modulo resta come riferimento.
      await supabase
        .from('syllabus_modules')
        .update({ description: 'Materiale di riferimento, senza argomenti da studiare.' })
        .eq('id', moduleId)
        .eq('user_id', user.id);
    }
  }

  await supabase
    .from('exams')
    .update({ syllabus_is_draft: true })
    .eq('id', parsed.data.examId)
    .eq('user_id', user.id);

  revalidatePath('/esami');
  revalidatePath(`/esami/${parsed.data.examId}`);
  revalidatePath('/risorse');
  revalidatePath('/piano');

  return {
    ok: true,
    created,
    message: `Importati ${created.resources} file: ${created.modules} moduli, ${created.topics} argomenti e ${created.segments} blocchi di pagine. Rigenera il piano per vederli distribuiti.`,
  };
}

/** Imposta a mano il ritmo di studio di un esame. */
export async function updateExamPaceAction(
  examId: string,
  minutesPerPage: number,
  minutesPerPageExercises: number,
): Promise<MaterialActionResult> {
  const user = await requireUser();
  if (minutesPerPage < 0.1 || minutesPerPage > 60) {
    return { ok: false, message: 'Il ritmo deve essere tra 0,1 e 60 minuti per pagina.' };
  }
  if (minutesPerPageExercises < 0.1 || minutesPerPageExercises > 90) {
    return { ok: false, message: 'Il ritmo degli esercizi deve essere tra 0,1 e 90 minuti.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('exams')
    .update({
      minutes_per_page: Number(minutesPerPage.toFixed(2)),
      minutes_per_page_exercises: Number(minutesPerPageExercises.toFixed(2)),
      pace_updated_at: new Date().toISOString(),
    })
    .eq('id', examId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile salvare il ritmo.' };

  revalidatePath(`/esami/${examId}`);
  return { ok: true, message: 'Ritmo aggiornato. Rigenera il piano per applicarlo.' };
}

/**
 * Ricalibra il ritmo di un esame sulle sessioni realmente svolte e aggiorna
 * le stime dei segmenti non ancora completati.
 */
export async function recalibratePaceAction(examId: string): Promise<MaterialActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: examRow } = await supabase
    .from('exams')
    .select('id, minutes_per_page, minutes_per_page_exercises, difficulty')
    .eq('id', examId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!examRow) return { ok: false, message: 'Esame non trovato.' };
  const exam = examRow as {
    id: string;
    minutes_per_page: number;
    minutes_per_page_exercises: number;
    difficulty: number;
  };

  const since = addDaysIso(todayIso(), -120);
  const { data: sessionRows } = await supabase
    .from('study_sessions')
    .select('effective_minutes, pages_covered, started_at')
    .eq('user_id', user.id)
    .eq('exam_id', examId)
    .gt('pages_covered', 0)
    .gte('started_at', since);

  const samples: PaceSample[] = ((sessionRows ?? []) as Array<{
    effective_minutes: number;
    pages_covered: number | null;
    started_at: string;
  }>)
    .filter((row) => row.pages_covered && row.effective_minutes > 0)
    .map((row) => ({
      pages: row.pages_covered ?? 0,
      minutes: row.effective_minutes,
      date: row.started_at.slice(0, 10),
    }));

  const result = calibratePace(Number(exam.minutes_per_page), samples);

  if (result.confidence === 0) {
    return { ok: true, message: result.explanation, explanation: result.explanation };
  }

  await supabase
    .from('exams')
    .update({
      minutes_per_page: result.minutesPerPage,
      pace_samples: result.samples,
      pace_updated_at: new Date().toISOString(),
    })
    .eq('id', examId)
    .eq('user_id', user.id);

  // Aggiorna le stime dei segmenti non ancora completati.
  const { data: segmentRows } = await supabase
    .from('resource_segments')
    .select('id, topic_id, page_start, page_end, pages_done, kind')
    .eq('user_id', user.id)
    .eq('exam_id', examId);

  const factor = 0.8 + (Math.min(5, Math.max(1, exam.difficulty)) - 1) * 0.125;

  for (const row of (segmentRows ?? []) as Array<{
    id: string;
    topic_id: string | null;
    page_start: number;
    page_end: number;
    pages_done: number;
    kind: string;
  }>) {
    const pages = row.page_end - row.page_start + 1;
    if (row.pages_done >= pages || row.kind === 'riferimento') continue;
    const rate =
      row.kind === 'esercizi' ? Number(exam.minutes_per_page_exercises) : result.minutesPerPage;
    const minutes = Math.max(5, Math.round(pages * rate * factor));
    await supabase
      .from('resource_segments')
      .update({ estimated_minutes: minutes })
      .eq('id', row.id)
      .eq('user_id', user.id);

    // L'argomento collegato eredita la nuova stima.
    if (row.topic_id) {
      await supabase
        .from('syllabus_topics')
        .update({ estimated_minutes: minutes })
        .eq('user_id', user.id)
        .eq('id', row.topic_id);
    }
  }

  revalidatePath(`/esami/${examId}`);
  revalidatePath('/piano');

  return { ok: true, message: result.explanation, explanation: result.explanation };
}

/** Elimina un blocco di pagine e l'argomento collegato. */
export async function deleteSegmentAction(segmentId: string): Promise<MaterialActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('resource_segments')
    .select('id, exam_id, topic_id')
    .eq('id', segmentId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return { ok: false, message: 'Blocco non trovato.' };
  const segment = data as { exam_id: string; topic_id: string | null };

  if (segment.topic_id) {
    await supabase
      .from('syllabus_topics')
      .delete()
      .eq('id', segment.topic_id)
      .eq('user_id', user.id);
  }
  await supabase.from('resource_segments').delete().eq('id', segmentId).eq('user_id', user.id);

  revalidatePath(`/esami/${segment.exam_id}`);
  return { ok: true, message: 'Blocco eliminato.' };
}
