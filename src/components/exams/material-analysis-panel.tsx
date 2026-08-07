'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Brain, CheckCircle2, Info, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  analyzeNextBatchAction,
  cancelMaterialAnalysisAction,
  startMaterialAnalysisAction,
} from '@/server/actions/material-analysis';

interface AnalysisState {
  id: string;
  status: string;
  segmentsDone: number;
  segmentsTotal: number;
  questions: number;
  exercises: number;
  flashcards: number;
  summary: string | null;
}

/**
 * Analisi del materiale con l'AI.
 *
 * Procede a lotti e richiama sé stessa finché non ha finito: una materia con
 * decine di lezioni viene elaborata poco per volta, con avanzamento visibile e
 * possibilità di interrompere senza perdere quello che è già stato fatto.
 */
export function MaterialAnalysisPanel({
  examId,
  segmentsCount,
  analyzedCount,
  aiEnabled,
  initial,
}: {
  examId: string;
  segmentsCount: number;
  analyzedCount: number;
  aiEnabled: boolean;
  initial: AnalysisState | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<AnalysisState | null>(initial);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const run = useCallback(
    async (analysisId: string) => {
      setRunning(true);
      stopRef.current = false;

      let created = { questions: 0, exercises: 0, flashcards: 0 };

      // Un lotto alla volta, finché il server non dichiara concluso.
      for (let iterazione = 0; iterazione < 200; iterazione += 1) {
        if (stopRef.current) break;

        const result = await analyzeNextBatchAction(analysisId);

        if (!result.ok) {
          toast.error(result.message);
          break;
        }

        created = {
          questions: created.questions + (result.created?.questions ?? 0),
          exercises: created.exercises + (result.created?.exercises ?? 0),
          flashcards: created.flashcards + (result.created?.flashcards ?? 0),
        };

        setState((current) =>
          current
            ? {
                ...current,
                segmentsDone: result.done ?? current.segmentsDone,
                segmentsTotal: result.total ?? current.segmentsTotal,
                questions: current.questions + (result.created?.questions ?? 0),
                exercises: current.exercises + (result.created?.exercises ?? 0),
                flashcards: current.flashcards + (result.created?.flashcards ?? 0),
                status: result.finished ? 'completata' : 'in_corso',
              }
            : current,
        );

        if (result.finished) {
          toast.success(result.message, {
            description: `Creati ${created.questions} domande, ${created.exercises} esercizi e ${created.flashcards} flashcard, tutti da verificare.`,
            duration: 12000,
          });
          break;
        }
      }

      setRunning(false);
      router.refresh();
    },
    [router],
  );

  async function start() {
    const result = await startMaterialAnalysisAction(examId);
    if (!result.ok || !result.analysisId) {
      toast.error(result.message);
      return;
    }
    setState({
      id: result.analysisId,
      status: 'in_corso',
      segmentsDone: result.done ?? 0,
      segmentsTotal: result.total ?? segmentsCount,
      questions: 0,
      exercises: 0,
      flashcards: 0,
      summary: null,
    });
    toast.info(result.message);
    void run(result.analysisId);
  }

  if (segmentsCount === 0) return null;

  const done = state?.segmentsDone ?? analyzedCount;
  const total = state?.segmentsTotal ?? segmentsCount;
  const percentuale = total > 0 ? Math.round((done / total) * 100) : 0;
  const completata = state?.status === 'completata' || (analyzedCount >= segmentsCount && segmentsCount > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Brain className="h-4 w-4" aria-hidden />
            Analisi del materiale con l’AI
          </span>
          {completata ? (
            <Badge variant="default">
              <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
              Completata
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          L’AI legge il testo delle tue slide e per ogni blocco stabilisce la difficoltà reale del
          contenuto, i concetti chiave e genera domande, esercizi e flashcard. Le stime del piano
          usano poi quella difficoltà al posto di quella impostata a occhio.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!aiEnabled ? (
          <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground">
              L’assistente AI è disattivato: nessun dato viene inviato finché non lo attivi tu.{' '}
              <Link href="/impostazioni" className="text-primary underline-offset-4 hover:underline">
                Attivalo dalle impostazioni
              </Link>
              .
            </p>
          </div>
        ) : null}

        {state || analyzedCount > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>
                {done} blocchi analizzati su {total}
              </span>
              <span className="font-semibold tabular-nums">{percentuale}%</span>
            </div>
            <Progress value={percentuale} aria-label="Avanzamento dell’analisi" />
          </div>
        ) : null}

        {state && (state.questions > 0 || state.exercises > 0 || state.flashcards > 0) ? (
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge variant="secondary">{state.questions} domande</Badge>
            <Badge variant="secondary">{state.exercises} esercizi</Badge>
            <Badge variant="secondary">{state.flashcards} flashcard</Badge>
            <Badge variant="accent">Da verificare</Badge>
          </div>
        ) : null}

        {state?.summary ? <p className="text-sm text-muted-foreground">{state.summary}</p> : null}

        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button
              variant="outline"
              onClick={() => {
                stopRef.current = true;
                if (state) void cancelMaterialAnalysisAction(state.id);
                toast.info('Interruzione al termine del blocco in corso.');
              }}
            >
              <Square className="h-4 w-4" aria-hidden />
              Interrompi
            </Button>
          ) : (
            <Button onClick={start} disabled={!aiEnabled} loading={running}>
              <Brain className="h-4 w-4" aria-hidden />
              {analyzedCount > 0 && analyzedCount < segmentsCount
                ? 'Riprendi l’analisi'
                : analyzedCount >= segmentsCount
                  ? 'Rianalizza il materiale'
                  : 'Analizza tutto il materiale'}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          L’analisi procede a lotti e puoi interromperla quando vuoi: i blocchi già analizzati
          restano validi. I contenuti generati sono marcati «Da verificare» e non sostituiscono
          niente di quello che hai scritto tu.
        </p>
      </CardContent>
    </Card>
  );
}
