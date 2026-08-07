'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FileUp, Layers, Loader2, Trash2, Upload, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { createClient } from '@/lib/supabase/client';
import {
  estimateFormulaDensity,
  extractPagesText,
  extractPdfStructure,
  guessLectureNumber,
  titleFromFileName,
} from '@/lib/pdf/extract';
import {
  buildSegments,
  summarizeSegments,
  type Segment,
} from '@/lib/domain/materials';
import { importMaterialAction } from '@/server/actions/materials';
import { ACCEPT_ATTRIBUTE, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/uploads';
import { formatMinutes } from '@/lib/domain/dates';

interface PreparedFile {
  file: File;
  title: string;
  lectureNumber: number | null;
  pageCount: number;
  outlineSource: 'indice' | 'titoli' | 'nessuna';
  segments: Segment[];
  /** Testo per blocco, indicizzato per pagina iniziale: alimenta l'analisi AI. */
  texts: Record<number, { text: string; wordCount: number; formulaDensity: number }>;
  error?: string;
}

interface MaterialImportProps {
  examId: string;
  userId: string;
  examName: string;
  difficulty: number;
  minutesPerPage: number;
  minutesPerPageExercises: number;
  maxSessionMinutes: number;
  minSessionMinutes: number;
}

const SOURCE_LABELS: Record<PreparedFile['outlineSource'], string> = {
  indice: 'indice del PDF',
  titoli: 'titoli delle pagine',
  nessuna: 'blocchi omogenei',
};

export function MaterialImport({
  examId,
  userId,
  examName,
  difficulty,
  minutesPerPage,
  minutesPerPageExercises,
  maxSessionMinutes,
  minSessionMinutes,
}: MaterialImportProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [prepared, setPrepared] = useState<PreparedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pace, setPace] = useState(minutesPerPage);
  const [paceExercises, setPaceExercises] = useState(minutesPerPageExercises);

  /** Ricostruisce i segmenti quando cambia il ritmo, senza rileggere i PDF. */
  function rebuild(files: PreparedFile[], teoria: number, esercizi: number): PreparedFile[] {
    return files.map((item) => ({
      ...item,
      segments:
        item.pageCount > 0
          ? buildSegments(
              item.outlineSource === 'nessuna'
                ? []
                : item.segments.map((segment) => ({
                    title: segment.title.replace(/\s\(\d+\/\d+\)$/, ''),
                    page: segment.pageStart,
                    level: 0,
                  })),
              {
                pageCount: item.pageCount,
                minutesPerPage: teoria,
                minutesPerPageExercises: esercizi,
                maxSessionMinutes,
                minSessionMinutes,
                fallbackTitle: item.title,
                difficulty,
              },
            )
          : [],
    }));
  }

  async function analyze(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, 40);
    setAnalyzing(true);
    setProgress({ done: 0, total: files.length });

    const results: PreparedFile[] = [];

    for (const [index, file] of files.entries()) {
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          file,
          title: titleFromFileName(file.name),
          lectureNumber: null,
          pageCount: 0,
          outlineSource: 'nessuna',
          segments: [],
          texts: {},
          error: 'Supera il limite di 50 MB.',
        });
        setProgress({ done: index + 1, total: files.length });
        continue;
      }

      const extracted = await extractPdfStructure(file);
      const title = titleFromFileName(file.name);

      const segments =
        extracted.pageCount > 0
          ? buildSegments(extracted.outline, {
              pageCount: extracted.pageCount,
              minutesPerPage: pace,
              minutesPerPageExercises: paceExercises,
              maxSessionMinutes,
              minSessionMinutes,
              fallbackTitle: title,
              difficulty,
            })
          : [];

      /*
       * Testo di ogni blocco, estratto ora che il file è in memoria: verrà
       * salvato insieme al blocco e riusato dall'analisi AI senza riscaricare
       * il PDF da Supabase.
       */
      const texts: PreparedFile['texts'] = {};
      for (const segment of segments) {
        if (segment.kind === 'riferimento') continue;
        const { text, wordCount } = await extractPagesText(
          file,
          segment.pageStart,
          segment.pageEnd,
          3500,
        );
        texts[segment.pageStart] = {
          text,
          wordCount,
          formulaDensity: estimateFormulaDensity(text),
        };
      }

      results.push({
        file,
        title,
        lectureNumber: guessLectureNumber(file.name),
        pageCount: extracted.pageCount,
        outlineSource: extracted.source,
        error: extracted.error,
        segments,
        texts,
      });

      setProgress({ done: index + 1, total: files.length });
    }

    setPrepared((current) => [...current, ...results]);
    setAnalyzing(false);
    setProgress(null);

    const ok = results.filter((item) => item.segments.length > 0).length;
    if (ok > 0) toast.success(`${ok} file analizzati. Controlla la proposta e conferma.`);
    if (ok < results.length) toast.warning(`${results.length - ok} file non sono stati letti.`);
  }

  async function confirm() {
    const valid = prepared.filter((item) => item.segments.length > 0 && !item.error);
    if (valid.length === 0) {
      toast.error('Non c’è nessun file valido da importare.');
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const payloadFiles: Parameters<typeof importMaterialAction>[0]['files'] = [];

    try {
      for (const item of valid) {
        const safeName = item.file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${userId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage
          .from('study-materials')
          .upload(path, item.file, { cacheControl: '3600', upsert: false });

        if (error) {
          toast.error(`Caricamento non riuscito per «${item.title}»: ${error.message}`);
          setUploading(false);
          return;
        }

        payloadFiles.push({
          title: item.title,
          fileName: item.file.name,
          storagePath: path,
          mimeType: item.file.type || 'application/pdf',
          fileSize: item.file.size,
          pageCount: item.pageCount,
          lectureNumber: item.lectureNumber,
          type: 'pdf',
          outlineSource: item.outlineSource,
          segments: item.segments.map((segment) => {
            const estratto = item.texts[segment.pageStart];
            return {
              title: segment.title,
              pageStart: segment.pageStart,
              pageEnd: segment.pageEnd,
              estimatedMinutes: segment.estimatedMinutes,
              kind: segment.kind,
              difficulty,
              textSample: estratto?.text?.slice(0, 8000),
              wordCount: estratto?.wordCount,
              formulaDensity: estratto?.formulaDensity,
            };
          }),
        });
      }
    } finally {
      setUploading(false);
    }

    startTransition(async () => {
      const result = await importMaterialAction({ examId, files: payloadFiles });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message, { duration: 9000 });
      setPrepared([]);
      router.refresh();
    });
  }

  const summary = summarizeSegments(prepared.map((item) => item.segments));
  const validFiles = prepared.filter((item) => item.segments.length > 0 && !item.error);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Carica il materiale di {examName}</CardTitle>
          <CardDescription>
            Seleziona tutte le slide e le dispense insieme. StudyAI legge il PDF nel tuo browser,
            conta le pagine, ricava la struttura dall’indice e propone i blocchi da studiare. Nessun
            file viene analizzato altrove.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pace-teoria">Minuti per pagina — teoria</Label>
              <Input
                id="pace-teoria"
                type="number"
                min={0.1}
                max={60}
                step={0.5}
                value={pace}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPace(value);
                  setPrepared((current) => rebuild(current, value, paceExercises));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pace-esercizi">Minuti per pagina — esercizi</Label>
              <Input
                id="pace-esercizi"
                type="number"
                min={0.1}
                max={90}
                step={0.5}
                value={paceExercises}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPaceExercises(value);
                  setPrepared((current) => rebuild(current, pace, value));
                }}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Sono i valori di partenza. Dopo tre sessioni con le pagine registrate StudyAI li taratura
            da solo sui tuoi tempi reali.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="material-files">File PDF (puoi selezionarne più di uno)</Label>
            <Input
              id="material-files"
              type="file"
              multiple
              accept="application/pdf"
              disabled={analyzing || uploading || pending}
              onChange={(event) => {
                void analyze(event.target.files);
                event.target.value = '';
              }}
            />
          </div>

          {analyzing && progress ? (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Analisi in corso: {progress.done} di {progress.total}
              </p>
              <Progress
                value={Math.round((progress.done / progress.total) * 100)}
                aria-label="Analisi dei file"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {prepared.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Proposta di programma</span>
              <Badge variant="accent">Da verificare</Badge>
            </CardTitle>
            <CardDescription>
              {summary.files} file · {summary.pages} pagine · {summary.segments} blocchi ·{' '}
              {formatMinutes(summary.minutes)} di studio stimati
              {summary.exerciseMinutes > 0
                ? ` (di cui ${formatMinutes(summary.exerciseMinutes)} di esercizi)`
                : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-3">
              {prepared.map((item, fileIndex) => (
                <li key={`${item.file.name}-${fileIndex}`} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Input
                        value={item.title}
                        aria-label="Titolo del materiale"
                        className="h-9"
                        onChange={(event) =>
                          setPrepared((current) =>
                            current.map((entry, index) =>
                              index === fileIndex ? { ...entry, title: event.target.value } : entry,
                            ),
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {item.error ? (
                          <span className="text-destructive">{item.error}</span>
                        ) : (
                          <>
                            {item.pageCount} pagine · struttura da {SOURCE_LABELS[item.outlineSource]}
                            {item.lectureNumber !== null ? ` · lezione ${item.lectureNumber}` : ''}
                          </>
                        )}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Rimuovi ${item.title}`}
                      onClick={() =>
                        setPrepared((current) => current.filter((_, index) => index !== fileIndex))
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>

                  {item.segments.length > 0 ? (
                    <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs">
                      {item.segments.map((segment, segmentIndex) => (
                        <li
                          key={`${segment.title}-${segmentIndex}`}
                          className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{segment.title}</span>
                            <span className="text-muted-foreground">
                              {' '}
                              · pagine {segment.pageStart}-{segment.pageEnd}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {segment.kind !== 'teoria' ? (
                              <Badge variant={segment.kind === 'esercizi' ? 'secondary' : 'muted'}>
                                {segment.kind === 'esercizi' ? 'esercizi' : 'riferimento'}
                              </Badge>
                            ) : null}
                            <span className="tabular-nums text-muted-foreground">
                              {segment.estimatedMinutes > 0
                                ? formatMinutes(segment.estimatedMinutes)
                                : '—'}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button
                onClick={confirm}
                loading={uploading || pending}
                disabled={validFiles.length === 0}
              >
                <Upload className="h-4 w-4" aria-hidden />
                Carica e crea il programma ({validFiles.length})
              </Button>
              <Button variant="ghost" onClick={() => setPrepared([])} disabled={uploading || pending}>
                Annulla
              </Button>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Alla conferma ogni file diventa un modulo del programma e ogni blocco un argomento con
              il suo intervallo di pagine. Poi rigenera il piano: le attività diranno esattamente
              quali slide studiare.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed bg-muted/30 shadow-none">
          <CardContent className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <FileUp className="h-6 w-6" aria-hidden />
            </span>
            <p className="font-medium">Nessun materiale ancora caricato</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Carica le slide del corso: da lì nascono il programma e un piano che ti dice quali
              pagine coprire ogni giorno, invece di stime a occhio.
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              Formati accettati: PDF fino a 50 MB ciascuno
            </p>
          </CardContent>
        </Card>
      )}

      <p className="sr-only">
        Tipi di file consentiti: {ALLOWED_MIME_TYPES.join(', ')}.
      </p>
    </div>
  );
}
