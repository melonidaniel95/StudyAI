/**
 * Pianificazione a partire dal materiale reale.
 *
 * Una risorsa (slide, dispensa, capitolo) viene divisa in SEGMENTI con un
 * intervallo di pagine. Da lì nascono stime di tempo credibili, perché basate
 * su quante pagine ci sono davvero e su quanto ci metti tu a farne una.
 *
 * Funzioni pure: nessuna dipendenza da PDF, React o database.
 */
import type { IsoDate } from './types';

/** Voce dell'indice estratta dal PDF. */
export interface OutlineEntry {
  title: string;
  /** Pagina di inizio, 1-based. */
  page: number;
  /** Livello di annidamento: 0 = capitolo principale. */
  level: number;
}

export interface Segment {
  title: string;
  pageStart: number;
  pageEnd: number;
  pageCount: number;
  estimatedMinutes: number;
  kind: 'teoria' | 'esercizi' | 'riferimento';
  position: number;
}

export interface SegmentOptions {
  /** Numero totale di pagine del documento. */
  pageCount: number;
  /** Minuti per pagina di teoria. */
  minutesPerPage: number;
  /** Minuti per pagina di esercizi. */
  minutesPerPageExercises?: number;
  /** Durata massima di una sessione: i segmenti più lunghi vengono divisi. */
  maxSessionMinutes: number;
  /** Durata minima sensata: i segmenti più corti vengono uniti al precedente. */
  minSessionMinutes: number;
  /** Titolo di base quando non c'è un indice (es. nome del file). */
  fallbackTitle: string;
  /** Difficoltà dell'esame 1..5: alza o abbassa la stima. */
  difficulty?: number;
}

/** Parole che segnalano una parte di esercizi, con ritmo diverso. */
const EXERCISE_HINTS = [
  'esercizi',
  'esercizio',
  'esercitazione',
  'problemi',
  'problema',
  'prova',
  'temi d',
  'quiz',
  'soluzioni',
];

const REFERENCE_HINTS = [
  'bibliografia',
  'riferimenti',
  'indice',
  'sommario',
  'copertina',
  'appendice',
  'ringraziamenti',
];

export function classifySegment(title: string): Segment['kind'] {
  const normalized = title.toLowerCase();
  if (EXERCISE_HINTS.some((hint) => normalized.includes(hint))) return 'esercizi';
  if (REFERENCE_HINTS.some((hint) => normalized.includes(hint))) return 'riferimento';
  return 'teoria';
}

/**
 * Fattore di difficoltà: un esame difficile richiede più tempo per pagina.
 * 1 → 0,8×  ·  3 → 1×  ·  5 → 1,3×
 */
export function difficultyFactor(difficulty = 3): number {
  const clamped = Math.min(5, Math.max(1, difficulty));
  return Number((0.8 + (clamped - 1) * 0.125).toFixed(3));
}

export function estimateMinutes(
  pages: number,
  minutesPerPage: number,
  kind: Segment['kind'] = 'teoria',
  difficulty = 3,
  minutesPerPageExercises?: number,
): number {
  if (pages <= 0) return 0;
  if (kind === 'riferimento') return 0;
  const rate = kind === 'esercizi' ? (minutesPerPageExercises ?? minutesPerPage * 2.5) : minutesPerPage;
  return Math.max(5, Math.round(pages * rate * difficultyFactor(difficulty)));
}

/**
 * Divide un documento in segmenti pianificabili.
 *
 * Con un indice: un segmento per voce di primo livello, con l'intervallo di
 * pagine che arriva fino alla voce successiva.
 * Senza indice: blocchi di pagine dimensionati sulla durata massima di sessione.
 *
 * In entrambi i casi i segmenti troppo lunghi vengono spezzati e quelli troppo
 * corti uniti, così ogni segmento è una sessione di studio sensata.
 */
export function buildSegments(outline: OutlineEntry[], options: SegmentOptions): Segment[] {
  const {
    pageCount,
    minutesPerPage,
    minutesPerPageExercises,
    maxSessionMinutes,
    minSessionMinutes,
    fallbackTitle,
    difficulty = 3,
  } = options;

  if (pageCount <= 0) return [];

  const topLevel = outline
    .filter((entry) => entry.level === 0 && entry.page >= 1 && entry.page <= pageCount)
    .sort((a, b) => a.page - b.page);

  // ---- 1. Blocchi grezzi ----
  interface RawBlock {
    title: string;
    pageStart: number;
    pageEnd: number;
  }
  const raw: RawBlock[] = [];

  if (topLevel.length >= 2) {
    topLevel.forEach((entry, index) => {
      const next = topLevel[index + 1];
      const pageEnd = next ? Math.max(entry.page, next.page - 1) : pageCount;
      raw.push({ title: entry.title.trim() || `${fallbackTitle} — parte ${index + 1}`, pageStart: entry.page, pageEnd });
    });
  } else {
    // Nessun indice utile: blocchi omogenei dimensionati sulla sessione tipo.
    const pagesPerSession = Math.max(
      1,
      Math.floor(maxSessionMinutes / Math.max(0.2, minutesPerPage * difficultyFactor(difficulty))),
    );
    let page = 1;
    let index = 1;
    while (page <= pageCount) {
      const pageEnd = Math.min(pageCount, page + pagesPerSession - 1);
      raw.push({ title: `${fallbackTitle} — parte ${index}`, pageStart: page, pageEnd });
      page = pageEnd + 1;
      index += 1;
    }
  }

  // ---- 2. Divisione dei blocchi troppo lunghi ----
  const split: RawBlock[] = [];
  for (const block of raw) {
    const kind = classifySegment(block.title);
    const pages = block.pageEnd - block.pageStart + 1;
    const minutes = estimateMinutes(pages, minutesPerPage, kind, difficulty, minutesPerPageExercises);

    if (minutes <= maxSessionMinutes || kind === 'riferimento') {
      split.push(block);
      continue;
    }

    const parts = Math.ceil(minutes / maxSessionMinutes);
    const pagesPerPart = Math.max(1, Math.ceil(pages / parts));
    let page = block.pageStart;
    let partIndex = 1;
    while (page <= block.pageEnd) {
      const pageEnd = Math.min(block.pageEnd, page + pagesPerPart - 1);
      split.push({
        title: parts > 1 ? `${block.title} (${partIndex}/${parts})` : block.title,
        pageStart: page,
        pageEnd,
      });
      page = pageEnd + 1;
      partIndex += 1;
    }
  }

  // ---- 3. Unione dei blocchi troppo corti ----
  const merged: RawBlock[] = [];
  for (const block of split) {
    const kind = classifySegment(block.title);
    const pages = block.pageEnd - block.pageStart + 1;
    const minutes = estimateMinutes(pages, minutesPerPage, kind, difficulty, minutesPerPageExercises);
    const previous = merged[merged.length - 1];

    const isTooShort = minutes > 0 && minutes < minSessionMinutes;
    // L'unione non deve mai produrre un segmento più lungo di una sessione.
    const mergedMinutes = previous
      ? estimateMinutes(
          block.pageEnd - previous.pageStart + 1,
          minutesPerPage,
          kind,
          difficulty,
          minutesPerPageExercises,
        )
      : Number.POSITIVE_INFINITY;
    const canMerge =
      previous !== undefined &&
      previous.pageEnd + 1 === block.pageStart &&
      classifySegment(previous.title) === kind &&
      mergedMinutes <= maxSessionMinutes;

    if (isTooShort && canMerge && previous) {
      previous.pageEnd = block.pageEnd;
      if (!previous.title.includes('+')) previous.title = `${previous.title} + ${block.title}`;
      continue;
    }
    merged.push({ ...block });
  }

  // ---- 4. Segmenti finali ----
  return merged.map((block, index) => {
    const kind = classifySegment(block.title);
    const pages = block.pageEnd - block.pageStart + 1;
    return {
      title: block.title.slice(0, 200),
      pageStart: block.pageStart,
      pageEnd: block.pageEnd,
      pageCount: pages,
      kind,
      estimatedMinutes: estimateMinutes(
        pages,
        minutesPerPage,
        kind,
        difficulty,
        minutesPerPageExercises,
      ),
      position: index + 1,
    };
  });
}

/** Riepilogo di un caricamento, mostrato prima della conferma. */
export interface MaterialSummary {
  files: number;
  pages: number;
  segments: number;
  minutes: number;
  exerciseMinutes: number;
}

export function summarizeSegments(groups: Segment[][]): MaterialSummary {
  const all = groups.flat();
  return {
    files: groups.length,
    pages: all.reduce((sum, segment) => sum + segment.pageCount, 0),
    segments: all.filter((segment) => segment.kind !== 'riferimento').length,
    minutes: all.reduce((sum, segment) => sum + segment.estimatedMinutes, 0),
    exerciseMinutes: all
      .filter((segment) => segment.kind === 'esercizi')
      .reduce((sum, segment) => sum + segment.estimatedMinutes, 0),
  };
}

// ---------------------------------------------------------------- taratura

export interface PaceSample {
  pages: number;
  minutes: number;
  date: IsoDate;
}

export interface PaceResult {
  minutesPerPage: number;
  samples: number;
  /** Quanto ci si può fidare del valore (0..1). */
  confidence: number;
  explanation: string;
}

export const MIN_PACE = 0.2;
export const MAX_PACE = 30;

/**
 * Ricalcola i minuti per pagina dalle sessioni realmente svolte.
 *
 * - servono almeno 3 misurazioni, altrimenti si tiene il valore corrente;
 * - le sessioni recenti pesano di più;
 * - il valore si muove gradualmente verso la misura (al massimo ±40% per volta)
 *   così una singola giornata storta non stravolge il piano.
 */
export function calibratePace(current: number, samples: PaceSample[]): PaceResult {
  const usable = samples.filter((sample) => sample.pages > 0 && sample.minutes > 0);

  if (usable.length < 3) {
    return {
      minutesPerPage: current,
      samples: usable.length,
      confidence: 0,
      explanation: `Servono almeno 3 sessioni con le pagine registrate per tarare il ritmo (finora ${usable.length}).`,
    };
  }

  const sorted = [...usable].sort((a, b) => a.date.localeCompare(b.date));
  let weightedPages = 0;
  let weightedMinutes = 0;
  sorted.forEach((sample, index) => {
    const weight = 1 + index / Math.max(1, sorted.length - 1); // da 1 a 2
    weightedPages += sample.pages * weight;
    weightedMinutes += sample.minutes * weight;
  });

  const measured = weightedMinutes / weightedPages;
  const lowerBound = current * 0.6;
  const upperBound = current * 1.4;
  const smoothed = Math.min(Math.max(measured, lowerBound), upperBound);
  const minutesPerPage = Number(Math.min(MAX_PACE, Math.max(MIN_PACE, smoothed)).toFixed(2));

  const confidence = Math.min(1, usable.length / 10);
  const direction =
    minutesPerPage > current
      ? 'più lento di quanto stimato: le sessioni future avranno meno pagine'
      : minutesPerPage < current
        ? 'più veloce di quanto stimato: le sessioni future copriranno più pagine'
        : 'in linea con la stima attuale';

  return {
    minutesPerPage,
    samples: usable.length,
    confidence,
    explanation: `Su ${usable.length} sessioni hai studiato in media ${measured.toFixed(1)} minuti a pagina, ${direction}. Ritmo aggiornato da ${current.toFixed(1)} a ${minutesPerPage.toFixed(1)} min/pagina.`,
  };
}

/** Avanzamento di una risorsa in pagine, non in "aperto/non aperto". */
export function resourceProgress(segments: Array<{ pageCount: number; pagesDone: number }>): number {
  const total = segments.reduce((sum, segment) => sum + segment.pageCount, 0);
  if (total === 0) return 0;
  const done = segments.reduce((sum, segment) => sum + Math.min(segment.pagesDone, segment.pageCount), 0);
  return Math.min(1, done / total);
}
