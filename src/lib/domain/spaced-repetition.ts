/**
 * Ripetizione dilazionata — versione semplice e trasparente.
 *
 * Intervalli di base: 1, 3, 7, 14, 30 giorni; oltre il quinto ripasso
 * l'intervallo cresce moltiplicando per il fattore di facilità.
 * Ogni calcolo restituisce anche la spiegazione da mostrare nella UI:
 * l'utente deve sempre poter capire perché è stata scelta quella data.
 */
import type { IsoDate, RecallGrade } from './types';
import { RECALL_GRADE_LABELS } from './types';
import { addDaysIso } from './dates';

export const BASE_INTERVALS = [1, 3, 7, 14, 30] as const;

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.5;
export const DEFAULT_EASE = 2.5;

export interface ReviewState {
  /** Numero di ripassi già completati con esito sufficiente. */
  repetition: number;
  intervalDays: number;
  ease: number;
}

export interface ReviewOutcome extends ReviewState {
  dueDate: IsoDate;
  /** Spiegazione leggibile del perché di questa data. */
  explanation: string;
  /** Variazione suggerita della padronanza dell'argomento (-1..+1 relativo). */
  masteryDelta: number;
}

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Number(ease.toFixed(2))));
}

/** Intervallo base per un dato numero di ripetizioni completate. */
export function baseInterval(repetition: number): number {
  if (repetition <= 0) return BASE_INTERVALS[0];
  const index = Math.min(repetition, BASE_INTERVALS.length - 1);
  return BASE_INTERVALS[index] ?? 30;
}

/**
 * Primo ripasso dopo una sessione di studio.
 * `selfReportedDays` permette all'utente di dire quando pensa di dover ripassare.
 */
export function scheduleFirstReview(
  studiedOn: IsoDate,
  recall: number,
  selfReportedDays?: number | null,
): ReviewOutcome {
  // Se ha ricordato poco, il primo ripasso è ravvicinato.
  const suggested = recall <= 2 ? 1 : recall === 3 ? 2 : 3;
  const days = selfReportedDays && selfReportedDays > 0 ? Math.min(selfReportedDays, 30) : suggested;
  const explanation =
    selfReportedDays && selfReportedDays > 0
      ? `Hai indicato tu il ripasso tra ${days} ${days === 1 ? 'giorno' : 'giorni'}.`
      : `Primo ripasso tra ${days} ${days === 1 ? 'giorno' : 'giorni'}: al termine della sessione hai valutato ${recall}/5 la capacità di ricordare senza guardare.`;
  return {
    repetition: 0,
    intervalDays: days,
    ease: DEFAULT_EASE,
    dueDate: addDaysIso(studiedOn, days),
    explanation,
    masteryDelta: 0,
  };
}

/**
 * Calcola il prossimo ripasso a partire dallo stato corrente e dal voto.
 *
 * - voto 0 → si riparte da capo (1 giorno) e la facilità cala
 * - voto 1 → si accorcia molto l'intervallo
 * - voto 2 → si mantiene circa l'intervallo attuale
 * - voto 3 → si prosegue con l'intervallo previsto
 * - voto 4 → si posticipa (intervallo aumentato)
 */
export function computeNextReview(
  state: ReviewState,
  grade: RecallGrade,
  reviewedOn: IsoDate,
): ReviewOutcome {
  const label = RECALL_GRADE_LABELS[grade];
  let repetition = state.repetition;
  let ease = state.ease || DEFAULT_EASE;
  let intervalDays: number;
  let masteryDelta: number;
  let reason: string;

  switch (grade) {
    case 0:
      repetition = 0;
      ease = clampEase(ease - 0.3);
      intervalDays = 1;
      masteryDelta = -0.25;
      reason = 'si riparte dal primo intervallo per ricostruire la memoria';
      break;
    case 1:
      repetition = Math.max(0, repetition - 1);
      ease = clampEase(ease - 0.15);
      intervalDays = Math.max(1, Math.round(state.intervalDays * 0.5));
      masteryDelta = -0.1;
      reason = 'l’intervallo è stato dimezzato perché il richiamo è stato faticoso';
      break;
    case 2:
      ease = clampEase(ease - 0.05);
      intervalDays = Math.max(1, Math.round(state.intervalDays * 0.8));
      masteryDelta = 0.03;
      reason = 'intervallo leggermente ridotto: il ricordo era solo parziale';
      break;
    case 3:
      repetition = repetition + 1;
      intervalDays = Math.max(baseInterval(repetition), Math.round(state.intervalDays * ease));
      masteryDelta = 0.12;
      reason = 'si procede con l’intervallo previsto dalla sequenza 1-3-7-14-30';
      break;
    case 4:
      repetition = repetition + 1;
      ease = clampEase(ease + 0.15);
      intervalDays = Math.max(
        baseInterval(repetition),
        Math.round(state.intervalDays * ease * 1.2),
      );
      masteryDelta = 0.2;
      reason = 'intervallo allungato perché il richiamo è stato immediato';
      break;
    default:
      intervalDays = state.intervalDays;
      masteryDelta = 0;
      reason = 'nessuna variazione';
  }

  intervalDays = Math.min(365, Math.max(1, intervalDays));

  return {
    repetition,
    intervalDays,
    ease,
    dueDate: addDaysIso(reviewedOn, intervalDays),
    masteryDelta,
    explanation: `Hai risposto «${label}»: ${reason}. Prossimo ripasso tra ${intervalDays} ${
      intervalDays === 1 ? 'giorno' : 'giorni'
    } (fattore di facilità ${ease.toFixed(2)}).`,
  };
}

/**
 * Se l'esame è vicino, un ripasso oltre la data dell'appello è inutile:
 * viene anticipato all'ultimo giorno utile.
 */
export function capReviewToExamDate(outcome: ReviewOutcome, examDate: IsoDate | null): ReviewOutcome {
  if (!examDate) return outcome;
  if (outcome.dueDate <= examDate) return outcome;
  return {
    ...outcome,
    dueDate: examDate,
    explanation: `${outcome.explanation} La data è stata anticipata al giorno dell'appello (${examDate}).`,
  };
}

/** Applica la variazione di padronanza mantenendola nell'intervallo 0..1. */
export function applyMasteryDelta(current: number, delta: number): number {
  return Math.min(1, Math.max(0, Number((current + delta).toFixed(3))));
}
