import { redirect } from 'next/navigation';
import { getCurrentUser, isSupabaseConfigured } from '@/lib/supabase/server';

export default async function HomePage() {
  if (!isSupabaseConfigured()) redirect('/configurazione');
  const user = await getCurrentUser();
  redirect(user ? '/oggi' : '/accedi');
}
