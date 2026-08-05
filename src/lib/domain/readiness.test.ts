import { describe, expect, it } from 'vitest';
import {
  computeCoverage,
  computeMockScore,
  computeReadiness,
  dampedRatio,
  estimateRemainingMinutes,
  normalizeWeights,
} from './readiness';
import type { ReadinessInput } from './types';

const baseInput: ReadinessInput = {
  examKind: 'scritto',
  hasExercises: true,
  topics: [],
  recall: { attempts: 0, correct: 0 },
  exercises: { attempts: 0, correct: 0 },
  mockAttempts: [],
  reviews: { due: 0, doneOnTime: 0 },
};

describe('computeCoverage', () => {
  it('vale 0 senza argomenti', () => {
    expect(computeCoverage([])).toBe(0);
  });

  it('pesa gli argomenti sul tempo stimato', () => {
    const coverage = computeCoverage([
      { id: 'a', status: 'consolidato', mastery: 1, estimatedMinutes: 300, studiedMinutes: 300 },
      { id: 'b', status: 'non_iniziato', mastery: 0, estimatedMinutes: 60, studiedMinutes: 0 },
    ]);
    // l'argomento lungo pesa di più: copertura ben oltre il 50%
    expect(coverage).toBeGreaterThan(0.75);
    expect(coverage).toBeLessThanOrEqual(1);
  });

  it('non considera completato un argomento solo aperto', () => {
    const coverage = computeCoverage([
      { id: 'a', status: 'in_corso', mastery: 0, estimatedMinutes: 60, studiedMinutes: 10 },
    ]);
    expect(coverage).toBeLessThan(0.35);
  });
});

describe('dampedRatio', () => {
  it('non premia 2 risposte corrette su 2', () => {
    expect(dampedRatio(2, 2)).toBeLessThan(0.3);
  });

  it('cresce con molti tentativi corretti', () => {
    expect(dampedRatio(30, 30)).toBeGreaterThan(0.85);
  });

  it('vale 0 senza tentativi', () => {
    expect(dampedRatio(0, 0)).toBe(0);
  });
});

describe('computeMockScore', () => {
  it('dà più peso alle simulazioni recenti', () => {
    const migliorando = computeMockScore([
      { scoreRatio: 0.4, date: '2026-08-01' },
      { scoreRatio: 0.9, date: '2026-08-20' },
    ]);
    const peggiorando = computeMockScore([
      { scoreRatio: 0.9, date: '2026-08-01' },
      { scoreRatio: 0.4, date: '2026-08-20' },
    ]);
    expect(migliorando).toBeGreaterThan(peggiorando);
  });
});

describe('normalizeWeights', () => {
  it('normalizza a somma 1', () => {
    const w = normalizeWeights({
      coverage: 2,
      activeRecall: 2,
      exercises: 2,
      mock: 2,
      reviewRegularity: 2,
    });
    const total = w.coverage + w.activeRecall + w.exercises + w.mock + w.reviewRegularity;
    expect(total).toBeCloseTo(1, 5);
    expect(w.coverage).toBeCloseTo(0.2, 5);
  });
});

describe('computeReadiness', () => {
  it('segnala dati insufficienti quando non c’è nulla di registrato', () => {
    const result = computeReadiness(baseInput);
    expect(result.overall).toBe(0);
    expect(result.confidence).toBeLessThan(0.25);
    expect(result.summary).toContain('Dati insufficienti');
  });

  it('non arriva al 100% con il solo programma letto', () => {
    const result = computeReadiness({
      ...baseInput,
      topics: [
        { id: 'a', status: 'consolidato', mastery: 1, estimatedMinutes: 120, studiedMinutes: 120 },
        { id: 'b', status: 'consolidato', mastery: 1, estimatedMinutes: 120, studiedMinutes: 120 },
      ],
    });
    expect(result.dimensions.coverage).toBe(1);
    expect(result.overall).toBeLessThan(0.35);
  });

  it('redistribuisce il peso degli esercizi per un esame senza esercizi', () => {
    const result = computeReadiness({
      ...baseInput,
      examKind: 'orale',
      hasExercises: false,
      topics: [
        { id: 'a', status: 'consolidato', mastery: 1, estimatedMinutes: 60, studiedMinutes: 60 },
      ],
    });
    const exercises = result.components.find((c) => c.key === 'exercises');
    expect(exercises?.applicable).toBe(false);
    expect(exercises?.weight).toBe(0);
    const applicableWeight = result.components
      .filter((c) => c.applicable)
      .reduce((sum, c) => sum + c.weight, 0);
    expect(applicableWeight).toBeCloseTo(1, 5);
  });

  it('cresce con recupero attivo, esercizi e simulazioni', () => {
    const result = computeReadiness({
      ...baseInput,
      topics: [
        { id: 'a', status: 'consolidato', mastery: 0.9, estimatedMinutes: 120, studiedMinutes: 150 },
        { id: 'b', status: 'consolidato', mastery: 0.9, estimatedMinutes: 120, studiedMinutes: 150 },
      ],
      recall: { attempts: 40, correct: 34 },
      exercises: { attempts: 30, correct: 25 },
      mockAttempts: [
        { scoreRatio: 0.7, date: '2026-08-10' },
        { scoreRatio: 0.85, date: '2026-08-20' },
      ],
      reviews: { due: 10, doneOnTime: 9 },
    });
    expect(result.overall).toBeGreaterThan(0.7);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.components.every((c) => c.explanation.length > 0)).toBe(true);
  });
});

describe('estimateRemainingMinutes', () => {
  it('resta positivo anche a programma completato, per il consolidamento', () => {
    const minutes = estimateRemainingMinutes(
      [{ id: 'a', status: 'consolidato', mastery: 1, estimatedMinutes: 600, studiedMinutes: 600 }],
      0.4,
    );
    expect(minutes).toBeGreaterThan(0);
  });

  it('è massimo quando nulla è stato studiato', () => {
    const minutes = estimateRemainingMinutes(
      [{ id: 'a', status: 'non_iniziato', mastery: 0, estimatedMinutes: 600, studiedMinutes: 0 }],
      0,
    );
    expect(minutes).toBeGreaterThanOrEqual(600);
  });
});
