import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarClock, Clock, GraduationCap, Target, TrendingUp } from 'lucide-react';
import { getCurrentUser } from '@/lib/supabase/server';
import { getDashboardData } from '@/server/data';
import { addDaysIso, daysBetween, formatMinutes, relativeDayLabel } from '@/lib/domain/dates';
import { PageHeader } from '@/components/shared/page-header';
import { Stat } from '@/components/shared/stat';
import { RiskBadge } from '@/components/shared/risk-badge';
import { ReadinessBar } from '@/components/shared/readiness-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GeneratePlanButton } from '@/components/plan/generate-plan-button';
import { percent } from '@/lib/utils';
import { ExamIcon } from '@/lib/exam-icons';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/accedi');

  const data = await getDashboardData(user.id);
  if (!data) redirect('/onboarding');

  const { today, overviews, profile, recentSessions, weekMinutes, dueReviews, backlogTasks } = data;

  const weekAgo = addDaysIso(today, -7);
  const minutesLast7 = recentSessions
    .filter((session) => session.started_at.slice(0, 10) >= weekAgo)
    .reduce((sum, session) => sum + session.effective_minutes, 0);

  const upcoming = overviews
    .filter((overview) => overview.primarySession ?? overview.nextSession)
    .map((overview) => ({
      overview,
      date: (overview.primarySession ?? overview.nextSession)!.exam_date,
    }))
    .filter((item) => item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const passed = overviews.filter((overview) => overview.exam.status === 'superato').length;
  const daysToTarget = daysBetween(today, profile.target_date);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Obiettivo: tutti gli esami entro il ${profile.target_date} (${daysToTarget} giorni).`}
        actions={<GeneratePlanButton />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Esami superati"
          value={`${passed} / ${overviews.length}`}
          icon={GraduationCap}
          hint={`${overviews.length - passed} ancora da sostenere`}
        />
        <Stat
          label="Ore ultime 7 giornate"
          value={formatMinutes(minutesLast7)}
          icon={Clock}
          hint={`Disponibili a settimana: ${formatMinutes(weekMinutes.available)}`}
        />
        <Stat
          label="Ripassi in scadenza"
          value={String(dueReviews.length)}
          icon={TrendingUp}
          hint={backlogTasks.length > 0 ? `${backlogTasks.length} attività arretrate` : 'Nessun arretrato'}
        />
        <Stat
          label="Prossimo appello"
          value={upcoming[0] ? relativeDayLabel(today, upcoming[0].date) : '—'}
          icon={CalendarClock}
          hint={upcoming[0]?.overview.exam.short_name ?? 'Nessun appello impostato'}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target className="h-4 w-4" aria-hidden />
            Prossimi appelli e fattibilità
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun appello futuro impostato. Scegli un appello principale dalla scheda di un esame.
            </p>
          ) : (
            <ul className="space-y-3">
              {upcoming.slice(0, 5).map(({ overview, date }) => (
                <li key={overview.exam.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/esami/${overview.exam.id}`}
                      className="font-medium hover:underline"
                    >
                      {overview.exam.short_name ?? overview.exam.name}
                    </Link>
                    <RiskBadge risk={overview.feasibility.risk} label={overview.feasibility.label} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {date} · {relativeDayLabel(today, date)} · ore necessarie stimate{' '}
                    {formatMinutes(overview.remainingMinutes)} · disponibili{' '}
                    {formatMinutes(overview.feasibility.availableMinutes)}
                  </p>
                  <ReadinessBar
                    value={overview.readiness.overall}
                    components={overview.readiness.components}
                    confidence={overview.readiness.confidence}
                    label="Preparazione"
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Stato di tutti gli esami</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {overviews.map((overview) => (
                <li key={overview.exam.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/esami/${overview.exam.id}`}
                    className="flex min-w-0 items-center gap-2 hover:underline"
                  >
                    <ExamIcon icon={overview.exam.icon} color={overview.exam.color} size={15} />
                    <span className="truncate">{overview.exam.short_name ?? overview.exam.name}</span>
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-muted-foreground">
                      {percent(overview.readiness.overall)}%
                    </span>
                    <RiskBadge risk={overview.feasibility.risk} compact />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Ultime sessioni</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Non hai ancora registrato sessioni. Inizia dalla pagina Oggi.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentSessions.slice(0, 6).map((session) => {
                  const exam = overviews.find((o) => o.exam.id === session.exam_id);
                  return (
                    <li key={session.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {exam?.exam.short_name ?? 'Esame'} ·{' '}
                        {relativeDayLabel(today, session.started_at.slice(0, 10))}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatMinutes(session.effective_minutes)}
                        {session.recall ? ` · richiamo ${session.recall}/5` : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button asChild variant="link" className="mt-2 h-auto p-0 text-sm">
              <Link href="/statistiche">Vedi tutte le statistiche</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
