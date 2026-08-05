'use client';

import { useMemo } from 'react';
import { formatItalianDate, relativeDayLabel } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';
import { Badge } from '@/components/ui/badge';

interface SessionItem {
  examId: string;
  label: string;
  date: IsoDate;
  color: string;
  isPrimary: boolean;
}

/** Elenco cronologico degli appelli, raggruppato per mese. */
export function SessionCalendar({ items, today }: { items: SessionItem[]; today: IsoDate }) {
  const grouped = useMemo(() => {
    const map = new Map<string, SessionItem[]>();
    for (const item of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
      const key = item.date.slice(0, 7);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [items]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun appello futuro registrato.</p>;
  }

  return (
    <div className="space-y-4">
      {grouped.map(([month, list]) => (
        <div key={month}>
          <h3 className="mb-2 text-sm font-medium capitalize text-muted-foreground">
            {formatItalianDate(`${month}-01`, 'MMMM yyyy')}
          </h3>
          <ul className="space-y-2">
            {list.map((item) => (
              <li
                key={`${item.examId}-${item.date}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                  <span className="font-medium">{item.label}</span>
                  {item.isPrimary ? <Badge variant="default">Principale</Badge> : null}
                </span>
                <span className="text-muted-foreground">
                  {formatItalianDate(item.date)} · {relativeDayLabel(today, item.date)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
