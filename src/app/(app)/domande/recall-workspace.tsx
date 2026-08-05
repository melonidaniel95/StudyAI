'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Eye, FileQuestion, Layers, Plus, Trash2 } from 'lucide-react';
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
  answerQuestionAction,
  createFlashcardAction,
  createQuestionAction,
  deleteFlashcardAction,
  deleteQuestionAction,
  reviewFlashcardAction,
} from '@/server/actions/practice';
import { RECALL_GRADE_LABELS, type IsoDate, type RecallGrade } from '@/lib/domain/types';
import type { QuestionType } from '@/types/db';

interface QuestionRow {
  id: string;
  examId: string;
  topicId: string | null;
  type: QuestionType;
  prompt: string;
  answer: string | null;
  criteria: string | null;
  difficulty: number;
  timesAsked: number;
  timesCorrect: number;
  needsVerification: boolean;
}

interface FlashcardRow {
  id: string;
  examId: string;
  topicId: string | null;
  front: string;
  back: string;
  hint: string | null;
  dueDate: IsoDate;
  timesReviewed: number;
  timesCorrect: number;
  needsVerification: boolean;
}

export function RecallWorkspace({
  today,
  exams,
  topics,
  questions,
  flashcards,
}: {
  today: IsoDate;
  exams: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; title: string; examId: string }>;
  questions: QuestionRow[];
  flashcards: FlashcardRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [examFilter, setExamFilter] = useState('tutti');

  const examNames = new Map(exams.map((exam) => [exam.id, exam.name]));

  const filteredQuestions = questions.filter(
    (question) => examFilter === 'tutti' || question.examId === examFilter,
  );
  const dueCards = useMemo(
    () =>
      flashcards.filter(
        (card) => card.dueDate <= today && (examFilter === 'tutti' || card.examId === examFilter),
      ),
    [flashcards, today, examFilter],
  );

  return (
    <div className="space-y-5">
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

      <Tabs defaultValue="interroga">
        <TabsList className="flex-wrap">
          <TabsTrigger value="interroga">Interrogami</TabsTrigger>
          <TabsTrigger value="flashcard">Flashcard ({dueCards.length})</TabsTrigger>
          <TabsTrigger value="gestione">Archivio</TabsTrigger>
          <TabsTrigger value="nuovo">Crea</TabsTrigger>
        </TabsList>

        <TabsContent value="interroga">
          <QuestionRunner
            questions={filteredQuestions}
            examNames={examNames}
            onAnswered={() => router.refresh()}
          />
        </TabsContent>

        <TabsContent value="flashcard">
          <FlashcardRunner cards={dueCards} examNames={examNames} onDone={() => router.refresh()} />
        </TabsContent>

        <TabsContent value="gestione">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Domande ({filteredQuestions.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna domanda.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {filteredQuestions.map((question) => (
                      <li key={question.id} className="rounded-md border p-3">
                        <p className="flex items-start justify-between gap-2">
                          <span className="font-medium">{question.prompt}</span>
                          <ConfirmButton
                            trigger={
                              <Button size="icon" variant="ghost" aria-label="Elimina domanda">
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            }
                            title="Eliminare la domanda?"
                            description="L’operazione non può essere annullata."
                            onConfirm={async () => {
                              const result = await deleteQuestionAction(question.id);
                              if (result.ok) toast.success(result.message);
                              else toast.error(result.message);
                              router.refresh();
                            }}
                          />
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                          <Badge variant="muted">{examNames.get(question.examId) ?? 'Esame'}</Badge>
                          <Badge variant="secondary">Difficoltà {question.difficulty}/5</Badge>
                          <Badge variant="muted">
                            {question.timesCorrect}/{question.timesAsked} corrette
                          </Badge>
                          {question.needsVerification ? (
                            <Badge variant="accent">Da verificare</Badge>
                          ) : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Flashcard ({flashcards.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {flashcards.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna flashcard.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {flashcards.map((card) => (
                      <li key={card.id} className="rounded-md border p-3">
                        <p className="flex items-start justify-between gap-2">
                          <span className="font-medium">{card.front}</span>
                          <ConfirmButton
                            trigger={
                              <Button size="icon" variant="ghost" aria-label="Elimina flashcard">
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            }
                            title="Eliminare la flashcard?"
                            description="L’operazione non può essere annullata."
                            onConfirm={async () => {
                              const result = await deleteFlashcardAction(card.id);
                              if (result.ok) toast.success(result.message);
                              else toast.error(result.message);
                              router.refresh();
                            }}
                          />
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Prossimo ripasso: {card.dueDate} · {card.timesCorrect}/{card.timesReviewed}{' '}
                          corrette
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="nuovo">
          <div className="grid gap-4 md:grid-cols-2">
            <CreateQuestionForm
              exams={exams}
              topics={topics}
              pending={pending}
              onSubmit={(formData) =>
                startTransition(async () => {
                  const result = await createQuestionAction(formData);
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                  router.refresh();
                })
              }
            />
            <CreateFlashcardForm
              exams={exams}
              topics={topics}
              pending={pending}
              onSubmit={(formData) =>
                startTransition(async () => {
                  const result = await createFlashcardAction(formData);
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.message);
                  router.refresh();
                })
              }
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuestionRunner({
  questions,
  examNames,
  onAnswered,
}: {
  questions: QuestionRow[];
  examNames: Map<string, string>;
  onAnswered: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState('');
  const [pending, startTransition] = useTransition();

  const current = questions[index];

  if (questions.length === 0) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Nessuna domanda disponibile"
        description="Crea le prime domande aperte dalla scheda «Crea»: rispondere a voce prima di guardare è il modo più efficace per fissare i concetti."
      />
    );
  }

  if (!current) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="font-medium">Hai completato il giro di domande.</p>
          <Button variant="outline" onClick={() => setIndex(0)}>
            Ricomincia
          </Button>
        </CardContent>
      </Card>
    );
  }

  function record(selfScore: number) {
    if (!current) return;
    const questionId = current.id;
    startTransition(async () => {
      const result = await answerQuestionAction(questionId, {
        givenAnswer: answer,
        selfScore,
        isCorrect: selfScore >= 3,
      });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setAnswer('');
      setRevealed(false);
      setIndex((value) => value + 1);
      onAnswered();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Domanda {index + 1} di {questions.length}
          </span>
          <Badge variant="muted">{examNames.get(current.examId) ?? 'Esame'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-lg font-medium">{current.prompt}</p>

        <div className="space-y-1.5">
          <Label htmlFor="risposta">La tua risposta (scrivila o dilla a voce)</Label>
          <Textarea
            id="risposta"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={4}
          />
        </div>

        {!revealed ? (
          <Button onClick={() => setRevealed(true)}>
            <Eye className="h-4 w-4" aria-hidden />
            Mostra la risposta attesa
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/60 p-3 text-sm">
              <p className="font-medium">Risposta attesa</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {current.answer ?? 'Nessuna risposta memorizzata per questa domanda.'}
              </p>
              {current.criteria ? (
                <>
                  <p className="mt-2 font-medium">Criteri di valutazione</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{current.criteria}</p>
                </>
              ) : null}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Quanto era corretta la tua risposta?</legend>
              <div className="grid gap-2">
                {([0, 1, 2, 3, 4] as RecallGrade[]).map((grade) => (
                  <Button
                    key={grade}
                    variant="outline"
                    className="justify-start"
                    disabled={pending}
                    onClick={() => record(grade + 1)}
                  >
                    <span className="mr-2 font-semibold">{grade}</span>
                    {RECALL_GRADE_LABELS[grade]}
                  </Button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setRevealed(false);
            setAnswer('');
            setIndex((value) => value + 1);
          }}
        >
          Salta
        </Button>
      </CardContent>
    </Card>
  );
}

function FlashcardRunner({
  cards,
  examNames,
  onDone,
}: {
  cards: FlashcardRow[];
  examNames: Map<string, string>;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = cards[index];

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nessuna flashcard in scadenza"
        description="Le flashcard tornano quando è il momento giusto secondo la ripetizione dilazionata. Puoi crearne di nuove dalla scheda «Crea»."
      />
    );
  }

  if (!current) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="font-medium">Flashcard completate per oggi.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span>
            Carta {index + 1} di {cards.length}
          </span>
          <Badge variant="muted">{examNames.get(current.examId) ?? 'Esame'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="min-h-32 rounded-md border bg-muted/40 p-5 text-center">
          <p className="text-lg font-medium">{flipped ? current.back : current.front}</p>
          {!flipped && current.hint ? (
            <p className="mt-2 text-sm text-muted-foreground">Suggerimento: {current.hint}</p>
          ) : null}
        </div>

        {!flipped ? (
          <Button onClick={() => setFlipped(true)} className="w-full">
            Mostra la risposta
          </Button>
        ) : (
          <div className="grid gap-2">
            {([0, 1, 2, 3, 4] as RecallGrade[]).map((grade) => (
              <Button
                key={grade}
                variant="outline"
                className="justify-start"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await reviewFlashcardAction(current.id, grade);
                    if (result.ok) {
                      toast.success('Registrato', { description: result.explanation });
                    } else {
                      toast.error(result.message);
                    }
                    setFlipped(false);
                    setIndex((value) => value + 1);
                    onDone();
                  })
                }
              >
                <span className="mr-2 font-semibold">{grade}</span>
                {RECALL_GRADE_LABELS[grade]}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateQuestionForm({
  exams,
  topics,
  pending,
  onSubmit,
}: {
  exams: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; title: string; examId: string }>;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  const [examId, setExamId] = useState(exams[0]?.id ?? '');
  const [topicId, setTopicId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [criteria, setCriteria] = useState('');
  const [difficulty, setDifficulty] = useState('3');

  const availableTopics = topics.filter((topic) => topic.examId === examId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Nuova domanda aperta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="q-exam">Esame</Label>
          <select
            id="q-exam"
            value={examId}
            onChange={(event) => {
              setExamId(event.target.value);
              setTopicId('');
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
          <Label htmlFor="q-topic">Argomento</Label>
          <select
            id="q-topic"
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Nessuno</option>
            {availableTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="q-prompt">Domanda</Label>
          <Textarea id="q-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="q-answer">Risposta attesa</Label>
          <Textarea id="q-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="q-criteria">Criteri di valutazione</Label>
          <Textarea id="q-criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="q-difficulty">Difficoltà</Label>
          <Input
            id="q-difficulty"
            type="number"
            min={1}
            max={5}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-24"
          />
        </div>

        <Button
          loading={pending}
          disabled={!examId || prompt.trim().length < 3}
          onClick={() => {
            const formData = new FormData();
            formData.set('examId', examId);
            formData.set('topicId', topicId);
            formData.set('type', 'aperta');
            formData.set('prompt', prompt);
            formData.set('answer', answer);
            formData.set('evaluationCriteria', criteria);
            formData.set('difficulty', difficulty);
            onSubmit(formData);
            setPrompt('');
            setAnswer('');
            setCriteria('');
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Crea domanda
        </Button>
      </CardContent>
    </Card>
  );
}

function CreateFlashcardForm({
  exams,
  topics,
  pending,
  onSubmit,
}: {
  exams: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; title: string; examId: string }>;
  pending: boolean;
  onSubmit: (formData: FormData) => void;
}) {
  const [examId, setExamId] = useState(exams[0]?.id ?? '');
  const [topicId, setTopicId] = useState('');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [hint, setHint] = useState('');

  const availableTopics = topics.filter((topic) => topic.examId === examId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Nuova flashcard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-exam">Esame</Label>
          <select
            id="f-exam"
            value={examId}
            onChange={(event) => {
              setExamId(event.target.value);
              setTopicId('');
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
          <Label htmlFor="f-topic">Argomento</Label>
          <select
            id="f-topic"
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Nessuno</option>
            {availableTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-front">Fronte</Label>
          <Textarea id="f-front" value={front} onChange={(e) => setFront(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-back">Retro</Label>
          <Textarea id="f-back" value={back} onChange={(e) => setBack(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-hint">Suggerimento</Label>
          <Input id="f-hint" value={hint} onChange={(e) => setHint(e.target.value)} />
        </div>

        <Button
          loading={pending}
          disabled={!examId || !front.trim() || !back.trim()}
          onClick={() => {
            const formData = new FormData();
            formData.set('examId', examId);
            formData.set('topicId', topicId);
            formData.set('front', front);
            formData.set('back', back);
            formData.set('hint', hint);
            formData.set('difficulty', '3');
            onSubmit(formData);
            setFront('');
            setBack('');
            setHint('');
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Crea flashcard
        </Button>
      </CardContent>
    </Card>
  );
}
