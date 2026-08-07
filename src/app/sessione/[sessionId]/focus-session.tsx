'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Pause,
  Play,
  Square,
  Target,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { addInterruptionAction, completeSessionAction } from '@/server/actions/sessions';
import { enqueueSession } from '@/components/pwa/offline-sync';
import type { Exam, StudyResource, StudySession, StudyTask, SyllabusTopic } from '@/types/db';

const OFFLINE_KEY = 'studyai:sessione-in-corso';

interface SegmentInfo {
  id: string;
  title: string;
  pageStart: number;
  pageEnd: number;
  pagesDone: number;
}

interface FocusSessionProps {
  session: StudySession;
  exam: Exam | null;
  topic: SyllabusTopic | null;
  task: StudyTask | null;
  resources: StudyResource[];
  segment?: SegmentInfo | null;
}

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const CHECKLIST = [
  'Ho ripassato brevemente cosa so già su questo argomento',
  'Ho studiato attivamente, non solo riletto',
  'Ho provato a spiegare l’argomento a voce senza guardare',
  'Ho annotato dubbi ed errori',
];

export function FocusSession({
  session,
  exam,
  topic,
  task,
  resources,
  segment = null,
}: FocusSessionProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const plannedSeconds = Math.max(1, session.planned_minutes) * 60;
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [pauseSeconds, setPauseSeconds] = useState(0);
  const [interruptions, setInterruptions] = useState(session.interruptions);
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [doubts, setDoubts] = useState('');
  const [phase, setPhase] = useState<'studio' | 'chiusura'>('studio');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Conclusione guidata
  const [comprehension, setComprehension] = useState('3');
  const [recall, setRecall] = useState('3');
  const [objectiveCompleted, setObjectiveCompleted] = useState(true);
  const [difficulties, setDifficulties] = useState('');
  const [nextReviewDays, setNextReviewDays] = useState('');
  const [pagesCovered, setPagesCovered] = useState(
    segment ? String(Math.max(0, segment.pageEnd - segment.pageStart + 1 - segment.pagesDone)) : '',
  );
  const [addError, setAddError] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (running) setElapsed((value) => value + 1);
      else setPauseSeconds((value) => value + 1);
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  // Salvataggio locale: se la connessione cade il lavoro non si perde.
  useEffect(() => {
    const payload = {
      sessionId: session.id,
      examId: session.exam_id,
      topicId: session.topic_id,
      taskId: session.task_id,
      startedAt: session.started_at,
      elapsedSeconds: elapsed,
      doubts,
    };
    try {
      window.localStorage.setItem(OFFLINE_KEY, JSON.stringify(payload));
    } catch {
      // spazio non disponibile: si prosegue comunque
    }
  }, [elapsed, doubts, session]);

  const effectiveMinutes = useMemo(() => Math.max(0, Math.round(elapsed / 60)), [elapsed]);
  const progress = Math.min(100, Math.round((elapsed / plannedSeconds) * 100));

  const registerInterruption = useCallback(() => {
    setInterruptions((value) => value + 1);
    void addInterruptionAction(session.id);
  }, [session.id]);

  function finish() {
    // Senza rete la sessione viene messa in coda e sincronizzata alla riconnessione.
    if (offline) {
      enqueueSession({
        clientUuid: session.id,
        examId: session.exam_id,
        topicId: session.topic_id,
        taskId: session.task_id,
        startedAt: session.started_at,
        effectiveMinutes,
        comprehension: Number(comprehension),
        recall: Number(recall),
        objectiveCompleted,
        notes: [difficulties, doubts].filter(Boolean).join('\n'),
      });
      try {
        window.localStorage.removeItem(OFFLINE_KEY);
      } catch {
        // ignorato
      }
      toast.success('Sessione salvata sul dispositivo: verrà inviata appena torna la connessione.');
      router.push('/oggi');
      return;
    }

    const formData = new FormData();
    formData.set('sessionId', session.id);
    formData.set('effectiveMinutes', String(effectiveMinutes));
    formData.set('pauseMinutes', String(Math.round(pauseSeconds / 60)));
    formData.set('interruptions', String(interruptions));
    formData.set('comprehension', comprehension);
    formData.set('recall', recall);
    formData.set('objectiveCompleted', String(objectiveCompleted));
    formData.set('difficulties', difficulties);
    formData.set('doubts', doubts);
    if (nextReviewDays) formData.set('nextReviewDays', nextReviewDays);
    if (pagesCovered) formData.set('pagesCovered', pagesCovered);
    formData.set('addError', String(addError));
    formData.set('errorText', errorText);

    startTransition(async () => {
      const result = await completeSessionAction(formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      try {
        window.localStorage.removeItem(OFFLINE_KEY);
      } catch {
        // ignorato
      }
      toast.success(result.message, {
        description: result.reviewExplanation,
        duration: 9000,
      });
      router.push('/oggi');
      router.refresh();
    });
  }

  if (phase === 'chiusura') {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Come è andata?</h1>
          <p className="text-sm text-muted-foreground">
            Queste risposte servono a calcolare la preparazione reale e la data del prossimo ripasso.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-6 p-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">1. Quanto hai compreso?</legend>
              <RadioGroup value={comprehension} onValueChange={setComprehension} className="grid grid-cols-5 gap-2">
                {['1', '2', '3', '4', '5'].map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-sm"
                  >
                    <RadioGroupItem value={value} id={`comp-${value}`} />
                    {value}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                2. Quanto riesci a ricordare senza guardare?
              </legend>
              <RadioGroup value={recall} onValueChange={setRecall} className="grid grid-cols-5 gap-2">
                {['1', '2', '3', '4', '5'].map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-sm"
                  >
                    <RadioGroupItem value={value} id={`recall-${value}`} />
                    {value}
                  </label>
                ))}
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                È la risposta che pesa di più: la memoria si misura provando a ricordare, non
                rileggendo.
              </p>
            </fieldset>

            <div className="space-y-2">
              <p className="text-sm font-medium">3. Hai completato l’obiettivo della sessione?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={objectiveCompleted ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setObjectiveCompleted(true)}
                >
                  Sì
                </Button>
                <Button
                  type="button"
                  variant={!objectiveCompleted ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setObjectiveCompleted(false)}
                >
                  Solo in parte
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="difficulties">4. Quali difficoltà hai incontrato?</Label>
              <Textarea
                id="difficulties"
                value={difficulties}
                onChange={(event) => setDifficulties(event.target.value)}
                placeholder="Facoltativo"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="addError"
                  checked={addError}
                  onCheckedChange={(value) => setAddError(value === true)}
                />
                <Label htmlFor="addError">5. Aggiungi un errore o un dubbio al quaderno</Label>
              </div>
              {addError ? (
                <Textarea
                  value={errorText}
                  onChange={(event) => setErrorText(event.target.value)}
                  placeholder="Che cosa non ti è chiaro o dove hai sbagliato?"
                />
              ) : null}
            </div>

            {segment ? (
              <div className="space-y-1.5">
                <Label htmlFor="pagesCovered">
                  6. Quante pagine hai davvero coperto? (da {segment.pageStart} a {segment.pageEnd})
                </Label>
                <Input
                  id="pagesCovered"
                  type="number"
                  min={0}
                  max={5000}
                  value={pagesCovered}
                  onChange={(event) => setPagesCovered(event.target.value)}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Serve a tarare il ritmo: dopo qualche sessione StudyAI saprà quante pagine riesci a
                  fare davvero in un’ora e userà quel valore per pianificare.
                </p>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="nextReviewDays">
                {segment ? '7' : '6'}. Quando pensi di dover ripassare?
              </Label>
              <select
                id="nextReviewDays"
                value={nextReviewDays}
                onChange={(event) => setNextReviewDays(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Decidi tu in base a come è andata</option>
                <option value="1">Domani</option>
                <option value="2">Tra 2 giorni</option>
                <option value="3">Tra 3 giorni</option>
                <option value="7">Tra una settimana</option>
                <option value="14">Tra due settimane</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {offline ? (
          <p className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            Sei offline: i dati restano salvati sul dispositivo e potrai inviarli appena torna la
            connessione.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={finish} loading={pending}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {offline ? 'Salva sul dispositivo' : 'Salva e aggiorna il piano'}
          </Button>
          <Button variant="ghost" onClick={() => setPhase('studio')} disabled={pending}>
            Torna alla sessione
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{exam?.short_name ?? exam?.name ?? 'Esame'}</Badge>
          {topic ? <Badge>{topic.title}</Badge> : null}
        </div>
        <h1 className="text-xl font-semibold">{task?.title ?? 'Sessione di studio'}</h1>
        {segment ? (
          <p className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
            Copri le pagine {segment.pageStart}-{segment.pageEnd}
            {segment.pagesDone > 0 ? ` · ne hai già fatte ${segment.pagesDone}` : ''}
          </p>
        ) : null}
        {task?.objective ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Target className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {task.objective}
          </p>
        ) : null}
      </div>

      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <p
            className="text-5xl font-semibold tabular-nums"
            role="timer"
            aria-live="off"
            aria-label={`Tempo trascorso ${formatClock(elapsed)}`}
          >
            {formatClock(elapsed)}
          </p>
          <p className="text-sm text-muted-foreground">
            Obiettivo: {session.planned_minutes} minuti · {progress}%
            {pauseSeconds > 0 ? ` · pause ${formatClock(pauseSeconds)}` : ''}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant={running ? 'outline' : 'default'} onClick={() => setRunning((v) => !v)}>
              {running ? (
                <>
                  <Pause className="h-4 w-4" aria-hidden /> Pausa
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden /> Riprendi
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={registerInterruption}>
              <AlertCircle className="h-4 w-4" aria-hidden />
              Interruzione ({interruptions})
            </Button>
            <Button onClick={() => setPhase('chiusura')}>
              <Square className="h-4 w-4" aria-hidden />
              Concludi
            </Button>
          </div>
        </CardContent>
      </Card>

      {resources.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4" aria-hidden />
              Materiali collegati
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {resources.map((resource) => (
              <p key={resource.id} className="flex items-center gap-2">
                {resource.url ? (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {resource.title}
                    <ExternalLink className="ml-1 inline h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <Link
                    href="/risorse"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {resource.title}
                  </Link>
                )}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Checklist della sessione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST.map((item, index) => (
            <label key={item} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={checked[index] ?? false}
                onCheckedChange={(value) =>
                  setChecked((current) =>
                    current.map((item2, i) => (i === index ? value === true : item2)),
                  )
                }
                aria-label={item}
              />
              <span>{item}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dubbi da annotare</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={doubts}
            onChange={(event) => setDoubts(event.target.value)}
            placeholder="Scrivi qui ciò che non torna: lo ritroverai nel quaderno degli errori."
            aria-label="Dubbi"
          />
        </CardContent>
      </Card>
    </div>
  );
}
