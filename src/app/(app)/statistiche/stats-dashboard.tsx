'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Stat } from '@/components/shared/stat';
import { EmptyState } from '@/components/shared/empty-state';
import { BarChart3, Clock, Flame, ListChecks, Target } from 'lucide-react';
import { formatItalianDate, formatMinutes } from '@/lib/domain/dates';
import { percent } from '@/lib/utils';

interface StatsDashboardProps {
  weeklyMinutes: Array<{ week: string; minutes: number }>;
  plannedVsDone: Array<{ week: string; planned: number; done: number }>;
  recallTrend: Array<{ week: string; recall: number }>;
  perExam: Array<{ name: string; minutes: number; readiness: number; color: string }>;
  errorsByType: Array<{ type: string; count: number }>;
  summary: {
    totalMinutes: number;
    sessions: number;
    completionRate: number | null;
    exerciseAccuracy: number | null;
    streak: number;
    estimateAccuracyMinutes: number | null;
  };
}

const ERROR_LABELS: Record<string, string> = {
  concettuale: 'Concettuale',
  calcolo: 'Calcolo',
  distrazione: 'Distrazione',
  formula_dimenticata: 'Formula dimenticata',
  interpretazione: 'Interpretazione',
  procedimento_incompleto: 'Procedimento incompleto',
  gestione_tempo: 'Gestione del tempo',
  esposizione_orale: 'Esposizione orale',
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

export function StatsDashboard({
  weeklyMinutes,
  plannedVsDone,
  recallTrend,
  perExam,
  errorsByType,
  summary,
}: StatsDashboardProps) {
  if (summary.sessions === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Non ci sono ancora dati"
        description="Le statistiche compaiono dopo le prime sessioni registrate. Bastano pochi giorni per vedere l’andamento reale."
      />
    );
  }

  const weeklyData = weeklyMinutes.map((item) => ({
    settimana: formatItalianDate(item.week, 'd MMM'),
    Ore: Math.round((item.minutes / 60) * 10) / 10,
  }));

  const comparisonData = plannedVsDone.map((item) => ({
    settimana: formatItalianDate(item.week, 'd MMM'),
    Pianificate: Math.round((item.planned / 60) * 10) / 10,
    Effettive: Math.round((item.done / 60) * 10) / 10,
  }));

  const recallData = recallTrend.map((item) => ({
    settimana: formatItalianDate(item.week, 'd MMM'),
    Richiamo: Math.round(item.recall * 10) / 10,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Ore totali" value={formatMinutes(summary.totalMinutes)} icon={Clock} />
        <Stat
          label="Attività completate"
          value={summary.completionRate === null ? '—' : `${percent(summary.completionRate)}%`}
          icon={ListChecks}
          hint="Rispetto a quelle pianificate"
        />
        <Stat
          label="Esercizi corretti"
          value={summary.exerciseAccuracy === null ? '—' : `${percent(summary.exerciseAccuracy)}%`}
          icon={Target}
        />
        <Stat
          label="Giorni consecutivi"
          value={String(summary.streak)}
          icon={Flame}
          hint="Un giorno di pausa non azzera i progressi"
        />
      </div>

      {summary.estimateAccuracyMinutes !== null ? (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          In media le tue sessioni durano {Math.round(summary.estimateAccuracyMinutes)} minuti in più
          o in meno rispetto alla stima. StudyOS usa questo scarto per rendere il piano più realistico.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ore studiate per settimana</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="h-56"
              role="img"
              aria-label={`Ore per settimana: ${weeklyData.map((d) => `${d.settimana} ${d.Ore} ore`).join(', ')}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="settimana" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" unit="h" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="Ore" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ore pianificate rispetto a quelle reali</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="h-56"
              role="img"
              aria-label={`Confronto pianificato e reale: ${comparisonData
                .map((d) => `${d.settimana}: ${d.Effettive} su ${d.Pianificate}`)
                .join(', ')}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="settimana" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" unit="h" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Pianificate" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Effettive" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Andamento della memoria</CardTitle>
          </CardHeader>
          <CardContent>
            {recallData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Serve qualche sessione conclusa con l’autovalutazione del richiamo.
              </p>
            ) : (
              <div
                className="h-56"
                role="img"
                aria-label={`Media del richiamo per settimana: ${recallData
                  .map((d) => `${d.settimana}: ${d.Richiamo} su 5`)
                  .join(', ')}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={recallData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="settimana" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="Richiamo"
                      stroke="hsl(var(--accent))"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Errori più frequenti</CardTitle>
          </CardHeader>
          <CardContent>
            {errorsByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun errore registrato.</p>
            ) : (
              <div
                className="h-56"
                role="img"
                aria-label={`Errori per tipologia: ${errorsByType
                  .map((d) => `${ERROR_LABELS[d.type] ?? d.type}: ${d.count}`)
                  .join(', ')}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={errorsByType.map((item) => ({
                        name: ERROR_LABELS[item.type] ?? item.type,
                        value: item.count,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      label={{ fontSize: 11 }}
                    >
                      {errorsByType.map((item, index) => (
                        <Cell
                          key={item.type}
                          fill={
                            [
                              'hsl(var(--primary))',
                              'hsl(var(--accent))',
                              'hsl(var(--secondary))',
                              'hsl(var(--risk-orange))',
                              'hsl(var(--risk-yellow))',
                            ][index % 5]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tempo e preparazione per esame</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="sr-only">Ore studiate e preparazione per ciascun esame</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="pb-2 font-medium">Esame</th>
                  <th scope="col" className="pb-2 font-medium">Ore</th>
                  <th scope="col" className="pb-2 font-medium">Preparazione</th>
                </tr>
              </thead>
              <tbody>
                {perExam
                  .sort((a, b) => b.minutes - a.minutes)
                  .map((item) => (
                    <tr key={item.name} className="border-t">
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                            aria-hidden
                          />
                          {item.name}
                        </span>
                      </td>
                      <td className="py-2 tabular-nums">{formatMinutes(item.minutes)}</td>
                      <td className="py-2 tabular-nums">{percent(item.readiness)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
