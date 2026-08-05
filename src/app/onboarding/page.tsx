import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser, isSupabaseConfigured } from '@/lib/supabase/server';
import { getProfile } from '@/server/data';
import { OnboardingWizard } from './wizard';

export const metadata: Metadata = { title: 'Configurazione iniziale' };

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect('/configurazione');
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const profile = await getProfile(user.id);
  if (profile?.onboarding_completed) redirect('/oggi');

  return (
    <main id="contenuto" className="mx-auto w-full max-w-2xl px-4 py-8">
      <OnboardingWizard defaultName={profile?.full_name ?? ''} />
    </main>
  );
}
