'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Eye, NotebookPen, Plus, Trash2, X } from 'lucide-react';
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
  createExerciseAction,
  deleteExerciseAction,
  recordExerciseAttemptAction,
} from '@/server/actions/practice';
import type { ErrorTypeValue } from '@/types/db';

interface ExerciseRow {
  id: string;
  examId: string;
  topicId: string | null;
  title: string;
  statement: string;
  solution: string | null;
  difficulty: number;
  estimatedMinutes: number;
  needsVerification: boolean;
  stats: { total: number; correct: number };
}

export const ERROR_TYPE_LABELS: Record<ErrorTypeValue, string> = {
  concettuale: 'Concettuale',
  calcolo: 'Calcolo',
  distrazione: 'Distrazione',
  formula_dimenticata: 'Formula dimenticata',
  interpretazione: 'Interpretazione',
  procedimento_incompleto: 'Procedimento incompleto',
  gestione_tempo: 'Gestione del tempo',
  esposizione_orale: 'Risposta orale poco chiara',
};

export function ExerciseWorkspace({
  exams,
  topics,
  exercises,
}: {
  exams: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; title: string; examId: string }>;
  exercises: ExerciseRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [examFilter, setExamFilter] = useState('tutti');
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [minutes, setMinutes] = useState('');
  const [errorType, setErrorType] = useState<ErrorTypeValue>('concettuale');
  const [showSolution, setShowSolution] = useState(false);

  // form nuovo esercizio
  const [newExamId, setNewExamId] = useState(exams[0]?.id ?? '');
  const [newTopicId, setNewTopicId] = useState('');
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [solution, setSolution] = useState('');
  const [difficulty, setDifficulty] = useState('3');
  const [estimated, setEstimated] = useState('15');

  const examNames = new Map(exams.map((exam) => [exam.id, exam.name]));
  const filtered = exercises.filter(
    (exercise) => examFilter === 'tutti' || exercise.examId === examFilter,
  );

  function record(exerciseId: string, isCorrect: boolean, selfScore: number) {
    const formData = new FormData();
    formData.set('exerciseId', exerciseId);
    formData.set('isCorrect', String(isCorrect));
    formData.set('selfScore', String(selfScore));
    if (minutes) formData.set('minutesUsed', minutes);
    formData.set('answer', answer);
    if (!isCorrect) formData.set('errorType', errorType);

    startTransition(async () => {
      const result = await recordExerciseAttemptAction(formData);
      if (result.ok) toast.success(result.message, { duration: 7000 });
      else toast.error(result.message);
      setOpenId(null);
      setAnswer('');
      setMinutes('');
      setShowSolution(false);
      router.refresh();
    });
  }

  return (
    <Tabs defaultValue="svolgi">
      <TabsList>
        <TabsTrigger value="svolgi">Svolgi</TabsTrigger>
        <TabsTrigger value="nuovo">Crea esercizio</TabsTrigger>
      </TabsList>

      <TabsContent value="svolgi" className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Esame</span>
          <select
            value={examFilter}
            onChange={(event) => setExamFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm sm:w-72"
          >
            <option value="tutti">Tutti gli esami</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.name}
              </option>
            ))}
          </select>
        </label>

        {filtered.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Nessun esercizio"
            description="Crea il primo esercizio dalla scheda «Crea esercizio»: potrai svolgerlo, autovalutarti e registrare gli errori."
          />
        ) : (
          <ul className="space-y-3">
            {filtered.map((exercise) => (
              <li key={exercise.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-start justify-between gap-2 text-sm">
                      <span className="font-semibold">{exercise.title}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="muted">{examNames.get(exercise.examId) ?? 'Esame'}</Badge>
                        <Badge variant="secondary">Difficoltà {exercise.difficulty}/5</Badge>
                        <Badge variant="muted">
                          {exercise.stats.correct}/{exercise.stats.total} corretti
                        </Badge>
                        {exercise.needsVerification ? (
                          <Badge variant="accent">Da verificare</Badge>
                        ) : null}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="whitespace-pre-wrap text-sm">{exercise.statement}</p>

                    {openId === exercise.id ? (
                      <div className="space-y-3 rounded-md border p-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`ans-${exercise.id}`}>Il tuo svolgimento</Label>
                          <Textarea
                            id={`ans-${exercise.id}`}
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor={`min-${exercise.id}`}>Minuti impiegati</Label>
                            <Input
                              id={`min-${exercise.id}`}
                              type="number"
                              min={0}
                              max={600}
                              value={minutes}
                              onChange={(event) => setMinutes(event.target.value)}
                              className="w-24"
                            />
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowSolution((value) => !value)}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                            {showSolution ? 'Nascondi soluzione' : 'Mostra soluzione'}
                          </Button>
                        </div>

                        {showSolution ? (
                          <div className="rounded-md bg-muted/60 p-3 text-sm">
                            <p className="font-medium">Soluzione</p>
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                              {exercise.solution ?? 'Nessuna soluzione memorizzata.'}
                            </p>
                          </div>
                        ) : null}

                        <div className="space-y-1.5">
                          <Label htmlFor={`err-${exercise.id}`}>
                            Se hai sbagliato, che tipo di errore è stato?
                          </Label>
                          <select
                            id={`err-${exercise.id}`}
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

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() => record(exercise.id, true, 5)}
                          >
                            <Check className="h-4 w-4" aria-hidden />
                            Corretto
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => record(exercise.id, false, 2)}
                          >
                            Parzialmente corretto
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => record(exercise.id, false, 0)}
                          >
                            <X className="h-4 w-4" aria-hidden />
                            Sbagliato
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>
                            Chiudi
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setOpenId(exercise.id);
                            setAnswer('');
                            setMinutes(String(exercise.estimatedMinutes));
                            setShowSolution(false);
                          }}
                        >
                          Svolgi
                        </Button>
                        <ConfirmButton
                          trigger={
                            <Button size="sm" variant="ghost">
                              <Trash2 className="h-4 w-4" aria-hidden />
                              Elimina
                            </Button>
                          }
                          title="Eliminare l’esercizio?"
                          description="Verranno persi anche i tentativi registrati."
                          onConfirm={async () => {
                            const result = await deleteExerciseAction(exercise.id);
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
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="nuovo">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Nuovo esercizio</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="e-exam">Esame</Label>
                <select
                  id="e-exam"
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
                <Label htmlFor="e-topic">Argomento</Label>
                <select
                  id="e-topic"
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
              <Label htmlFor="e-title">Titolo</Label>
              <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="e-statement">Testo dell’esercizio</Label>
              <Textarea
                id="e-statement"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={5}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="e-solution">Soluzione</Label>
              <Textarea
                id="e-solution"
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                rows={5}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="e-difficulty">Difficoltà</Label>
                <Input
                  id="e-difficulty"
                  type="number"
                  min={1}
                  max={5}
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-24"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-minutes">Minuti stimati</Label>
                <Input
                  id="e-minutes"
                  type="number"
                  min={1}
                  max={600}
                  value={estimated}
                  onChange={(e) => setEstimated(e.target.value)}
                  className="w-28"
                />
              </div>
            </div>

            <Button
              loading={pending}
              disabled={!newExamId || title.trim().length < 2 || statement.trim().length < 3}
              onClick={() => {
                const formData = new FormData();
                formData.set('examId', newExamId);
                formData.set('topicId', newTopicId);
                formData.set('title', title);
                formData.set('statement', statement);
                formData.set('solution', solution);
                formData.set('difficulty', difficulty);
                formData.set('estimatedMinutes', estimated);
                startTransition(async () => {
                  const result = await createExerciseAction(formData);
                  if (result.ok) {
                    toast.success(result.message);
                    setTitle('');
                    setStatement('');
                    setSolution('');
                    router.refresh();
                  } else {
                    toast.error(result.message);
                  }
                });
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Crea esercizio
            </Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
