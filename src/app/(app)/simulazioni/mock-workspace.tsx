'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FlaskConical, Plus, Trash2, TrendingUp } from 'lucide-react';
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
  createMockExamAction,
  deleteMockExamAction,
  recordMockAttemptAction,
} from '@/server/actions/mock-exams';
import { formatShortDate } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';
import type { MockExamKind } from '@/types/db';

interface MockRow {
  id: string;
  examId: string;
  title: string;
  kind: MockExamKind;
  durationMinutes: number;
  maxScore: number;
  passThreshold: number;
  topicIds: string[];
}

interface AttemptRow {
  id: string;
  mockExamId: string;
  examId: string;
  date: IsoDate;
  score: number | null;
  maxScore: number;
  minutesUsed: number | null;
  passed: boolean | null;
  selfEvaluation: number | null;
  weakPoints: string | null;
}

const KIND_LABELS: Record<MockExamKind, string> = {
  scritto: 'Scritto',
  orale: 'Orale',
  quiz: 'Quiz',
  misto: 'Misto',
};

export function MockWorkspace({
  today,
  exams,
  mocks,
  attempts,
}: {
  today: IsoDate;
  exams: Array<{
    id: string;
    name: string;
    kind: string;
    examDate: IsoDate | null;
    daysRemaining: number | null;
    topics: Array<{ id: string; title: string }>;
  }>;
  mocks: MockRow[];
  attempts: AttemptRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [newExamId, setNewExamId] = useState(exams[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MockExamKind>('scritto');
  const [duration, setDuration] = useState('90');
  const [maxScore, setMaxScore] = useState('30');
  const [threshold, setThreshold] = useState('18');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);

  const [recording, setRecording] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [minutesUsed, setMinutesUsed] = useState('');
  const [selfEvaluation, setSelfEvaluation] = useState('3');
  const [weakPoints, setWeakPoints] = useState('');

  const examNames = new Map(exams.map((exam) => [exam.id, exam.name]));
  const selectedExam = exams.find((exam) => exam.id === newExamId);

  const reminders = exams.filter(
    (exam) =>
      exam.daysRemaining !== null &&
      exam.daysRemaining <= 14 &&
      exam.daysRemaining >= 0 &&
      !attempts.some((attempt) => attempt.examId === exam.id && attempt.date >= today.slice(0, 4)),
  );

  function attemptsFor(mockId: string) {
    return attempts
      .filter((attempt) => attempt.mockExamId === mockId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return (
    <Tabs defaultValue="elenco">
      <TabsList>
        <TabsTrigger value="elenco">Simulazioni</TabsTrigger>
        <TabsTrigger value="nuova">Configura</TabsTrigger>
      </TabsList>

      <TabsContent value="elenco" className="space-y-4">
        {reminders.length > 0 ? (
          <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
            <p className="font-medium">Simulazioni consigliate</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {reminders.map((exam) => (
                <li key={exam.id}>
                  • {exam.name}: mancano {exam.daysRemaining} giorni e non risultano simulazioni
                  recenti.
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {mocks.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="Nessuna simulazione configurata"
            description="Configura una prova a tempo con punteggio e soglia di superamento: è il modo migliore per capire se sei davvero pronto."
          />
        ) : (
          <ul className="space-y-3">
            {mocks.map((mock) => {
              const list = attemptsFor(mock.id);
              const last = list[list.length - 1];
              const previous = list[list.length - 2];
              return (
                <li key={mock.id}>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{mock.title}</span>
                        <span className="flex flex-wrap gap-1.5">
                          <Badge variant="muted">{examNames.get(mock.examId) ?? 'Esame'}</Badge>
                          <Badge variant="secondary">{KIND_LABELS[mock.kind]}</Badge>
                          <Badge variant="muted">{mock.durationMinutes} min</Badge>
                          <Badge variant="muted">
                            soglia {mock.passThreshold}/{mock.maxScore}
                          </Badge>
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {list.length > 0 ? (
                        <div className="space-y-1 text-sm">
                          <p className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
                            Ultimo tentativo: {last?.score}/{last?.maxScore} del{' '}
                            {last ? formatShortDate(last.date) : ''}
                            {previous && last && previous.score !== null && last.score !== null ? (
                              <span className="text-muted-foreground">
                                {last.score >= previous.score
                                  ? ` (+${(last.score - previous.score).toFixed(1)} rispetto al precedente)`
                                  : ` (${(last.score - previous.score).toFixed(1)} rispetto al precedente)`}
                              </span>
                            ) : null}
                          </p>
                          {last?.weakPoints ? (
                            <p className="text-xs text-muted-foreground">
                              Punti deboli: {last.weakPoints}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {list.length} {list.length === 1 ? 'tentativo' : 'tentativi'} registrati
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Nessun tentativo registrato.</p>
                      )}

                      {recording === mock.id ? (
                        <div className="space-y-3 rounded-md border p-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="space-y-1.5">
                              <Label htmlFor={`score-${mock.id}`}>Punteggio</Label>
                              <Input
                                id={`score-${mock.id}`}
                                type="number"
                                min={0}
                                max={mock.maxScore}
                                step="0.5"
                                value={score}
                                onChange={(event) => setScore(event.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`min-${mock.id}`}>Minuti usati</Label>
                              <Input
                                id={`min-${mock.id}`}
                                type="number"
                                min={0}
                                max={600}
                                value={minutesUsed}
                                onChange={(event) => setMinutesUsed(event.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`self-${mock.id}`}>Autovalutazione (1-5)</Label>
                              <Input
                                id={`self-${mock.id}`}
                                type="number"
                                min={1}
                                max={5}
                                value={selfEvaluation}
                                onChange={(event) => setSelfEvaluation(event.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`weak-${mock.id}`}>Punti deboli emersi</Label>
                            <Textarea
                              id={`weak-${mock.id}`}
                              value={weakPoints}
                              onChange={(event) => setWeakPoints(event.target.value)}
                              rows={3}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              loading={pending}
                              disabled={!score}
                              onClick={() => {
                                const formData = new FormData();
                                formData.set('mockExamId', mock.id);
                                formData.set('score', score);
                                formData.set('minutesUsed', minutesUsed || '0');
                                formData.set('selfEvaluation', selfEvaluation);
                                formData.set('weakPoints', weakPoints);
                                startTransition(async () => {
                                  const result = await recordMockAttemptAction(formData);
                                  if (result.ok) {
                                    toast.success(result.message, { duration: 7000 });
                                    setRecording(null);
                                    setScore('');
                                    setMinutesUsed('');
                                    setWeakPoints('');
                                    router.refresh();
                                  } else {
                                    toast.error(result.message);
                                  }
                                });
                              }}
                            >
                              Salva esito
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRecording(null)}>
                              Annulla
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setRecording(mock.id);
                              setMinutesUsed(String(mock.durationMinutes));
                            }}
                          >
                            Registra un tentativo
                          </Button>
                          <ConfirmButton
                            trigger={
                              <Button size="sm" variant="ghost">
                                <Trash2 className="h-4 w-4" aria-hidden />
                                Elimina
                              </Button>
                            }
                            title="Eliminare la simulazione?"
                            description="Verranno eliminati anche i tentativi registrati."
                            onConfirm={async () => {
                              const result = await deleteMockExamAction(mock.id);
                              if (result.ok) toast.success(result.message);
                              else toast.error(result.message);
                              router.refresh();
                            }}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="nuova">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Configura una simulazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-exam">Esame</Label>
                <select
                  id="m-exam"
                  value={newExamId}
                  onChange={(event) => {
                    setNewExamId(event.target.value);
                    setSelectedTopics([]);
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
                <Label htmlFor="m-kind">Tipo</Label>
                <select
                  id="m-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as MockExamKind)}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-title">Titolo</Label>
              <Input
                id="m-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Es. Simulazione finale — teoria + esercizi"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-duration">Durata (minuti)</Label>
                <Input
                  id="m-duration"
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-max">Punteggio massimo</Label>
                <Input
                  id="m-max"
                  type="number"
                  min={1}
                  max={100}
                  value={maxScore}
                  onChange={(event) => setMaxScore(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-threshold">Soglia di superamento</Label>
                <Input
                  id="m-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </div>
            </div>

            {selectedExam && selectedExam.topics.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Argomenti inclusi</legend>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {selectedExam.topics.map((topic) => (
                    <label key={topic.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedTopics.includes(topic.id)}
                        onChange={(event) =>
                          setSelectedTopics((current) =>
                            event.target.checked
                              ? [...current, topic.id]
                              : current.filter((id) => id !== topic.id),
                          )
                        }
                      />
                      <span className="truncate">{topic.title}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <Button
              loading={pending}
              disabled={!newExamId || title.trim().length < 2}
              onClick={() => {
                const formData = new FormData();
                formData.set('examId', newExamId);
                formData.set('title', title);
                formData.set('kind', kind);
                formData.set('durationMinutes', duration);
                formData.set('maxScore', maxScore);
                formData.set('passThreshold', threshold);
                for (const topicId of selectedTopics) formData.append('topicIds', topicId);
                startTransition(async () => {
                  const result = await createMockExamAction(formData);
                  if (result.ok) {
                    toast.success(result.message);
                    setTitle('');
                    setSelectedTopics([]);
                    router.refresh();
                  } else {
                    toast.error(result.message);
                  }
                });
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Crea simulazione
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
