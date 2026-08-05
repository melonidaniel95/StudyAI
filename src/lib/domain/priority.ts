/**
 * Punteggio di priorità, spiegabile nell'interfaccia.
 *
 * Ogni componente restituisce un valore 0..1 e una frase in italiano: la UI
 * mostra sempre "perché" un'attività è in cima al piano di oggi.
 */
import { clamp01 } from './readiness';
import { daysBetween } from './dates';
import type { IsoDate, ScoreComponent } from './types';

export interface PriorityInput {
  today: IsoDate;
  examDate: IsoDate | null;
  /** 1..5, impostata dall'utente. */
  manualPriority: number;
  /** 1..5 */
  difficulty: number;
  /** 0..1 */
  readiness: number;
  /** Numero di esami che dipendono da questo (prerequisito). */
  unlocksExams: number;
  /** Minuti di attività non svolte da recuperare. */
  backlogMinutes: number;
  /** Errori aperti registrati nel quaderno. */
  openErrors: number;
  /** Minuti ancora necessari / minuti disponibili prima dell'appello (>1 = a rischio). */
  loadRatio: number | null;
}

export interface PriorityResult {
  score: number; // 0..100
  components: ScoreComponent[];
  explanation: string[];
}

const WEIGHTS = {
  urgency: 0.3,
  gap: 0.22,
  load: 0.13,
  prerequisites: 0.1,
  difficulty: 0.08,
  backlog: 0.09,
  errors: 0.03,
  manual: 0.05,
} as const;

/** Urgenza: cresce rapidamente sotto i 30 giorni dall'appello. */
export function urgencyFromDays(daysLeft: number | null): number {
  if (daysLeft === null) return 0.15; // nessuna data: urgenza bassa ma non nulla
  if (daysLeft < 0) return 0; // appello già passato
  if (daysLeft === 0) return 1;
  if (daysLeft <= 7) return 1 - (daysLeft / 7) * 0.15; // 0.85..1
  if (daysLeft <= 30) return 0.85 - ((daysLeft - 7) / 23) * 0.3; // 0.55..0.85
  if (daysLeft <= 90) return 0.55 - ((daysLeft - 30) / 60) * 0.35; // 0.20..0.55
  return Math.max(0.05, 0.2 - (daysLeft - 90) / 1000);
}

export function computePriority(input: PriorityInput): PriorityResult {
  const daysLeft = input.examDate ? daysBetween(input.today, input.examDate) : null;

  const urgency = urgencyFromDays(daysLeft);
  const gap = clamp01(1 - input.readiness);
  const load = input.loadRatio === null ? 0.3 : clamp01((input.loadRatio - 0.6) / 0.9);
  const prerequisites = clamp01(input.unlocksExams / 3);
  const difficulty = clamp01((input.difficulty - 1) / 4);
  const backlog = clamp01(input.backlogMinutes / 300);
  const errors = clamp01(input.openErrors / 10);
  const manual = clamp01((input.manualPriority - 1) / 4);

  const components: ScoreComponent[] = [
    {
      key: 'urgency',
      label: 'Urgenza',
      value: urgency,
      weight: WEIGHTS.urgency,
      contribution: urgency * WEIGHTS.urgency,
      applicable: true,
      explanation:
        daysLeft === null
          ? 'Nessun appello selezionato: urgenza minima.'
          : daysLeft < 0
            ? 'L’appello selezionato è già passato.'
            : `Mancano ${daysLeft} giorni all’appello.`,
    },
    {
      key: 'gap',
      label: 'Distanza dalla preparazione',
      value: gap,
      weight: WEIGHTS.gap,
      contribution: gap * WEIGHTS.gap,
      applicable: true,
      explanation: `Preparazione attuale ${Math.round(input.readiness * 100)}%: manca il ${Math.round(gap * 100)}%.`,
    },
    {
      key: 'load',
      label: 'Carico rispetto al tempo',
      value: load,
      weight: WEIGHTS.load,
      contribution: load * WEIGHTS.load,
      applicable: true,
      explanation:
        input.loadRatio === null
          ? 'Tempo necessario non ancora stimabile.'
          : `Servono circa ${Math.round(input.loadRatio * 100)}% delle ore disponibili prima dell’appello.`,
    },
    {
      key: 'prerequisites',
      label: 'Prerequisito per altri esami',
      value: prerequisites,
      weight: WEIGHTS.prerequisites,
      contribution: prerequisites * WEIGHTS.prerequisites,
      applicable: input.unlocksExams > 0,
      explanation:
        input.unlocksExams > 0
          ? `È prerequisito di ${input.unlocksExams} ${input.unlocksExams === 1 ? 'esame' : 'esami'}.`
          : 'Non è prerequisito di altri esami.',
    },
    {
      key: 'difficulty',
      label: 'Difficoltà percepita',
      value: difficulty,
      weight: WEIGHTS.difficulty,
      contribution: difficulty * WEIGHTS.difficulty,
      applicable: true,
      explanation: `Difficoltà dichiarata ${input.difficulty}/5.`,
    },
    {
      key: 'backlog',
      label: 'Attività arretrate',
      value: backlog,
      weight: WEIGHTS.backlog,
      contribution: backlog * WEIGHTS.backlog,
      applicable: input.backlogMinutes > 0,
      explanation:
        input.backlogMinutes > 0
          ? `${Math.round(input.backlogMinutes)} minuti di attività da recuperare.`
          : 'Nessuna attività arretrata.',
    },
    {
      key: 'errors',
      label: 'Errori ricorrenti',
      value: errors,
      weight: WEIGHTS.errors,
      contribution: errors * WEIGHTS.errors,
      applicable: input.openErrors > 0,
      explanation:
        input.openErrors > 0
          ? `${input.openErrors} errori ancora aperti nel quaderno.`
          : 'Nessun errore aperto.',
    },
    {
      key: 'manual',
      label: 'Priorità impostata da te',
      value: manual,
      weight: WEIGHTS.manual,
      contribution: manual * WEIGHTS.manual,
      applicable: true,
      explanation: `Hai impostato priorità ${input.manualPriority}/5.`,
    },
  ];

  const score = Number(
    (components.reduce((sum, c) => sum + c.contribution, 0) * 100).toFixed(2),
  );

  // Le tre motivazioni più rilevanti, in italiano, per la UI.
  const explanation = [...components]
    .filter((c) => c.applicable && c.contribution > 0.01)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map((c) => c.explanation);

  return { score, components, explanation };
}
