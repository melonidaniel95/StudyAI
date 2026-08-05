import { describe, expect, it } from 'vitest';
import { computePriority, urgencyFromDays, type PriorityInput } from './priority';

const base: PriorityInput = {
  today: '2026-08-05',
  examDate: '2026-09-15',
  manualPriority: 3,
  difficulty: 3,
  readiness: 0.4,
  unlocksExams: 0,
  backlogMinutes: 0,
  openErrors: 0,
  loadRatio: 0.5,
};

describe('urgencyFromDays', () => {
  it('è massima il giorno dell’esame', () => {
    expect(urgencyFromDays(0)).toBe(1);
  });

  it('decresce all’aumentare dei giorni', () => {
    const values = [1, 7, 30, 60, 120].map(urgencyFromDays);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
  });

  it('resta bassa ma non nulla senza appello', () => {
    expect(urgencyFromDays(null)).toBeGreaterThan(0);
    expect(urgencyFromDays(null)).toBeLessThan(0.3);
  });
});

describe('computePriority', () => {
  it('dà punteggio maggiore all’esame più vicino', () => {
    const vicino = computePriority({ ...base, examDate: '2026-08-27' });
    const lontano = computePriority({ ...base, examDate: '2027-01-20' });
    expect(vicino.score).toBeGreaterThan(lontano.score);
  });

  it('aumenta se la preparazione è bassa', () => {
    const impreparato = computePriority({ ...base, readiness: 0.1 });
    const preparato = computePriority({ ...base, readiness: 0.9 });
    expect(impreparato.score).toBeGreaterThan(preparato.score);
  });

  it('tiene conto di arretrati ed errori ricorrenti', () => {
    const conArretrati = computePriority({ ...base, backlogMinutes: 240, openErrors: 8 });
    expect(conArretrati.score).toBeGreaterThan(computePriority(base).score);
  });

  it('premia gli esami che sbloccano altri esami', () => {
    const prerequisito = computePriority({ ...base, unlocksExams: 3 });
    expect(prerequisito.score).toBeGreaterThan(computePriority(base).score);
  });

  it('restituisce sempre una spiegazione leggibile', () => {
    const result = computePriority(base);
    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.explanation.length).toBeLessThanOrEqual(3);
    for (const line of result.explanation) expect(line.length).toBeGreaterThan(3);
  });

  it('resta nell’intervallo 0..100', () => {
    const massimo = computePriority({
      ...base,
      examDate: '2026-08-05',
      readiness: 0,
      manualPriority: 5,
      difficulty: 5,
      unlocksExams: 5,
      backlogMinutes: 1000,
      openErrors: 50,
      loadRatio: 3,
    });
    expect(massimo.score).toBeLessThanOrEqual(100);
    expect(massimo.score).toBeGreaterThan(70);
  });
});
