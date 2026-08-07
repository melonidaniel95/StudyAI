'use client';

/**
 * Estrazione della struttura da un PDF, interamente nel browser.
 *
 * Legge numero di pagine e indice (segnalibri). Se l'indice manca, prova a
 * ricavare i titoli dal testo della prima riga di ogni pagina: sulle slide
 * funziona quasi sempre, perché il titolo è in cima.
 *
 * Nessun file viene inviato da nessuna parte: pdf.js gira nel browser.
 *
 * pdf.js viene caricato a RUNTIME dalla cartella public (`/pdf.min.mjs`), non
 * dal bundler: così è una dipendenza facoltativa. Se il file manca, questa
 * funzione restituisce un errore leggibile e il resto dell'applicazione
 * continua a funzionare normalmente.
 */
import type { OutlineEntry } from '@/lib/domain/materials';

export interface ExtractedPdf {
  pageCount: number;
  outline: OutlineEntry[];
  /** Come è stata ricavata la struttura, per spiegarlo nell'interfaccia. */
  source: 'indice' | 'titoli' | 'nessuna';
  error?: string;
}

/* --- Tipi minimi di pdf.js: evitano una dipendenza di compilazione --- */
interface PdfOutlineItem {
  title?: string;
  dest?: string | unknown[] | null;
  items?: PdfOutlineItem[];
}

interface PdfTextItem {
  str?: string;
  transform?: number[];
}

interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  cleanup(): void;
}

interface PdfDocument {
  numPages: number;
  getOutline(): Promise<PdfOutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  getPage(pageNumber: number): Promise<PdfPage>;
}

interface PdfJsModule {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(options: { data: ArrayBuffer }): { promise: Promise<PdfDocument> };
}

let pdfjsPromise: Promise<PdfJsModule> | null = null;

/** Errore mostrato quando pdf.js non è disponibile. */
export const PDF_MISSING_MESSAGE =
  'Analisi dei PDF non disponibile: esegui «npm install» e poi «npm run setup:pdf-worker». Tutte le altre funzioni restano utilizzabili.';

async function loadPdfJs(): Promise<PdfJsModule> {
  if (pdfjsPromise) return pdfjsPromise;

  pdfjsPromise = (async () => {
    /*
     * webpackIgnore: il percorso viene risolto dal browser, non dal bundler.
     * L'indirezione tramite variabile evita che TypeScript cerchi i tipi di un
     * modulo che a compilazione non esiste.
     */
    const percorso = '/pdf.min.mjs';
    const pdfjs = (await import(/* webpackIgnore: true */ percorso)) as unknown as PdfJsModule;
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return pdfjs;
  })();

  try {
    return await pdfjsPromise;
  } catch (error) {
    pdfjsPromise = null;
    throw error;
  }
}

/** Indica se l'analisi dei PDF è utilizzabile in questo ambiente. */
export async function isPdfSupportAvailable(): Promise<boolean> {
  try {
    await loadPdfJs();
    return true;
  } catch {
    return false;
  }
}

/** Titoli ricorrenti che non identificano un argomento. */
const IGNORED_TITLES = new Set([
  '',
  'sommario',
  'agenda',
  'outline',
  'contents',
  'indice',
]);

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function extractPdfStructure(file: File): Promise<ExtractedPdf> {
  try {
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const document = await pdfjs.getDocument({ data: buffer }).promise;
    const pageCount = document.numPages;

    // ---- 1. Indice (segnalibri) ----
    const rawOutline = await document.getOutline().catch(() => null);
    if (rawOutline && rawOutline.length > 0) {
      const entries: OutlineEntry[] = [];

      const walk = async (
        items: Awaited<ReturnType<typeof document.getOutline>>,
        level: number,
      ): Promise<void> => {
        if (!items) return;
        for (const item of items) {
          let page = 0;
          try {
            const destination =
              typeof item.dest === 'string'
                ? await document.getDestination(item.dest)
                : item.dest;
            if (Array.isArray(destination) && destination[0]) {
              const index = await document.getPageIndex(destination[0]);
              page = index + 1;
            }
          } catch {
            page = 0;
          }
          const title = normalize(item.title ?? '');
          if (page > 0 && title && !IGNORED_TITLES.has(title.toLowerCase())) {
            entries.push({ title, page, level });
          }
          if (item.items && item.items.length > 0) await walk(item.items, level + 1);
        }
      };

      await walk(rawOutline, 0);

      if (entries.length >= 2) {
        entries.sort((a, b) => a.page - b.page || a.level - b.level);
        return { pageCount, outline: entries, source: 'indice' };
      }
    }

    // ---- 2. Titoli in cima alle pagine (tipico delle slide) ----
    const titles: OutlineEntry[] = [];
    const maxPagesToScan = Math.min(pageCount, 400);
    let previousTitle = '';

    for (let pageNumber = 1; pageNumber <= maxPagesToScan; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();

      // Prende gli elementi più in alto nella pagina.
      const items = content.items
        .filter((item): item is typeof item & { str: string; transform: number[] } =>
          'str' in item && 'transform' in item,
        )
        .filter((item) => normalize(item.str).length > 0);

      if (items.length === 0) {
        page.cleanup();
        continue;
      }

      const topY = Math.max(...items.map((item) => item.transform[5] ?? 0));
      const title = normalize(
        items
          .filter((item) => (item.transform[5] ?? 0) >= topY - 4)
          .map((item) => item.str)
          .join(' '),
      ).slice(0, 120);

      page.cleanup();

      if (!title || IGNORED_TITLES.has(title.toLowerCase())) continue;
      // Un nuovo argomento inizia quando il titolo cambia davvero.
      if (title.toLowerCase() === previousTitle.toLowerCase()) continue;
      previousTitle = title;
      titles.push({ title, page: pageNumber, level: 0 });
    }

    // Troppi titoli distinti significa che ogni slide ha un titolo diverso:
    // in quel caso la struttura non è affidabile e conviene procedere a blocchi.
    const reliable = titles.length >= 2 && titles.length <= Math.max(3, pageCount / 3);

    return reliable
      ? { pageCount, outline: titles, source: 'titoli' }
      : { pageCount, outline: [], source: 'nessuna' };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const missing = /Failed to fetch|dynamically imported module|404/i.test(message);
    return {
      pageCount: 0,
      outline: [],
      source: 'nessuna',
      error: missing ? PDF_MISSING_MESSAGE : `Non è stato possibile leggere il PDF: ${message}`,
    };
  }
}

/**
 * Densità di formule e simboli matematici in un testo (0..1).
 *
 * Serve a capire quanto è "pesante" una pagina: una slide piena di equazioni
 * richiede molto più tempo di una pagina discorsiva, a parità di parole.
 */
export function estimateFormulaDensity(text: string): number {
  if (!text) return 0;
  const simboli = text.match(
    /[=<>≤≥≈≠∑∏∫∂∇√±×÷·∞→←⇒⇔∈∉⊂∪∩∀∃αβγδεθλμνπρσςτφχψωΓΔΘΛΞΠΣΦΨΩ]|\b(?:sin|cos|tan|log|ln|exp|lim|max|min|arg)\b|\^|_\{|\\frac/g,
  );
  const parole = text.split(/\s+/).filter(Boolean).length;
  if (parole === 0) return 0;
  // ~1 simbolo ogni 5 parole = densità piena
  return Math.min(1, Number((((simboli?.length ?? 0) / parole) * 5).toFixed(3)));
}

/** Testo di un intervallo di pagine, con un tetto di caratteri. */
export async function extractPagesText(
  file: File,
  pageStart: number,
  pageEnd: number,
  maxChars = 4000,
): Promise<{ text: string; wordCount: number }> {
  try {
    const pdfjs = await loadPdfJs();
    const buffer = await file.arrayBuffer();
    const document = await pdfjs.getDocument({ data: buffer }).promise;

    const parti: string[] = [];
    let caratteri = 0;
    let parole = 0;

    const ultima = Math.min(pageEnd, document.numPages);
    for (let numero = pageStart; numero <= ultima; numero += 1) {
      const page = await document.getPage(numero);
      const content = await page.getTextContent();
      const testo = normalize(content.items.map((item) => item.str ?? '').join(' '));
      page.cleanup();

      parole += testo.split(/\s+/).filter(Boolean).length;
      if (caratteri < maxChars) {
        const spazio = maxChars - caratteri;
        parti.push(testo.slice(0, spazio));
        caratteri += Math.min(testo.length, spazio);
      }
    }

    return { text: parti.join('\n').trim(), wordCount: parole };
  } catch {
    return { text: '', wordCount: 0 };
  }
}

/** Numero di lezione ricavato dal nome del file (es. "L03", "lezione 4"). */
export function guessLectureNumber(fileName: string): number | null {
  const patterns = [
    /(?:^|[^a-z])l(?:ez(?:ione)?)?[\s._-]*(\d{1,2})(?:[^\d]|$)/i,
    /(?:^|[^a-z])(?:cap(?:itolo)?|unit[àa])[\s._-]*(\d{1,2})(?:[^\d]|$)/i,
    /(?:^|[^\d])(\d{1,2})[\s._-]*(?:lezione|lez)/i,
  ];
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    const value = match?.[1];
    if (value) {
      const number = Number(value);
      if (Number.isInteger(number) && number >= 0 && number <= 99) return number;
    }
  }
  return null;
}

/** Titolo leggibile a partire dal nome del file. */
export function titleFromFileName(fileName: string): string {
  return normalize(
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s{2,}/g, ' '),
  ).slice(0, 200);
}
