'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from '@/lib/validation/schemas';

export interface ActionState {
  error?: string;
  success?: string;
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

/** Traduce in italiano i messaggi di errore più comuni di Supabase Auth. */
function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'Email o password non corretti.';
  if (normalized.includes('email not confirmed'))
    return 'Devi prima confermare l’indirizzo email: controlla la posta.';
  if (normalized.includes('user already registered'))
    return 'Esiste già un account con questo indirizzo email.';
  if (normalized.includes('password should be at least'))
    return 'La password deve avere almeno 8 caratteri.';
  if (normalized.includes('rate limit') || normalized.includes('too many'))
    return 'Troppi tentativi ravvicinati: riprova tra qualche minuto.';
  return 'Non è stato possibile completare l’operazione. Riprova.';
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translateAuthError(error.message) };

  const next = String(formData.get('successivo') ?? '/oggi');
  redirect(next.startsWith('/') ? next : '/oggi');
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName') ?? '',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dati non validi.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName ?? '' },
      emailRedirectTo: `${siteUrl()}/auth/callback`,
    },
  });

  if (error) return { error: translateAuthError(error.message) };

  // Se la conferma email è disattivata la sessione è già attiva.
  if (data.session) redirect('/onboarding');

  return {
    success:
      'Registrazione completata. Ti abbiamo inviato un’email di conferma: aprila per attivare l’account.',
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/accedi');
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Email non valida.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?successivo=/aggiorna-password`,
  });
  if (error) return { error: translateAuthError(error.message) };

  return {
    success:
      'Se l’indirizzo è registrato riceverai un’email con il link per impostare una nuova password.',
  };
}

export async function updatePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dati non validi.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: translateAuthError(error.message) };

  redirect('/oggi');
}
