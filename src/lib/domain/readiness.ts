/**
 * Calcolo della preparazione reale.
 *
 * Principio: leggere il programma non è "essere preparati". Il punteggio combina
 * copertura effettiva, recupero attivo, esercizi, simulazioni e regolarità dei
 * ripassi. Ogni componente è accompagnata da una spiegazione mostrata nella UI.
 *
 * Se una componente non è applicabile (es. esercizi in un esame solo orale)
 * il suo peso viene redistribuito proporzionalmente sulle altre.
 */
import {
  DEFAULT_READINESS_WEIGHTS,
  type ReadinessInput,
  type ReadinessResult,
  type ReadinessWeights,
  type ScoreComponent,
  type TopicStatus,
} from './types';

/** Quanto "vale" un argomento in termini di copertura, in base al suo stato. */
const STATUS_COVERAGE: Record<TopicStatus, number> = {
  non_iniziato: 0,
  in_corso: 0.35,
  studiato: 0.7,
  da_ripassare: 0.6,
  consolidato: 1,
};

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeWeights(weights: ReadinessWeights): ReadinessWeights {
  const total =
    weights.coverage +
    weights.activeRecall +
    weights.exercises +
    weights.mock +
    weights.reviewRegularity;
  if (total <= 0) return DEFAULT_READINESS_WEIGHTS;
  return {
    coverage: weights.coverage / total,
    activeRecall: weights.activeRecall / total,
    exercises: weights.exercises / total,
    mock: weights.mock / total,
    reviewRegularity: weights.reviewRegularity / total,
  };
}

/**
 * Copertura del programma pesata sul tempo stimato: un capitolo lungo pesa più
 * di uno breve. Ogni argomento contribuisce in base a stato e padronanza.
 */
export function computeCoverage(topics: ReadinessInput['topics']): number {
  if (topics.length === 0) return 0;
  let weighted = 0;
  let total = 0;
  for (const topic of topics) {
    const weight = Math.max(1, topic.estimatedMinutes);
    const byStatus = STATUS_COVERAGE[topic.status];
    // la padronanza misurata non può far scendere sotto il valore di stato/2
    const value = clamp01(byStatus * 0.6 + clamp01(topic.mastery) * 0.4);
    weighted += value * weight;
    total += weight;
  }
  return total === 0 ? 0 : clamp01(weighted / total);
}

/**
 * Media pesata delle simulazioni con più peso ai tentativi recenti
 * (l'ultimo tentativo pesa il doppio del primo).
 */
export function computeMockScore(mockAttempts: ReadinessInput['mockAttempts']): number {
  if (mockAttempts.length === 0) return 0;
  const sorted = [...mockAttempts].sort((a, b) => a.date.localeCompare(b.date));
  let weighted = 0;
  let totalWeight = 0;
  sorted.forEach((attempt, index) => {
    const weight = 1 + index / Math.max(1, sorted.length - 1);
    weighted += clamp01(attempt.scoreRatio) * weight;
    totalWeight += weight;
  });
  return totalWeight === 0 ? 0 : clamp01(weighted / totalWeight);
}

/**
 * Tasso di successo "smorzato": con pochi tentativi il valore non può essere
 * alto, per evitare che 2 risposte corrette su 2 valgano come padronanza piena.
 * Si usa uno smoothing bayesiano con prior 0.5 e forza `k`.
 */
export function dampedRatio(correct: number, attempts: number, k = 8): number {
  if (attempts <= 0) return 0;
  const value = (correct + 0.5 * k) / (attempts + k);
  // scala verso il basso quando i tentativi sono pochissimi
  const evidence = Math.min(1, attempts / k);
  return clamp01(value * evidence + 0 * (1 - evidence));
}

function fmtPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const weights = normalizeWeights(input.weights ?? DEFAULT_READINESS_WEIGHTS);

  const coverage = computeCoverage(input.topics);
  const activeRecall = dampedRatio(input.recall.correct, input.recall.attempts);
  const exercises = dampedRatio(input.exercises.correct, input.exercises.attempts);
  const mock = computeMockScore(input.mockAttempts);
  const reviewRegularity =
    input.reviews.due <= 0 ? 0 : clamp01(input.reviews.doneOnTime / input.reviews.due);

  // Applicabilità: alcune componenti non hanno senso per certi esami.
  const exercisesApplicable = input.hasExercises && input.examKind !== 'idoneita';
  const mockApplicable = true;
  const reviewApplicable = input.reviews.due > 0;

  const raw: ScoreComponent[] = [
    {
      key: 'coverage',
      label: 'Programma completato',
      value: coverage,
      weight: weights.coverage,
      contribution: 0,
      applicable: input.topics.length > 0,
      explanation:
        input.topics.length > 0
          ? `Copertura pesata sul tempo stimato dei ${input.topics.length} argomenti: ${fmtPercent(coverage)}.`
          : 'Nessun argomento inserito nel programma: la copertura non è calcolabile.',
    },
    {
      key: 'activeRecall',
      label: 'Recupero attivo',
      value: activeRecall,
      weight: weights.activeRecall,
      contribution: 0,
      applicable: true,
      explanation:
        input.recall.attempts > 0
          ? `${input.recall.correct} risposte corrette su ${input.recall.attempts} tentativi (valore smorzato finché i tentativi sono pochi).`
          : 'Nessuna domanda o flashcard ancora affrontata.',
    },
    {
      key: 'exercises',
      label: 'Esercizi',
      value: exercises,
      weight: weights.exercises,
      contribution: 0,
      applicable: exercisesApplicable,
      explanation: exercisesApplicable
        ? input.exercises.attempts > 0
          ? `${input.exercises.correct} esercizi corretti su ${input.exercises.attempts} svolti.`
          : 'Nessun esercizio ancora svolto.'
        : 'Componente non applicabile a questo esame: il peso è stato redistribuito.',
    },
    {
      key: 'mock',
      label: 'Simulazioni',
      value: mock,
      weight: weights.mock,
      contribution: 0,
      applicable: mockApplicable,
      explanation:
        input.mockAttempts.length > 0
          ? `Media pesata di ${input.mockAttempts.length} simulazioni, con più peso alle più recenti: ${fmtPercent(mock)}.`
          : 'Nessuna simulazione ancora svolta.',
    },
    {
      key: 'reviewRegularity',
      label: 'Regolarità dei ripassi',
      value: reviewRegularity,
      weight: weights.reviewRegularity,
      contribution: 0,
      applicable: reviewApplicable,
      explanation: reviewApplicable
        ? `${input.reviews.doneOnTime} ripassi svolti in tempo su ${input.reviews.due} previsti.`
        : 'Nessun ripasso ancora programmato: il peso è stato redistribuito.',
    },
  ];

  // Redistribuzione dei pesi non applicabili
  const applicable = raw.filter((c) => c.applicable);
  const applicableWeight = applicable.reduce((sum, c) => sum + c.weight, 0);
  const components: ScoreComponent[] = raw.map((c) => {
    const effectiveWeight = c.applicable && applicableWeight > 0 ? c.weight / applicableWeight : 0;
    return { ...c, weight: effectiveWeight, contribution: effectiveWeight * c.value };
  });

  const overall = clamp01(components.reduce((sum, c) => sum + c.contribution, 0));

  // Affidabilità della stima: quanti dati reali abbiamo raccolto.
  const dataPoints =
    input.recall.attempts +
    input.exercises.attempts +
    input.mockAttempts.length * 5 +
    input.reviews.due +
    input.topics.filter((t) => t.status !== 'non_iniziato').length;
  const confidence = clamp01(dataPoints / 40);

  const dimensions = {
    coverage,
    comprehension: clamp01(coverage * 0.5 + activeRecall * 0.5),
    memory: clamp01(activeRecall * 0.6 + reviewRegularity * 0.4),
    application: exercisesApplicable ? exercises : mock,
    mock,
  };

  let summary: string;
  if (confidence < 0.25) {
    summary =
      'Dati insufficienti per una stima affidabile: servono più sessioni, domande o esercizi registrati.';
  } else if (overall >= 0.75) {
    summary = 'Preparazione solida: mantieni i ripassi e le simulazioni.';
  } else if (overall >= 0.5) {
    summary = 'Preparazione in costruzione: il recupero attivo e gli esercizi fanno la differenza.';
  } else {
    summary = 'Preparazione iniziale: concentra il tempo sugli argomenti ancora scoperti.';
  }

  return { overall, components, confidence, dimensions, summary };
}

/** Minuti di studio ancora stimati come necessari per un esame. */
export function estimateRemainingMinutes(
  topics: ReadinessInput['topics'],
  readiness: number,
): number {
  const topicMinutes = topics.reduce((sum, topic) => {
    const done = STATUS_COVERAGE[topic.status];
    return sum + Math.max(0, topic.estimatedMinutes * (1 - done));
  }, 0);
  // A copertura completa serve comunque tempo per consolidare (ripassi, esercizi,
  // simulazioni): almeno il 25% del tempo teorico totale, scalato sulla preparazione.
  const totalMinutes = topics.reduce((sum, t) => sum + t.estimatedMinutes, 0);
  const consolidation = totalMinutes * 0.25 * (1 - clamp01(readiness));
  return Math.round(topicMinutes + consolidation);
}
