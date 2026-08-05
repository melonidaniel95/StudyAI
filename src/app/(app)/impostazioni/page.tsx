import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getAvailability, getProfile } from '@/server/data';
import { todayIso } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsForms } from './settings-forms';
import type { UnavailableDateRow } from '@/types/db';

export const metadata: Metadata = { title: 'Impostazioni' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const profile = await getProfile(user.id);
  if (!profile) redirect('/onboarding');

  const supabase = await createClient();
  const today = todayIso(profile.timezone);

  const [availability, { data: unavailableRows }] = await Promise.all([
    getAvailability(user.id),
    supabase
      .from('unavailable_dates')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', today)
      .order('date'),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Impostazioni"
        description="Profilo, disponibilità settimanale, giornate non disponibili e pesi del calcolo di preparazione."
      />
      <SettingsForms
        email={user.email ?? ''}
        today={today}
        profile={{
          fullName: profile.full_name ?? '',
          targetDate: profile.target_date,
          maxSessionMinutes: profile.max_session_minutes,
          minSessionMinutes: profile.min_session_minutes,
          weeklyBufferRatio: Number(profile.weekly_buffer_ratio),
          maxParallelExams: profile.max_parallel_exams,
          studyPreference: profile.study_preference,
          notificationsEnabled: profile.notifications_enabled,
          aiEnabled: profile.ai_enabled,
          readinessWeights: profile.readiness_weights,
        }}
        availability={availability}
        unavailable={((unavailableRows ?? []) as UnavailableDateRow[]).map((row) => ({
          id: row.id,
          date: row.date,
          reason: row.reason,
          availableMinutes: row.available_minutes,
        }))}
      />
    </div>
  );
}
