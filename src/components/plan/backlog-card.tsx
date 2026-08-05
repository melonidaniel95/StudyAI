'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { CalendarSync } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { rescheduleBacklogAction } from '@/server/actions/planning';

export function BacklogCard({ count }: { count: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CalendarSync className="h-4 w-4 text-accent" aria-hidden />
            {count} {count === 1 ? 'attività arretrata' : 'attività arretrate'}
          </p>
          <p className="text-sm text-muted-foreground">
            Le ridistribuiamo sui prossimi giorni, senza ammassarle tutte domani.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await rescheduleBacklogAction();
              if (result.ok) toast.success(result.message);
              else toast.error(result.message);
              router.refresh();
            })
          }
        >
          Ridistribuisci
        </Button>
      </CardContent>
    </Card>
  );
}
