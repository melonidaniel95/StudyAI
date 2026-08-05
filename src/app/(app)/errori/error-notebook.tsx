'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { BookMarked, Check, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmButton } from '@/components/shared/confirm-button';
import {
  createErrorAction,
  deleteErrorAction,
  retryErrorAction,
  updateErrorAction,
} from '@/server/actions/errors';
import { formatShortDate } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';
import type { ErrorTypeValue } from '@/types/db';

const ERROR_TYPE_LABELS: Record<ErrorTypeValue, string> = {
  concettuale: 'Concettuale',
  calcolo: 'Calcolo',
  distrazione: 'Distrazione',
  formula_dimenticata: 'Formula dimenticata',
  interpretazione: 'Interpretazione',
  procedimento_incompleto: 'Procedimento incompleto',
  gestione_tempo: 'Gestione del tempo',
  esposizione_orale: 'Risposta orale poco chiara',
};

interface ErrorRow {
  id: string;
  examId: string;
  topicId: string | null;
  sourceType: string;
  questionText: string;
  givenAnswer: string | null;
  correctAnswer: string | null;
  errorType: ErrorTypeValue;
  cause: string | null;
  correction: string | null;
  occurredOn: IsoDate;
  repetitions: number;
  lastOutcome: string;
  nextAttemptDate: IsoDate | null;
  resolved: boolean;
}

export function ErrorNotebook({
  today,
  exams,
  topics,
  errors,
}: {
  today: IsoDate;
  exams: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; title: string; examId: string }>;
  errors: ErrorRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [examFilter, setExamFilter] = useState('tutti');
  const [typeFilter, setTypeFilter] = useState<'tutti' | ErrorTypeValue>('tutti');

  const [newExamId, setNewExamId] = useState(exams[0]?.id ?? '');
  const [newTopicId, setNewTopicId] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [givenAnswer, setGivenAnswer] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [errorType, setErrorType] = useState<ErrorTypeValue>('concettuale');
  const [cause, setCause] = useState('');
  const [correction, setCorrection] = useState('');

  const examNames = new Map(exams.map((exam) => [exam.id, exam.name]));
  const topicTitles = new Map(topics.map((topic) => [topic.id, topic.title]));

  const open = errors.filter((error) => !error.resolved);
  const resolved = errors.filter((error) => error.resolved);

  const filtered = open.filter((error) => {
    if (examFilter !== 'tutti' && error.examId !== examFilter) return false;
    if (typeFilter !== 'tutti' && error.errorType !== typeFilter) return false;
    return true;
  });

  const byType = useMemo(() => {
    const map = new Map<ErrorTypeValue, number>();
    for (const error of open) {
      map.set(error.errorType, (map.get(error.errorType) ?? 0) + error.repetitions);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [open]);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message, { duration: 7000 });
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <Tabs defaultValue="aperti">
      <TabsList>
        <TabsTrigger value="aperti">Da rifare ({open.length})</TabsTrigger>
        <TabsTrigger value="risolti">Risolti ({resolved.length})</TabsTrigger>
        <TabsTrigger value="nuovo">Aggiungi</TabsTrigger>
      </TabsList>

      <TabsContent value="aperti" className="space-y-4">
        {byType.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Errori più frequenti</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2 text-sm">
                {byType.map(([type, count]) => (
                  <li key={type}>
                    <Badge variant={count >= 3 ? 'accent' : 'muted'}>
                      {ERROR_TYPE_LABELS[type]}: {count}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <select
            value={examFilter}
            onChange={(event) => setExamFilter(event.target.value)}
            aria-label="Filtra per esame"
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="tutti">Tutti gli esami</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
            aria-label="Filtra per tipo di errore"
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="tutti">Tutti i tipi</option>
            {Object.entries(ERROR_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={BookMarked}
            title="Nessun errore da rifare"
            description="Gli errori arrivano qui automaticamente dagli esercizi sbagliati e dalle sessioni. Puoi anche aggiungerli a mano."
          />
        ) : (
          <ul className="space-y-3">
            {filtered.map((error) => (
              <li key={error.id}>
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{error.questionText}</p>
                      <span className="flex flex-wrap gap-1.5">
                        <Badge variant="muted">{examNames.get(error.examId) ?? 'Esame'}</Badge>
                        <Badge variant={error.repetitions >= 2 ? 'accent' : 'secondary'}>
                          {ERROR_TYPE_LABELS[error.errorType]}
                        </Badge>
                        {error.repetitions >= 2 ? (
                          <Badge variant="accent">Ripetuto {error.repetitions} volte</Badge>
                        ) : null}
                      </span>
                    </div>

                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      {error.givenAnswer ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">La tua risposta</dt>
                          <dd className="whitespace-pre-wrap">{error.givenAnswer}</dd>
                        </div>
                      ) : null}
                      {error.correctAnswer ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Risposta corretta</dt>
                          <dd className="whitespace-pre-wrap">{error.correctAnswer}</dd>
                        </div>
                      ) : null}
                    </dl>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`cause-${error.id}`} className="text-xs">
                          Causa
                        </Label>
                        <Textarea
                          id={`cause-${error.id}`}
                          defaultValue={error.cause ?? ''}
                          rows={2}
                          onBlur={(event) => {
                            if (event.target.value !== (error.cause ?? '')) {
                              run(() => updateErrorAction(error.id, { cause: event.target.value }));
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`corr-${error.id}`} className="text-xs">
                          Correzione
                        </Label>
                        <Textarea
                          id={`corr-${error.id}`}
                          defaultValue={error.correction ?? ''}
                          rows={2}
                          onBlur={(event) => {
                            if (event.target.value !== (error.correction ?? '')) {
                              run(() =>
                                updateErrorAction(error.id, { correction: event.target.value }),
                              );
                            }
                          }}
                        />
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {error.topicId ? `${topicTitles.get(error.topicId) ?? 'Argomento'} · ` : ''}
                      registrato il {formatShortDate(error.occurredOn)}
                      {error.nextAttemptDate
                        ? ` · prossimo tentativo ${formatShortDate(error.nextAttemptDate)}`
                        : ''}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => retryErrorAction(error.id, 'risolto'))}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        Rifatto correttamente
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => run(() => retryErrorAction(error.id, 'parziale'))}
                      >
                        Parzialmente
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => retryErrorAction(error.id, 'non_risolto'))}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        Sbagliato di nuovo
                      </Button>
                      <ConfirmButton
                        trigger={
                          <Button size="sm" variant="ghost">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </Button>
                        }
                        title="Eliminare la voce?"
                        description="L’operazione non può essere annullata."
                        onConfirm={async () => {
                          const result = await deleteErrorAction(error.id);
                          if (result.ok) toast.success(result.message);
                          else toast.error(result.message);
                          router.refresh();
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="risolti">
        {resolved.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun errore archiviato.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {resolved.map((error) => (
              <li key={error.id} className="rounded-md border p-3">
                <p className="font-medium">{error.questionText}</p>
                <p className="text-xs text-muted-foreground">
                  {examNames.get(error.examId) ?? 'Esame'} · risolto dopo {error.repetitions}{' '}
                  {error.repetitions === 1 ? 'tentativo' : 'tentativi'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="nuovo">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Aggiungi un errore</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="n-exam">Esame</Label>
                <select
                  id="n-exam"
                  value={newExamId}
                  onChange={(event) => {
                    setNewExamId(event.target.value);
                    setNewTopicId('');
                  }}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-topic">Argomento</Label>
                <select
                  id="n-topic"
                  value={newTopicId}
                  onChange={(event) => setNewTopicId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">Nessuno</option>
                  {topics
                    .filter((topic) => topic.examId === newExamId)
                    .map((topic) => (
                      <option key={topic.id} value={topic.id}>
                        {topic.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="n-question">Domanda o esercizio</Label>
              <Textarea
                id="n-question"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="n-given">Risposta fornita</Label>
                <Textarea
                  id="n-given"
                  value={givenAnswer}
                  onChange={(e) => setGivenAnswer(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-correct">Risposta corretta</Label>
                <Textarea
                  id="n-correct"
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="n-type">Tipologia di errore</Label>
              <select
                id="n-type"
                value={errorType}
                onChange={(event) => setErrorType(event.target.value as ErrorTypeValue)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-72"
              >
                {Object.entries(ERROR_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="n-cause">Causa</Label>
                <Input id="n-cause" value={cause} onChange={(e) => setCause(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="n-correction">Correzione</Label>
                <Input
                  id="n-correction"
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                />
              </div>
            </div>

            <Button
              loading={pending}
              disabled={!newExamId || questionText.trim().length < 3}
              onClick={() => {
                const formData = new FormData();
                formData.set('examId', newExamId);
                formData.set('topicId', newTopicId);
                formData.set('questionText', questionText);
                formData.set('givenAnswer', givenAnswer);
                formData.set('correctAnswer', correctAnswer);
                formData.set('errorType', errorType);
                formData.set('cause', cause);
                formData.set('correction', correction);
                formData.set('occurredOn', today);
                run(() => createErrorAction(formData));
                setQuestionText('');
                setGivenAnswer('');
                setCorrectAnswer('');
                setCause('');
                setCorrection('');
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Aggiungi al quaderno
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
