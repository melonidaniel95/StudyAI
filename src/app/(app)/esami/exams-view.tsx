'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarDays, LayoutGrid, Network, Table2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReadinessBar } from '@/components/shared/readiness-bar';
import { RiskBadge } from '@/components/shared/risk-badge';
import { DependencyGraph } from '@/components/exams/dependency-graph';
import { ExamIcon } from '@/lib/exam-icons';
import { ExamSignalChips, ExamSignalsLegend, URGENCY_BAR } from '@/components/exams/exam-signals';
import { urgencyFromDaysRemaining } from '@/lib/domain/exam-signals';
import { SessionCalendar } from '@/components/exams/session-calendar';
import { formatMinutes, formatShortDate, relativeDayLabel } from '@/lib/domain/dates';
import type { ExamStatus, IsoDate, RiskLevel, ScoreComponent } from '@/lib/domain/types';
import { percent } from '@/lib/utils';

export interface ExamCardData {
  id: string;
  name: string;
  shortName: string;
  color: string;
  icon: string;
  hasMaterial: boolean;
  status: ExamStatus;
  kind: string;
  difficulty: number;
  priority: number;
  cfu: number | null;
  syllabusIsDraft: boolean;
  topicCount: number;
  readiness: number;
  confidence: number;
  readinessComponents: ScoreComponent[];
  coverage: number;
  risk: RiskLevel;
  riskLabel: string;
  riskMessage: string;
  daysRemaining: number | null;
  studiedMinutes: number;
  remainingMinutes: number;
  primaryDate: IsoDate | null;
  backupDate: IsoDate | null;
  nextDate: IsoDate | null;
  sessionCount: number;
  dueReviews: number;
  openErrors: number;
  unlocksExams: number;
  prerequisites: string[];
}

export interface DependencyData {
  id: string;
  examId: string;
  dependsOnExamId: string;
  strength: string;
}

const STATUS_LABELS: Record<ExamStatus, string> = {
  non_iniziato: 'Non iniziato',
  pianificato: 'Pianificato',
  in_studio: 'In studio',
  pronto: 'Pronto',
  tentato: 'Tentato',
  superato: 'Superato',
};

type SortKey = 'data' | 'preparazione' | 'urgenza' | 'difficolta' | 'nome';

export function ExamsView({
  exams,
  dependencies,
  today,
}: {
  exams: ExamCardData[];
  dependencies: DependencyData[];
  today: IsoDate;
}) {
  const [statusFilter, setStatusFilter] = useState<'tutti' | ExamStatus>('tutti');
  const [riskFilter, setRiskFilter] = useState<'tutti' | RiskLevel>('tutti');
  const [sortKey, setSortKey] = useState<SortKey>('urgenza');

  const filtered = useMemo(() => {
    const list = exams.filter((exam) => {
      if (statusFilter !== 'tutti' && exam.status !== statusFilter) return false;
      if (riskFilter !== 'tutti' && exam.risk !== riskFilter) return false;
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'data':
          if (!a.nextDate) return 1;
          if (!b.nextDate) return -1;
          return a.nextDate.localeCompare(b.nextDate);
        case 'preparazione':
          return a.readiness - b.readiness;
        case 'difficolta':
          return b.difficulty - a.difficulty;
        case 'nome':
          return a.name.localeCompare(b.name, 'it');
        case 'urgenza':
        default: {
          const aDays = a.daysRemaining ?? 9999;
          const bDays = b.daysRemaining ?? 9999;
          if (aDays !== bDays) return aDays - bDays;
          return a.readiness - b.readiness;
        }
      }
    });
    return sorted;
  }, [exams, statusFilter, riskFilter, sortKey]);

  // Conflitti: due esami nello stesso giorno o a meno di 3 giorni di distanza.
  const conflicts = useMemo(() => {
    const dated = exams
      .filter((exam) => exam.primaryDate)
      .map((exam) => ({ exam, date: exam.primaryDate as IsoDate }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const found: string[] = [];
    for (let i = 1; i < dated.length; i += 1) {
      const previous = dated[i - 1];
      const current = dated[i];
      if (!previous || !current) continue;
      const diff = Math.round(
        (Date.parse(current.date) - Date.parse(previous.date)) / 86_400_000,
      );
      if (diff === 0) {
        found.push(
          `${previous.exam.shortName} e ${current.exam.shortName} sono lo stesso giorno (${formatShortDate(current.date)}).`,
        );
      } else if (diff <= 3) {
        found.push(
          `${previous.exam.shortName} e ${current.exam.shortName} distano ${diff} giorni (${formatShortDate(previous.date)} → ${formatShortDate(current.date)}).`,
        );
      }
    }
    return found;
  }, [exams]);

  return (
    <div className="space-y-5">
      {conflicts.length > 0 ? (
        <div
          role="status"
          className="space-y-1 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-accent" aria-hidden />
            Appelli molto ravvicinati
          </p>
          <ul className="space-y-0.5 text-muted-foreground">
            {conflicts.map((conflict) => (
              <li key={conflict}>• {conflict}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ExamSignalsLegend />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Stato</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="tutti">Tutti</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Rischio</span>
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="tutti">Tutti</option>
            <option value="verde">Verde</option>
            <option value="giallo">Giallo</option>
            <option value="arancione">Arancione</option>
            <option value="rosso">Rosso</option>
            <option value="grigio">Grigio</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Ordina per</span>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="urgenza">Urgenza</option>
            <option value="data">Data appello</option>
            <option value="preparazione">Preparazione</option>
            <option value="difficolta">Difficoltà</option>
            <option value="nome">Nome</option>
          </select>
        </label>

        <p className="ml-auto text-sm text-muted-foreground">
          {filtered.length} di {exams.length} esami
        </p>
      </div>

      <Tabs defaultValue="card">
        <TabsList>
          <TabsTrigger value="card">
            <LayoutGrid className="mr-1.5 h-4 w-4" aria-hidden />
            Schede
          </TabsTrigger>
          <TabsTrigger value="tabella">
            <Table2 className="mr-1.5 h-4 w-4" aria-hidden />
            Tabella
          </TabsTrigger>
          <TabsTrigger value="grafo">
            <Network className="mr-1.5 h-4 w-4" aria-hidden />
            Prerequisiti
          </TabsTrigger>
          <TabsTrigger value="calendario">
            <CalendarDays className="mr-1.5 h-4 w-4" aria-hidden />
            Appelli
          </TabsTrigger>
        </TabsList>

        <TabsContent value="card">
          <ul className="grid gap-4 md:grid-cols-2">
            {filtered.map((exam) => (
              <li key={exam.id}>
                <Card className="relative h-full overflow-hidden pl-1.5">
                  {/* Barra di urgenza: il primo segnale che si coglie. */}
                  <span
                    className={`absolute inset-y-0 left-0 w-1.5 ${
                      URGENCY_BAR[urgencyFromDaysRemaining(exam.daysRemaining).level]
                    }`}
                    aria-hidden
                  />
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-start justify-between gap-2">
                      <Link href={`/esami/${exam.id}`} className="hover:underline">
                        <span className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                            style={{ backgroundColor: `${exam.color}1A` }}
                          >
                            <ExamIcon icon={exam.icon} color={exam.color} size={16} />
                          </span>
                          {exam.shortName}
                        </span>
                      </Link>
                      <RiskBadge risk={exam.risk} label={exam.riskLabel} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ExamSignalChips
                      hasMaterial={exam.hasMaterial}
                      hasBookedSession={exam.primaryDate !== null}
                      daysRemaining={exam.daysRemaining}
                    />
                    <ReadinessBar
                      value={exam.readiness}
                      components={exam.readinessComponents}
                      confidence={exam.confidence}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="muted">{STATUS_LABELS[exam.status]}</Badge>
                      <Badge variant="secondary">Difficoltà {exam.difficulty}/5</Badge>
                      {exam.cfu ? <Badge variant="muted">{exam.cfu} CFU</Badge> : null}
                      {exam.syllabusIsDraft && exam.topicCount > 0 ? (
                        <Badge variant="accent">Programma da verificare</Badge>
                      ) : null}
                      {exam.unlocksExams > 0 ? (
                        <Badge variant="default">Prerequisito di {exam.unlocksExams}</Badge>
                      ) : null}
                    </div>
                    <dl className="grid grid-cols-2 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Appello principale</dt>
                      <dd className="text-right">
                        {exam.primaryDate
                          ? `${formatShortDate(exam.primaryDate)} (${relativeDayLabel(today, exam.primaryDate)})`
                          : exam.sessionCount === 0
                            ? 'Date non disponibili'
                            : 'Da scegliere'}
                      </dd>
                      <dt className="text-muted-foreground">Programma</dt>
                      <dd className="text-right">
                        {exam.topicCount > 0 ? `${percent(exam.coverage)}% di ${exam.topicCount} argomenti` : 'Da inserire'}
                      </dd>
                      <dt className="text-muted-foreground">Ore studiate</dt>
                      <dd className="text-right">{formatMinutes(exam.studiedMinutes)}</dd>
                      <dt className="text-muted-foreground">Ore stimate rimanenti</dt>
                      <dd className="text-right">{formatMinutes(exam.remainingMinutes)}</dd>
                    </dl>
                    <p className="text-xs text-muted-foreground">{exam.riskMessage}</p>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link href={`/esami/${exam.id}`}>Apri scheda</Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="tabella">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Elenco degli esami con preparazione e rischio</caption>
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th scope="col" className="p-3 font-medium">Esame</th>
                  <th scope="col" className="p-3 font-medium">Stato</th>
                  <th scope="col" className="p-3 font-medium">Appello</th>
                  <th scope="col" className="p-3 font-medium">Preparazione</th>
                  <th scope="col" className="p-3 font-medium">Stato</th>
                  <th scope="col" className="p-3 font-medium">Rischio</th>
                  <th scope="col" className="p-3 font-medium">Ore rimanenti</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((exam) => (
                  <tr key={exam.id} className="border-t">
                    <td className="p-3">
                      <Link
                        href={`/esami/${exam.id}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <span
                          className={`h-6 w-1 shrink-0 rounded-full ${
                            URGENCY_BAR[urgencyFromDaysRemaining(exam.daysRemaining).level]
                          }`}
                          aria-hidden
                        />
                        <ExamIcon icon={exam.icon} color={exam.color} size={16} />
                        {exam.shortName}
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground">{STATUS_LABELS[exam.status]}</td>
                    <td className="p-3 text-muted-foreground">
                      {exam.primaryDate ? formatShortDate(exam.primaryDate) : '—'}
                    </td>
                    <td className="p-3 tabular-nums">{percent(exam.readiness)}%</td>
                    <td className="p-3">
                      <ExamSignalChips
                        hasMaterial={exam.hasMaterial}
                        hasBookedSession={exam.primaryDate !== null}
                        daysRemaining={exam.daysRemaining}
                        compact
                      />
                    </td>
                    <td className="p-3">
                      <RiskBadge risk={exam.risk} compact />
                    </td>
                    <td className="p-3 tabular-nums">{formatMinutes(exam.remainingMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="grafo">
          <DependencyGraph
            exams={exams.map((exam) => ({ id: exam.id, label: exam.shortName, status: exam.status }))}
            dependencies={dependencies}
          />
        </TabsContent>

        <TabsContent value="calendario">
          <SessionCalendar
            today={today}
            items={exams
              .filter((exam) => exam.nextDate)
              .map((exam) => ({
                examId: exam.id,
                label: exam.shortName,
                date: exam.nextDate as IsoDate,
                color: exam.color,
                isPrimary: exam.primaryDate === exam.nextDate,
              }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
