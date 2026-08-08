'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import { onboardingSchema } from '@/lib/validation/schemas';
import { generatePlanAction } from './planning';

export interface OnboardingResult {
  ok: boolean;
  message: string;
  warnings?: string[];
}

/**
 * Conclude l'onboarding: salva profilo e disponibilità, popola i dati iniziali
 * (14 esami, prerequisiti, appelli 2026, programmi dimostrativi) e genera il
 * primo piano di studio.
 */
export async function completeOnboardingAction(formData: FormData): Promise<OnboardingResult> {
  const user = await requireUser();

  const restDays = formData
    .getAll('restDays')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);

  const parsed = onboardingSchema.safeParse({
    fullName: formData.get('fullName') ?? '',
    targetDate: formData.get('targetDate'),
    weekdayMinutes: formData.get('weekdayMinutes'),
    weekendMinutes: formData.get('weekendMinutes'),
    restDays,
    maxSessionMinutes: formData.get('maxSessionMinutes'),
    studyPreference: formData.get('studyPreference'),
    loadDemoContent: formData.get('loadDemoContent') !== 'false',
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }
  const input = parsed.data;
  const supabase = await createClient();

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName || null,
      target_date: input.targetDate,
      max_session_minutes: input.maxSessionMinutes,
      study_preference: input.studyPreference,
      onboarding_completed: true,
    })
    .eq('id', user.id);

  if (profileError) {
    return { ok: false, message: 'Non è stato possibile salvare il profilo.' };
  }

  // Dati iniziali: esami, prerequisiti, appelli, programmi dimostrativi.
  const { error: seedError } = await supabase.rpc('seed_initial_data');
  if (seedError) {
    return {
      ok: false,
      message: `I dati iniziali non sono stati creati: ${seedError.message}. Verifica di aver applicato tutte le migrazioni.`,
    };
  }

  // Disponibilità settimanale dichiarata nell'onboarding.
  const rows = Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const isWeekend = weekday >= 6;
    const isRest = input.restDays.includes(weekday);
    return {
      user_id: user.id,
      weekday,
      available_minutes: isRest ? 0 : isWeekend ? input.weekendMinutes : input.weekdayMinutes,
      is_rest_day: isRest,
    };
  });

  const { error: availabilityError } = await supabase
    .from('weekly_availability')
    .upsert(rows, { onConflict: 'user_id,weekday' });

  if (availabilityError) {
    return { ok: false, message: 'Non è stato possibile salvare la disponibilità settimanale.' };
  }

  const plan = await generatePlanAction({ reset: true });

  revalidatePath('/', 'layout');

  return {
    ok: true,
    message: plan.ok
      ? 'Tutto pronto: il tuo primo piano è stato generato.'
      : 'Configurazione salvata. Genera il piano dalla pagina Piano quando vuoi.',
    warnings: plan.warnings,
  };
}

/** Rigenera i dati iniziali (solo se l'utente non ha ancora esami). */
export async function seedInitialDataAction(): Promise<OnboardingResult> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('seed_initial_data');
  if (error) return { ok: false, message: error.message };
  const result = data as { seeded?: boolean; reason?: string } | null;
  revalidatePath('/esami');
  return {
    ok: true,
    message: result?.seeded ? 'Dati iniziali creati.' : (result?.reason ?? 'Nessuna operazione necessaria.'),
  };
}
