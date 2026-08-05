'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatItalianDate, relativeDayLabel } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';

interface UpcomingItem {
  id: string;
  topicTitle: string;
  examName: string;
  dueDate: IsoDate;
  reason: string | null;
}

export function UpcomingReviews({ items, today }: { items: UpcomingItem[]; today: IsoDate }) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Prossimi ripassi programmati</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border p-3">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{item.topicTitle}</span>
                <span className="text-muted-foreground">
                  {formatItalianDate(item.dueDate)} · {relativeDayLabel(today, item.dueDate)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{item.examName}</p>
              {item.reason ? (
                <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
