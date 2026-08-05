'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatItalianDate, weekStartIso } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';

interface DayLoad {
  date: IsoDate;
  plannable: number;
  raw: number;
  planned: number;
}

/** Carico settimanale: ore pianificate rispetto alle ore pianificabili. */
export function WeeklyLoadChart({ days }: { days: DayLoad[] }) {
  const data = useMemo(() => {
    const map = new Map<IsoDate, { planned: number; plannable: number }>();
    for (const day of days) {
      const key = weekStartIso(day.date);
      const entry = map.get(key) ?? { planned: 0, plannable: 0 };
      entry.planned += day.planned;
      entry.plannable += day.plannable;
      map.set(key, entry);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, value]) => ({
        settimana: formatItalianDate(weekStart, 'd MMM'),
        Pianificato: Math.round((value.planned / 60) * 10) / 10,
        Pianificabile: Math.round((value.plannable / 60) * 10) / 10,
      }));
  }, [days]);

  const description = data
    .map((item) => `${item.settimana}: ${item.Pianificato} ore su ${item.Pianificabile} pianificabili`)
    .join('; ');

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Carico settimanale</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56" role="img" aria-label={`Carico settimanale. ${description}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="settimana" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" unit="h" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value} ore`, '']}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Pianificabile" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Pianificato" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="sr-only">{description}</p>
      </CardContent>
    </Card>
  );
}
