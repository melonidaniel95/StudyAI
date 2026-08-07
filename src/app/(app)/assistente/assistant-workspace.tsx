'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bot, Info, Lightbulb, MessageCircleQuestion, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  analyzeSyllabusAction,
  askNextQuestionAction,
  confirmQuizMasteryAction,
  evaluateAnswerAction,
  explainConceptAction,
  findGapsAction,
  generateExercisesAction,
  generateFlashcardsAction,
  generateQuestionsAction,
  saveGeneratedExercisesAction,
  saveGeneratedFlashcardsAction,
  saveGeneratedQuestionsAction,
  summarizeErrorsAction,
} from '@/server/actions/ai';

interface TopicItem {
  id: string;
  title: string;
  examId: string;
  mastery: number;
  status: string;
}

type GenerationKind = 'domande' | 'flashcard' | 'esercizi';

export function AssistantWorkspace({
  status,
  exams,
  topics,
  openErrors,
}: {
  status: { configured: boolean; enabled: boolean; limit: number; used: number };
  exams: Array<{ id: string; name: string }>;
  topics: TopicItem[];
  openErrors: Array<{ text: string; type: string; repetitions: number }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [examId, setExamId] = useState(exams[0]?.id ?? '');
  const [topicId, setTopicId] = useState('');
  const [concept, setConcept] = useState('');
  const [output, setOutput] = useState('');
  const [items, setItems] = useState<unknown[]>([]);
  const [kind, setKind] = useState<GenerationKind>('domande');
  const [syllabusText, setSyllabusText] = useState('');

  // Interrogami
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [asked, setAsked] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState('3');

  const availableTopics = topics.filter((topic) => topic.examId === examId);
  const selectedTopic = topics.find((topic) => topic.id === topicId);
  const subject = selectedTopic?.title || concept;

  function handle(result: Promise<{ ok: boolean; text?: string; message?: string; items?: unknown[] }>) {
    startTransition(async () => {
      const value = await result;
      if (!value.ok) {
        toast.error(value.message ?? 'Operazione non riuscita.');
        return;
      }
      setOutput(value.text ?? value.message ?? '');
      setItems(value.items ?? []);
      if (value.message) toast.success(value.message);
    });
  }

  if (!status.configured || !status.enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5" aria-hidden />
            Assistente non attivo
          </CardTitle>
          <CardDescription>
            StudyAI funziona interamente anche senza AI: piano, sessioni, ripassi, esercizi e
            simulazioni non ne hanno bisogno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!status.configured ? (
            <div className="space-y-2">
              <p className="font-medium">Per attivarlo:</p>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  Apri il file <code className="rounded bg-muted px-1">.env.local</code>.
                </li>
                <li>
                  Imposta <code className="rounded bg-muted px-1">AI_PROVIDER</code> su{' '}
                  <code className="rounded bg-muted px-1">anthropic</code> oppure{' '}
                  <code className="rounded bg-muted px-1">openai</code>.
                </li>
                <li>
                  Inserisci la tua chiave in <code className="rounded bg-muted px-1">AI_API_KEY</code>.
                </li>
                <li>Riavvia il server e attiva l’assistente dalle impostazioni.</li>
              </ol>
            </div>
          ) : (
            <p className="text-muted-foreground">
              L’assistente è configurato ma disattivato nel tuo profilo. Nessun dato viene inviato
              finché non lo attivi.
            </p>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/impostazioni">Vai alle impostazioni</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-3 text-sm">
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">
          Richieste usate oggi: {status.used} di {status.limit}. I contenuti generati vanno sempre
          verificati con il materiale ufficiale.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ai-exam">Esame</Label>
          <select
            id="ai-exam"
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
          <Label htmlFor="ai-topic">Argomento</Label>
          <select
            id="ai-topic"
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Nessuno (scrivo io l’argomento)</option>
            {availableTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!topicId ? (
        <div className="space-y-1.5">
          <Label htmlFor="ai-concept">Argomento libero</Label>
          <Input
            id="ai-concept"
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
            placeholder="Es. polarizzazione inversa della giunzione PN"
          />
        </div>
      ) : null}

      <Tabs defaultValue="spiega">
        <TabsList className="flex-wrap">
          <TabsTrigger value="spiega">Spiega</TabsTrigger>
          <TabsTrigger value="genera">Genera</TabsTrigger>
          <TabsTrigger value="interrogami">Interrogami</TabsTrigger>
          <TabsTrigger value="analizza">Analizza programma</TabsTrigger>
          <TabsTrigger value="lacune">Lacune ed errori</TabsTrigger>
        </TabsList>

        <TabsContent value="spiega" className="space-y-3">
          <Button
            loading={pending}
            disabled={!subject}
            onClick={() => handle(explainConceptAction(subject))}
          >
            <Lightbulb className="h-4 w-4" aria-hidden />
            Spiega in modo semplice
          </Button>
          <OutputCard text={output} />
        </TabsContent>

        <TabsContent value="genera" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={kind === 'domande' ? 'default' : 'outline'}
              size="sm"
              disabled={pending || !subject}
              onClick={() => {
                setKind('domande');
                handle(generateQuestionsAction(subject, 5));
              }}
            >
              Domande aperte
            </Button>
            <Button
              variant={kind === 'flashcard' ? 'default' : 'outline'}
              size="sm"
              disabled={pending || !subject}
              onClick={() => {
                setKind('flashcard');
                handle(generateFlashcardsAction(subject, 8));
              }}
            >
              Flashcard
            </Button>
            <Button
              variant={kind === 'esercizi' ? 'default' : 'outline'}
              size="sm"
              disabled={pending || !subject}
              onClick={() => {
                setKind('esercizi');
                handle(generateExercisesAction(subject, 3));
              }}
            >
              Esercizi progressivi
            </Button>
          </div>

          {items.length > 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  {items.length} elementi generati
                  <Badge variant="accent">Da verificare</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {items.map((item, index) => (
                    <li key={index} className="rounded-md border p-2">
                      <pre className="whitespace-pre-wrap font-sans text-xs">
                        {JSON.stringify(item, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
                <Button
                  loading={pending}
                  onClick={() => {
                    const topic = topicId || null;
                    startTransition(async () => {
                      const result =
                        kind === 'domande'
                          ? await saveGeneratedQuestionsAction(examId, topic, items as never[])
                          : kind === 'flashcard'
                            ? await saveGeneratedFlashcardsAction(examId, topic, items as never[])
                            : await saveGeneratedExercisesAction(examId, topic, items as never[]);
                      if (result.ok) {
                        toast.success(result.message ?? 'Salvato.');
                        setItems([]);
                        router.refresh();
                      } else {
                        toast.error(result.message ?? 'Salvataggio non riuscito.');
                      }
                    });
                  }}
                >
                  <Save className="h-4 w-4" aria-hidden />
                  Conferma e salva
                </Button>
              </CardContent>
            </Card>
          ) : (
            <OutputCard text={output} />
          )}
        </TabsContent>

        <TabsContent value="interrogami" className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ai-difficulty">Difficoltà</Label>
              <Input
                id="ai-difficulty"
                type="number"
                min={1}
                max={5}
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                className="w-24"
              />
            </div>
            <Button
              loading={pending}
              disabled={!subject}
              onClick={() =>
                startTransition(async () => {
                  const result = await askNextQuestionAction(subject, Number(difficulty), asked);
                  if (!result.ok) {
                    toast.error(result.message ?? 'Operazione non riuscita.');
                    return;
                  }
                  setQuestion(result.text ?? '');
                  setAsked((current) => [...current, result.text ?? '']);
                  setAnswer('');
                  setEvaluation('');
                })
              }
            >
              <MessageCircleQuestion className="h-4 w-4" aria-hidden />
              {question ? 'Prossima domanda' : 'Iniziamo'}
            </Button>
          </div>

          {question ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Domanda</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap">{question}</p>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-answer">La tua risposta</Label>
                  <Textarea
                    id="ai-answer"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    rows={5}
                  />
                </div>
                <Button
                  loading={pending}
                  disabled={!answer.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await evaluateAnswerAction(question, answer);
                      if (!result.ok) {
                        toast.error(result.message ?? 'Operazione non riuscita.');
                        return;
                      }
                      setEvaluation(result.text ?? '');
                    })
                  }
                >
                  Valuta la risposta
                </Button>

                {evaluation ? (
                  <div className="space-y-3 rounded-md bg-muted/50 p-3 text-sm">
                    <p className="whitespace-pre-wrap">{evaluation}</p>
                    {topicId ? (
                      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                        <span className="text-xs text-muted-foreground">
                          Aggiorno la padronanza dell’argomento?
                        </span>
                        {[0, 1, 2, 3, 4, 5].map((score) => (
                          <Button
                            key={score}
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const result = await confirmQuizMasteryAction(topicId, score);
                                if (result.ok) toast.success(result.message ?? 'Aggiornato.');
                                else toast.error(result.message ?? 'Operazione non riuscita.');
                                router.refresh();
                              })
                            }
                          >
                            {score}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="analizza" className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ai-syllabus">Testo della lezione o del programma</Label>
            <Textarea
              id="ai-syllabus"
              value={syllabusText}
              onChange={(event) => setSyllabusText(event.target.value)}
              rows={8}
              placeholder="Incolla qui il testo da suddividere in moduli e argomenti."
            />
          </div>
          <Button
            loading={pending}
            disabled={syllabusText.trim().length < 20}
            onClick={() => handle(analyzeSyllabusAction(syllabusText))}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Proponi moduli e argomenti
          </Button>
          <p className="text-xs text-muted-foreground">
            La proposta va copiata nella scheda «Programma» dell’esame usando «Importa da testo»:
            così resti tu a decidere che cosa entra nel piano.
          </p>
          <OutputCard text={output} />
        </TabsContent>

        <TabsContent value="lacune" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              loading={pending}
              onClick={() => {
                const summary = topics
                  .filter((topic) => topic.examId === examId)
                  .map(
                    (topic) =>
                      `${topic.title}: padronanza ${Math.round(topic.mastery * 100)}%, stato ${topic.status}`,
                  )
                  .join('\n');
                handle(findGapsAction(summary || 'Nessun dato disponibile.'));
              }}
            >
              Individua le lacune
            </Button>
            <Button
              variant="outline"
              loading={pending}
              disabled={openErrors.length === 0}
              onClick={() =>
                handle(
                  summarizeErrorsAction(
                    openErrors
                      .map((error) => `[${error.type} ×${error.repetitions}] ${error.text}`)
                      .join('\n'),
                  ),
                )
              }
            >
              Riassumi gli errori ({openErrors.length})
            </Button>
          </div>
          <OutputCard text={output} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OutputCard({ text }: { text: string }) {
  if (!text) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          Risposta
          <Badge variant="accent">Da verificare</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm">{text}</p>
      </CardContent>
    </Card>
  );
}
