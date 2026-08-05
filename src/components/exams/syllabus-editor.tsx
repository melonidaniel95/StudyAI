'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  ChevronDown,
  FileInput,
  GripVertical,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmButton } from '@/components/shared/confirm-button';
import {
  confirmSyllabusAction,
  createModuleAction,
  createTopicAction,
  deleteModuleAction,
  deleteTopicAction,
  importSyllabusAction,
  reorderTopicsAction,
  updateTopicAction,
} from '@/server/actions/syllabus';
import { createReviewAction } from '@/server/actions/reviews';
import { formatMinutes } from '@/lib/domain/dates';
import type { TopicStatus } from '@/lib/domain/types';
import { percent } from '@/lib/utils';

interface TopicRow {
  id: string;
  title: string;
  estimatedMinutes: number;
  difficulty: number;
  status: TopicStatus;
  mastery: number;
  frequentlyAsked: boolean;
  studiedMinutes: number;
  lastStudiedAt: string | null;
  lastReviewedAt: string | null;
}

interface ModuleRow {
  id: string;
  title: string;
  position: number;
  isDraft: boolean;
  topics: TopicRow[];
}

const STATUS_LABELS: Record<TopicStatus, string> = {
  non_iniziato: 'Non iniziato',
  in_corso: 'In corso',
  studiato: 'Studiato',
  da_ripassare: 'Da ripassare',
  consolidato: 'Consolidato',
};

const STATUS_VARIANT: Record<TopicStatus, 'muted' | 'secondary' | 'default' | 'accent'> = {
  non_iniziato: 'muted',
  in_corso: 'secondary',
  studiato: 'default',
  da_ripassare: 'accent',
  consolidato: 'default',
};

export function SyllabusEditor({
  examId,
  modules,
  syllabusIsDraft,
}: {
  examId: string;
  modules: ModuleRow[];
  syllabusIsDraft: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openModules, setOpenModules] = useState<string[]>(modules.map((m) => m.id));
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newTopic, setNewTopic] = useState<Record<string, string>>({});
  const [dragged, setDragged] = useState<{ moduleId: string; topicId: string } | null>(null);

  const allTopics = modules.flatMap((module) => module.topics);
  const totalMinutes = allTopics.reduce((sum, topic) => sum + topic.estimatedMinutes, 0);
  const doneMinutes = allTopics.reduce(
    (sum, topic) => sum + topic.estimatedMinutes * topic.mastery,
    0,
  );

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  function moveTopic(module: ModuleRow, index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= module.topics.length) return;
    const ids = module.topics.map((topic) => topic.id);
    const current = ids[index];
    const swap = ids[next];
    if (!current || !swap) return;
    ids[index] = swap;
    ids[next] = current;
    run(() => reorderTopicsAction(module.id, ids));
  }

  function dropTopic(module: ModuleRow, targetTopicId: string) {
    if (!dragged || dragged.moduleId !== module.id || dragged.topicId === targetTopicId) return;
    const ids = module.topics.map((topic) => topic.id);
    const from = ids.indexOf(dragged.topicId);
    const to = ids.indexOf(targetTopicId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    if (moved) ids.splice(to, 0, moved);
    setDragged(null);
    run(() => reorderTopicsAction(module.id, ids));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {modules.length} moduli · {allTopics.length} argomenti · {formatMinutes(totalMinutes)}{' '}
                stimati
              </p>
              <p className="text-xs text-muted-foreground">
                La padronanza cresce con sessioni, ripassi ed esercizi, non con la semplice lettura.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ImportDialog examId={examId} />
              {syllabusIsDraft && allTopics.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => confirmSyllabusAction(examId))}
                >
                  <BadgeCheck className="h-4 w-4" aria-hidden />
                  Segna come verificato
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>Avanzamento del programma</span>
              <span className="font-semibold tabular-nums">
                {totalMinutes > 0 ? percent(doneMinutes / totalMinutes) : 0}%
              </span>
            </div>
            <Progress
              value={totalMinutes > 0 ? percent(doneMinutes / totalMinutes) : 0}
              aria-label="Avanzamento del programma"
            />
          </div>
        </CardContent>
      </Card>

      {modules.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nessun modulo inserito. Crea il primo modulo qui sotto oppure importa il programma da testo.
        </p>
      ) : null}

      <ul className="space-y-3">
        {modules.map((module) => {
          const open = openModules.includes(module.id);
          const moduleMinutes = module.topics.reduce((sum, t) => sum + t.estimatedMinutes, 0);
          return (
            <li key={module.id}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-left"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenModules((current) =>
                          current.includes(module.id)
                            ? current.filter((id) => id !== module.id)
                            : [...current, module.id],
                        )
                      }
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`}
                        aria-hidden
                      />
                      <span className="font-semibold">{module.title}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {module.topics.length} argomenti · {formatMinutes(moduleMinutes)}
                      </span>
                      {module.isDraft ? <Badge variant="accent">Bozza</Badge> : null}
                    </button>
                    <ConfirmButton
                      trigger={
                        <Button size="icon" variant="ghost" aria-label={`Elimina modulo ${module.title}`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      }
                      title="Eliminare il modulo?"
                      description="Verranno eliminati anche tutti i suoi argomenti. L’operazione non può essere annullata."
                      onConfirm={async () => {
                        const result = await deleteModuleAction(module.id);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message);
                        router.refresh();
                      }}
                    />
                  </CardTitle>
                </CardHeader>

                {open ? (
                  <CardContent className="space-y-2">
                    <ul className="space-y-2">
                      {module.topics.map((topic, index) => (
                        <li
                          key={topic.id}
                          draggable
                          onDragStart={() => setDragged({ moduleId: module.id, topicId: topic.id })}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => dropTopic(module, topic.id)}
                          className="rounded-md border bg-background p-3"
                        >
                          <div className="flex flex-wrap items-start gap-2">
                            <GripVertical
                              className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <Input
                                defaultValue={topic.title}
                                aria-label="Titolo dell’argomento"
                                className="h-9"
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value && value !== topic.title) {
                                    run(() => updateTopicAction(topic.id, { title: value }));
                                  }
                                }}
                              />
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <label className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Minuti</span>
                                  <Input
                                    type="number"
                                    min={5}
                                    max={1200}
                                    step={5}
                                    defaultValue={topic.estimatedMinutes}
                                    aria-label="Tempo stimato in minuti"
                                    className="h-8 w-20"
                                    onBlur={(event) => {
                                      const value = Number(event.target.value);
                                      if (value && value !== topic.estimatedMinutes) {
                                        run(() =>
                                          updateTopicAction(topic.id, { estimatedMinutes: value }),
                                        );
                                      }
                                    }}
                                  />
                                </label>
                                <label className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Difficoltà</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={5}
                                    defaultValue={topic.difficulty}
                                    aria-label="Difficoltà da 1 a 5"
                                    className="h-8 w-16"
                                    onBlur={(event) => {
                                      const value = Number(event.target.value);
                                      if (value && value !== topic.difficulty) {
                                        run(() => updateTopicAction(topic.id, { difficulty: value }));
                                      }
                                    }}
                                  />
                                </label>
                                <label className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Stato</span>
                                  <select
                                    defaultValue={topic.status}
                                    aria-label="Stato dell’argomento"
                                    className="h-8 rounded-md border border-input bg-card px-2"
                                    onChange={(event) =>
                                      run(() =>
                                        updateTopicAction(topic.id, {
                                          status: event.target.value as TopicStatus,
                                        }),
                                      )
                                    }
                                  >
                                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <Badge variant={STATUS_VARIANT[topic.status]}>
                                  Padronanza {percent(topic.mastery)}%
                                </Badge>
                                {topic.studiedMinutes > 0 ? (
                                  <Badge variant="muted">
                                    Studiato {formatMinutes(topic.studiedMinutes)}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Sposta in alto"
                                disabled={index === 0 || pending}
                                onClick={() => moveTopic(module, index, -1)}
                              >
                                <ArrowUp className="h-4 w-4" aria-hidden />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Sposta in basso"
                                disabled={index === module.topics.length - 1 || pending}
                                onClick={() => moveTopic(module, index, 1)}
                              >
                                <ArrowDown className="h-4 w-4" aria-hidden />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={
                                  topic.frequentlyAsked
                                    ? 'Togli da “chiesto spesso”'
                                    : 'Segna come chiesto spesso all’esame'
                                }
                                disabled={pending}
                                onClick={() =>
                                  run(() =>
                                    updateTopicAction(topic.id, {
                                      frequentlyAsked: !topic.frequentlyAsked,
                                    }),
                                  )
                                }
                              >
                                <Star
                                  className={`h-4 w-4 ${topic.frequentlyAsked ? 'fill-accent text-accent' : ''}`}
                                  aria-hidden
                                />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pending}
                                onClick={() => run(() => createReviewAction(topic.id, 1))}
                              >
                                Ripassa
                              </Button>
                              <ConfirmButton
                                trigger={
                                  <Button size="icon" variant="ghost" aria-label="Elimina argomento">
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </Button>
                                }
                                title="Eliminare l’argomento?"
                                description="Verranno persi anche i collegamenti a risorse e ripassi."
                                onConfirm={async () => {
                                  const result = await deleteTopicAction(topic.id);
                                  if (result.ok) toast.success(result.message);
                                  else toast.error(result.message);
                                  router.refresh();
                                }}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Input
                        value={newTopic[module.id] ?? ''}
                        placeholder="Nuovo argomento…"
                        aria-label={`Nuovo argomento in ${module.title}`}
                        className="h-9 max-w-xs"
                        onChange={(event) =>
                          setNewTopic({ ...newTopic, [module.id]: event.target.value })
                        }
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!newTopic[module.id] || pending}
                        onClick={() => {
                          const formData = new FormData();
                          formData.set('moduleId', module.id);
                          formData.set('title', newTopic[module.id] ?? '');
                          formData.set('estimatedMinutes', '60');
                          formData.set('difficulty', '3');
                          run(() => createTopicAction(formData));
                          setNewTopic({ ...newTopic, [module.id]: '' });
                        }}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        Aggiungi
                      </Button>
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-module">Nuovo modulo</Label>
            <Input
              id="new-module"
              value={newModuleTitle}
              onChange={(event) => setNewModuleTitle(event.target.value)}
              className="w-64"
              placeholder="Es. Giunzione PN"
            />
          </div>
          <Button
            disabled={!newModuleTitle || pending}
            onClick={() => {
              const formData = new FormData();
              formData.set('examId', examId);
              formData.set('title', newModuleTitle);
              run(() => createModuleAction(formData));
              setNewModuleTitle('');
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Crea modulo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ImportDialog({ examId }: { examId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileInput className="h-4 w-4" aria-hidden />
          Importa da testo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importa il programma</DialogTitle>
          <DialogDescription>
            Le righe senza trattino diventano moduli; quelle che iniziano con «-» o «•» diventano
            argomenti. Tutto viene marcato come bozza da verificare.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            aria-label="Testo del programma"
            placeholder={'Giunzione PN\n- Regione di svuotamento\n- Tensione di built-in\nDiodi\n- Modello del diodo'}
          />
          <div className="space-y-1.5">
            <Label htmlFor="import-minutes">Minuti stimati per argomento</Label>
            <Input
              id="import-minutes"
              type="number"
              min={5}
              max={600}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className="w-32"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Annulla
          </Button>
          <Button
            loading={pending}
            disabled={text.trim().length < 3}
            onClick={() => {
              const formData = new FormData();
              formData.set('examId', examId);
              formData.set('text', text);
              formData.set('defaultMinutes', minutes);
              startTransition(async () => {
                const result = await importSyllabusAction(formData);
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                  setText('');
                  router.refresh();
                } else {
                  toast.error(result.message);
                }
              });
            }}
          >
            Importa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
