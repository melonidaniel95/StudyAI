import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getCurrentUser, isSupabaseConfigured } from '@/lib/supabase/server';
import { getProfile } from '@/server/data';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect('/configurazione');

  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const profile = await getProfile(user.id);
  if (!profile?.onboarding_completed) redirect('/onboarding');

  return <AppShell email={user.email ?? ''}>{children}</AppShell>;
}
