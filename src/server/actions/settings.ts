'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import {
  availabilitySchema,
  profileSchema,
  readinessWeightsSchema,
  unavailableDateSchema,
} from '@/lib/validation/schemas';

export interface SettingsActionResult {
  ok: boolean;
  message: string;
}

export async function updateProfileAction(formData: FormData): Promise<SettingsActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName') ?? '',
    targetDate: formData.get('targetDate'),
    maxSessionMinutes: formData.get('maxSessionMinutes'),
    minSessionMinutes: formData.get('minSessionMinutes'),
    weeklyBufferRatio: formData.get('weeklyBufferRatio'),
    maxParallelExams: formData.get('maxParallelExams'),
    studyPreference: formData.get('studyPreference'),
    notificationsEnabled: formData.get('notificationsEnabled') === 'true',
    aiEnabled: formData.get('aiEnabled') === 'true',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }
  if (parsed.data.minSessionMinutes > parsed.data.maxSessionMinutes) {
    return { ok: false, message: 'La sessione minima non può superare quella massima.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName || null,
      target_date: parsed.data.targetDate,
      max_session_minutes: parsed.data.maxSessionMinutes,
      min_session_minutes: parsed.data.minSessionMinutes,
      weekly_buffer_ratio: parsed.data.weeklyBufferRatio,
      max_parallel_exams: parsed.data.maxParallelExams,
      study_preference: parsed.data.studyPreference,
      notifications_enabled: parsed.data.notificationsEnabled,
      ai_enabled: parsed.data.aiEnabled,
    })
    .eq('id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile salvare le impostazioni.' };

  revalidatePath('/impostazioni');
  revalidatePath('/oggi');
  return { ok: true, message: 'Impostazioni salvate.' };
}

export async function updateAvailabilityAction(formData: FormData): Promise<SettingsActionResult> {
  const user = await requireUser();

  const days = Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    return {
      weekday,
      availableMinutes: Number(formData.get(`minutes-${weekday}`) ?? 0),
      isRestDay: formData.get(`rest-${weekday}`) === 'true',
      preferredStart: String(formData.get(`start-${weekday}`) ?? ''),
    };
  });

  const parsed = availabilitySchema.safeParse({ days });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('weekly_availability').upsert(
    parsed.data.days.map((day) => ({
      user_id: user.id,
      weekday: day.weekday,
      available_minutes: day.isRestDay ? 0 : day.availableMinutes,
      is_rest_day: day.isRestDay,
      preferred_start: day.preferredStart || null,
    })),
    { onConflict: 'user_id,weekday' },
  );

  if (error) return { ok: false, message: 'Non è stato possibile salvare la disponibilità.' };

  revalidatePath('/impostazioni');
  revalidatePath('/piano');
  return { ok: true, message: 'Disponibilità aggiornata. Rigenera il piano per applicarla.' };
}

export async function addUnavailableDateAction(formData: FormData): Promise<SettingsActionResult> {
  const user = await requireUser();
  const rawMinutes = formData.get('availableMinutes');
  const parsed = unavailableDateSchema.safeParse({
    date: formData.get('date'),
    reason: formData.get('reason') ?? '',
    availableMinutes: rawMinutes === null || rawMinutes === '' ? undefined : rawMinutes,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('unavailable_dates').upsert(
    {
      user_id: user.id,
      date: parsed.data.date,
      reason: parsed.data.reason || null,
      available_minutes: parsed.data.availableMinutes ?? null,
    },
    { onConflict: 'user_id,date' },
  );

  if (error) return { ok: false, message: 'Non è stato possibile salvare la giornata.' };

  revalidatePath('/impostazioni');
  revalidatePath('/calendario');
  return { ok: true, message: 'Giornata registrata.' };
}

export async function deleteUnavailableDateAction(id: string): Promise<SettingsActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from('unavailable_dates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return { ok: false, message: 'Non è stato possibile eliminare la giornata.' };
  revalidatePath('/impostazioni');
  revalidatePath('/calendario');
  return { ok: true, message: 'Giornata rimossa.' };
}

export async function updateReadinessWeightsAction(
  formData: FormData,
): Promise<SettingsActionResult> {
  const user = await requireUser();
  const parsed = readinessWeightsSchema.safeParse({
    coverage: formData.get('coverage'),
    activeRecall: formData.get('activeRecall'),
    exercises: formData.get('exercises'),
    mock: formData.get('mock'),
    reviewRegularity: formData.get('reviewRegularity'),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Valori non validi.' };
  }

  const total =
    parsed.data.coverage +
    parsed.data.activeRecall +
    parsed.data.exercises +
    parsed.data.mock +
    parsed.data.reviewRegularity;

  if (total <= 0) return { ok: false, message: 'La somma dei pesi deve essere maggiore di zero.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ readiness_weights: parsed.data })
    .eq('id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile salvare i pesi.' };

  revalidatePath('/impostazioni');
  revalidatePath('/esami');
  return {
    ok: true,
    message:
      Math.abs(total - 1) > 0.01
        ? `Pesi salvati (somma ${total.toFixed(2)}): verranno normalizzati automaticamente.`
        : 'Pesi salvati.',
  };
}
