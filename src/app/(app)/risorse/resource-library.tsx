'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  BookOpen,
  ExternalLink,
  FileText,
  Library,
  Link2,
  Search,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmButton } from '@/components/shared/confirm-button';
import {
  createResourceAction,
  deleteResourceAction,
  getResourceUrlAction,
  updateResourceTopicsAction,
} from '@/server/actions/resources';
import { ACCEPT_ATTRIBUTE, MAX_FILE_SIZE, isAllowedMimeType } from '@/lib/uploads';
import { createClient } from '@/lib/supabase/client';
import type { ResourceType } from '@/types/db';

interface ResourceRow {
  id: string;
  title: string;
  type: ResourceType;
  url: string | null;
  storagePath: string | null;
  fileName: string | null;
  examId: string | null;
  tags: string[];
  notes: string | null;
  topicIds: string[];
}

const TYPE_LABELS: Record<ResourceType, string> = {
  pdf: 'PDF',
  libro: 'Libro',
  video: 'Video',
  link: 'Link',
  appunti: 'Appunti',
  formulario: 'Formulario',
  prova_precedente: 'Prova d’esame',
};

function iconFor(type: ResourceType) {
  if (type === 'video') return Video;
  if (type === 'libro') return BookOpen;
  if (type === 'link') return Link2;
  return FileText;
}

export function ResourceLibrary({
  userId,
  resources,
  exams,
  topics,
}: {
  userId: string;
  resources: ResourceRow[];
  exams: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; title: string; examId: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'tutti' | ResourceType>('tutti');
  const [examFilter, setExamFilter] = useState('tutti');
  const [uploading, setUploading] = useState(false);

  // form
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ResourceType>('pdf');
  const [examId, setExamId] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const examNames = new Map(exams.map((exam) => [exam.id, exam.name]));
  const topicTitles = new Map(topics.map((topic) => [topic.id, topic.title]));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return resources.filter((resource) => {
      if (typeFilter !== 'tutti' && resource.type !== typeFilter) return false;
      if (examFilter !== 'tutti' && resource.examId !== examFilter) return false;
      if (!needle) return true;
      return (
        resource.title.toLowerCase().includes(needle) ||
        resource.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
        (resource.notes ?? '').toLowerCase().includes(needle)
      );
    });
  }, [resources, query, typeFilter, examFilter]);

  const availableTopics = examId ? topics.filter((topic) => topic.examId === examId) : topics;

  async function submit() {
    if (title.trim().length < 2) {
      toast.error('Inserisci un titolo.');
      return;
    }

    let storagePath = '';
    let mimeType = '';
    let fileSize = 0;
    let fileName = '';

    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error('Il file supera il limite di 50 MB.');
        return;
      }
      if (file.type && !isAllowedMimeType(file.type)) {
        toast.error('Tipo di file non consentito.');
        return;
      }
      setUploading(true);
      try {
        const supabase = createClient();
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${userId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from('study-materials').upload(path, file, {
          cacheControl: '3600',
          upsert: false,
        });
        if (error) {
          toast.error(`Caricamento non riuscito: ${error.message}`);
          setUploading(false);
          return;
        }
        storagePath = path;
        mimeType = file.type;
        fileSize = file.size;
        fileName = file.name;
      } finally {
        setUploading(false);
      }
    }

    const formData = new FormData();
    formData.set('title', title);
    formData.set('type', type);
    formData.set('examId', examId);
    formData.set('url', url);
    formData.set('tags', tags);
    formData.set('notes', notes);
    formData.set('storagePath', storagePath);
    formData.set('fileName', fileName);
    formData.set('mimeType', mimeType);
    formData.set('fileSize', String(fileSize));
    for (const topicId of selectedTopics) formData.append('topicIds', topicId);

    startTransition(async () => {
      const result = await createResourceAction(formData);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setTitle('');
      setUrl('');
      setTags('');
      setNotes('');
      setFile(null);
      setSelectedTopics([]);
      router.refresh();
    });
  }

  async function open(resourceId: string) {
    const { url: signed } = await getResourceUrlAction(resourceId);
    if (!signed) {
      toast.error('Nessun file o indirizzo collegato a questa risorsa.');
      return;
    }
    window.open(signed, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Aggiungi una risorsa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="res-title">Titolo</Label>
              <Input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-type">Tipo</Label>
              <select
                id="res-type"
                value={type}
                onChange={(e) => setType(e.target.value as ResourceType)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="res-exam">Esame</Label>
              <select
                id="res-exam"
                value={examId}
                onChange={(e) => {
                  setExamId(e.target.value);
                  setSelectedTopics([]);
                }}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Nessuno</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-url">Indirizzo web (facoltativo)</Label>
              <Input
                id="res-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="res-file">File (max 50 MB)</Label>
              <Input
                id="res-file"
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                I file restano privati, in una cartella riservata al tuo account.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-tags">Tag (separati da virgola)</Label>
              <Input id="res-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>

          {availableTopics.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Collega agli argomenti</legend>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {availableTopics.map((topic) => (
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

          <div className="space-y-1.5">
            <Label htmlFor="res-notes">Note</Label>
            <Textarea id="res-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <Button onClick={submit} loading={pending || uploading}>
            <Upload className="h-4 w-4" aria-hidden />
            Salva risorsa
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca per titolo, tag o note"
            aria-label="Cerca tra le risorse"
            className="w-64 pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          aria-label="Filtra per tipo"
          className="h-10 rounded-md border border-input bg-card px-2 text-sm"
        >
          <option value="tutti">Tutti i tipi</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={examFilter}
          onChange={(e) => setExamFilter(e.target.value)}
          aria-label="Filtra per esame"
          className="h-10 rounded-md border border-input bg-card px-2 text-sm"
        >
          <option value="tutti">Tutti gli esami</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Library}
          title={resources.length === 0 ? 'Nessuna risorsa salvata' : 'Nessun risultato'}
          description={
            resources.length === 0
              ? 'Carica il primo PDF o incolla un link: potrai collegarlo agli argomenti e ritrovarlo durante le sessioni.'
              : 'Prova a cambiare i filtri o il testo cercato.'
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {filtered.map((resource) => {
            const Icon = iconFor(resource.type);
            return (
              <li key={resource.id}>
                <Card className="h-full">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{resource.title}</span>
                      </p>
                      <Badge variant="muted">{TYPE_LABELS[resource.type]}</Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {resource.examId ? examNames.get(resource.examId) : 'Nessun esame collegato'}
                      {resource.topicIds.length > 0
                        ? ` · ${resource.topicIds.length} argomenti collegati`
                        : ' · nessun argomento collegato'}
                    </p>

                    {resource.topicIds.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {resource.topicIds
                          .map((id) => topicTitles.get(id))
                          .filter(Boolean)
                          .slice(0, 3)
                          .join(', ')}
                        {resource.topicIds.length > 3 ? '…' : ''}
                      </p>
                    ) : null}

                    {resource.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {resource.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {resource.notes ? (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{resource.notes}</p>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {resource.url || resource.storagePath ? (
                        <Button size="sm" variant="outline" onClick={() => open(resource.id)}>
                          <ExternalLink className="h-4 w-4" aria-hidden />
                          Apri
                        </Button>
                      ) : null}
                      <ConfirmButton
                        trigger={
                          <Button size="sm" variant="ghost">
                            <Trash2 className="h-4 w-4" aria-hidden />
                            Elimina
                          </Button>
                        }
                        title="Eliminare la risorsa?"
                        description="Verrà eliminato anche l’eventuale file caricato. L’operazione non può essere annullata."
                        onConfirm={async () => {
                          const result = await deleteResourceAction(resource.id);
                          if (result.ok) toast.success(result.message);
                          else toast.error(result.message);
                          router.refresh();
                        }}
                      />
                      {resource.topicIds.length > 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const result = await updateResourceTopicsAction(resource.id, []);
                              if (result.ok) toast.success('Collegamenti rimossi.');
                              else toast.error(result.message);
                              router.refresh();
                            })
                          }
                        >
                          Scollega argomenti
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
