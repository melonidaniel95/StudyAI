'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { mockAttemptSchema, mockExamSchema } from '@/lib/validation/schemas';

export interface MockActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

function revalidateAll() {
  for (const path of ['/simulazioni', '/esami', '/dashboard', '/statistiche']) {
    revalidatePath(path);
  }
}

export async function createMockExamAction(formData: FormData): Promise<MockActionResult> {
  const user = await requireUser();
  const topicIds = formData.getAll('topicIds').map(String).filter(Boolean);

  const parsed = mockExamSchema.safeParse({
    examId: formData.get('examId'),
    title: formData.get('title'),
    kind: formData.get('kind') ?? 'scritto',
    durationMinutes: formData.get('durationMinutes') ?? 90,
    maxScore: formData.get('maxScore') ?? 30,
    passThreshold: formData.get('passThreshold') ?? 18,
    topicIds,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }
  if (parsed.data.passThreshold > parsed.data.maxScore) {
    return { ok: false, message: 'La soglia di superamento non può superare il punteggio massimo.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('mock_exams')
    .insert({
      user_id: user.id,
      exam_id: parsed.data.examId,
      title: parsed.data.title,
      kind: parsed.data.kind,
      duration_minutes: parsed.data.durationMinutes,
      max_score: parsed.data.maxScore,
      pass_threshold: parsed.data.passThreshold,
      topic_ids: parsed.data.topicIds,
    })
    .select('id')
    .single();

  if (error) return { ok: false, message: 'Non è stato possibile creare la simulazione.' };

  revalidateAll();
  return { ok: true, message: 'Simulazione creata.', id: (data as { id: string }).id };
}

export async function deleteMockExamAction(mockExamId: string): Promise<MockActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('mock_exams')
    .delete()
    .eq('id', mockExamId)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare la simulazione.' };
  revalidateAll();
  return { ok: true, message: 'Simulazione eliminata.' };
}

/** Registra l'esito di una simulazione svolta. */
export async function recordMockAttemptAction(formData: FormData): Promise<MockActionResult> {
  const user = await requireUser();
  const parsed = mockAttemptSchema.safeParse({
    mockExamId: formData.get('mockExamId'),
    score: formData.get('score'),
    minutesUsed: formData.get('minutesUsed'),
    selfEvaluation: formData.get('selfEvaluation') ?? 3,
    weakPoints: formData.get('weakPoints') ?? '',
    notes: formData.get('notes') ?? '',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('mock_exams')
    .select('id, exam_id, max_score, pass_threshold, topic_ids')
    .eq('id', parsed.data.mockExamId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Simulazione non trovata.' };
  const mock = data as {
    id: string;
    exam_id: string;
    max_score: number;
    pass_threshold: number;
    topic_ids: string[];
  };

  if (parsed.data.score > Number(mock.max_score)) {
    return { ok: false, message: 'Il punteggio supera il massimo previsto.' };
  }

  const passed = parsed.data.score >= Number(mock.pass_threshold);

  const { error } = await supabase.from('mock_exam_attempts').insert({
    user_id: user.id,
    mock_exam_id: mock.id,
    exam_id: mock.exam_id,
    completed_at: new Date().toISOString(),
    minutes_used: parsed.data.minutesUsed,
    score: parsed.data.score,
    max_score: mock.max_score,
    passed,
    self_evaluation: parsed.data.selfEvaluation,
    topics_covered: mock.topic_ids,
    weak_points: parsed.data.weakPoints || null,
    notes: parsed.data.notes || null,
  });

  if (error) return { ok: false, message: 'Non è stato possibile registrare l’esito.' };

  revalidateAll();
  return {
    ok: true,
    message: passed
      ? `Simulazione superata con ${parsed.data.score}/${mock.max_score}.`
      : `Registrata: ${parsed.data.score}/${mock.max_score}. I punti deboli finiranno nel quaderno degli errori se li aggiungi.`,
  };
}
