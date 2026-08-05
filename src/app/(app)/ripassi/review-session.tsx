'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2, Clock3, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { gradeReviewAction, postponeReviewAction } from '@/server/actions/reviews';
import { RECALL_GRADE_LABELS, type IsoDate, type RecallGrade } from '@/lib/domain/types';
import { formatItalianDate } from '@/lib/domain/dates';

interface ReviewItem {
  id: string;
  topicId: string;
  topicTitle: string;
  examName: string;
  dueDate: IsoDate;
  intervalDays: number;
  repetition: number;
  reason: string | null;
}

const GRADES: RecallGrade[] = [0, 1, 2, 3, 4];

const GRADE_STYLE: Record<RecallGrade, string> = {
  0: 'border-[hsl(var(--risk-red))]/40 hover:bg-[hsl(var(--risk-red))]/10',
  1: 'border-[hsl(var(--risk-orange))]/40 hover:bg-[hsl(var(--risk-orange))]/10',
  2: 'border-[hsl(var(--risk-yellow))]/40 hover:bg-[hsl(var(--risk-yellow))]/10',
  3: 'border-[hsl(var(--risk-green))]/40 hover:bg-[hsl(var(--risk-green))]/10',
  4: 'border-[hsl(var(--risk-green))]/60 hover:bg-[hsl(var(--risk-green))]/15',
};

export function ReviewSession({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [lastExplanation, setLastExplanation] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = items[index];
  const done = index >= items.length;

  function next() {
    setRevealed(false);
    setIndex((value) => value + 1);
  }

  function grade(value: RecallGrade) {
    if (!current) return;
    startTransition(async () => {
      const result = await gradeReviewAction(current.id, value);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setLastExplanation(result.explanation ?? null);
      toast.success('Ripasso registrato', { description: result.explanation, duration: 8000 });
      next();
      router.refresh();
    });
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-[hsl(var(--risk-green))]" aria-hidden />
          <p className="font-medium">Ripassi completati</p>
          {lastExplanation ? (
            <p className="text-sm text-muted-foreground">{lastExplanation}</p>
          ) : null}
          <Button variant="outline" onClick={() => router.refresh()}>
            Aggiorna
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!current) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Ripasso {index + 1} di {items.length}
          </span>
          <span>Scadenza: {formatItalianDate(current.dueDate)}</span>
        </div>
        <Progress
          value={Math.round((index / items.length) * 100)}
          aria-label={`Avanzamento ripassi: ${index} di ${items.length}`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>{current.topicTitle}</span>
            <Badge variant="muted">{current.examName}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted/50 p-4 text-sm">
            <p className="font-medium">Prova a spiegare l’argomento senza guardare.</p>
            <p className="mt-1 text-muted-foreground">
              Dillo a voce alta come se lo spiegassi a qualcun altro: elenca i concetti chiave, le
              formule e un esempio. Solo dopo apri il materiale per verificare.
            </p>
          </div>

          <Button variant="outline" onClick={() => setRevealed((value) => !value)}>
            {revealed ? (
              <>
                <EyeOff className="h-4 w-4" aria-hidden /> Nascondi i dettagli
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" aria-hidden /> Ho provato: mostra i dettagli
              </>
            )}
          </Button>

          {revealed ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {current.reason ??
                  `Ripasso numero ${current.repetition + 1}, intervallo attuale ${current.intervalDays} giorni.`}
              </p>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Com’è andato il richiamo?</legend>
                <div className="grid gap-2">
                  {GRADES.map((value) => (
                    <Button
                      key={value}
                      variant="outline"
                      className={`h-auto justify-start py-3 text-left ${GRADE_STYLE[value]}`}
                      disabled={pending}
                      onClick={() => grade(value)}
                    >
                      <span className="mr-2 font-semibold tabular-nums">{value}</span>
                      {RECALL_GRADE_LABELS[value]}
                    </Button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await postponeReviewAction(current.id, 1);
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                  next();
                  router.refresh();
                })
              }
            >
              <Clock3 className="h-4 w-4" aria-hidden />
              Rimanda a domani
            </Button>
            <Button variant="ghost" size="sm" onClick={next} disabled={pending}>
              Salta per ora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
