import { describe, expect, it } from 'vitest';
import {
  applyMasteryDelta,
  baseInterval,
  capReviewToExamDate,
  computeNextReview,
  DEFAULT_EASE,
  scheduleFirstReview,
} from './spaced-repetition';

describe('baseInterval', () => {
  it('segue la sequenza 1, 3, 7, 14, 30', () => {
    expect(baseInterval(0)).toBe(1);
    expect(baseInterval(1)).toBe(3);
    expect(baseInterval(2)).toBe(7);
    expect(baseInterval(3)).toBe(14);
    expect(baseInterval(4)).toBe(30);
    expect(baseInterval(9)).toBe(30);
  });
});

describe('scheduleFirstReview', () => {
  it('propone un ripasso ravvicinato se il richiamo è stato debole', () => {
    const outcome = scheduleFirstReview('2026-08-05', 2);
    expect(outcome.dueDate).toBe('2026-08-06');
    expect(outcome.explanation).toContain('Primo ripasso');
  });

  it('rispetta la data indicata dall’utente', () => {
    const outcome = scheduleFirstReview('2026-08-05', 5, 7);
    expect(outcome.dueDate).toBe('2026-08-12');
    expect(outcome.explanation).toContain('Hai indicato tu');
  });
});

describe('computeNextReview', () => {
  const state = { repetition: 2, intervalDays: 7, ease: DEFAULT_EASE };

  it('riparte da un giorno se non ricordava', () => {
    const outcome = computeNextReview(state, 0, '2026-08-05');
    expect(outcome.intervalDays).toBe(1);
    expect(outcome.repetition).toBe(0);
    expect(outcome.ease).toBeLessThan(DEFAULT_EASE);
    expect(outcome.dueDate).toBe('2026-08-06');
    expect(outcome.masteryDelta).toBeLessThan(0);
  });

  it('dimezza l’intervallo con richiamo molto faticoso', () => {
    const outcome = computeNextReview(state, 1, '2026-08-05');
    expect(outcome.intervalDays).toBe(4);
  });

  it('mantiene circa l’intervallo con ricordo parziale', () => {
    const outcome = computeNextReview(state, 2, '2026-08-05');
    expect(outcome.intervalDays).toBeLessThanOrEqual(7);
    expect(outcome.intervalDays).toBeGreaterThanOrEqual(5);
  });

  it('prosegue con la sequenza se ricordava bene', () => {
    const outcome = computeNextReview(state, 3, '2026-08-05');
    expect(outcome.intervalDays).toBeGreaterThanOrEqual(14);
    expect(outcome.repetition).toBe(3);
  });

  it('posticipa se ricordava perfettamente', () => {
    const buono = computeNextReview(state, 3, '2026-08-05');
    const perfetto = computeNextReview(state, 4, '2026-08-05');
    expect(perfetto.intervalDays).toBeGreaterThan(buono.intervalDays);
    expect(perfetto.ease).toBeGreaterThan(DEFAULT_EASE);
  });

  it('spiega sempre perché è stata scelta la data', () => {
    for (const grade of [0, 1, 2, 3, 4] as const) {
      const outcome = computeNextReview(state, grade, '2026-08-05');
      expect(outcome.explanation).toMatch(/Prossimo ripasso tra \d+ giorn/);
    }
  });

  it('non supera mai i 365 giorni', () => {
    let current = { repetition: 20, intervalDays: 300, ease: 3.5 };
    for (let i = 0; i < 5; i += 1) {
      const outcome = computeNextReview(current, 4, '2026-08-05');
      current = {
        repetition: outcome.repetition,
        intervalDays: outcome.intervalDays,
        ease: outcome.ease,
      };
      expect(current.intervalDays).toBeLessThanOrEqual(365);
    }
  });
});

describe('capReviewToExamDate', () => {
  it('anticipa il ripasso previsto dopo l’appello', () => {
    const outcome = computeNextReview(
      { repetition: 4, intervalDays: 30, ease: DEFAULT_EASE },
      4,
      '2026-08-05',
    );
    const capped = capReviewToExamDate(outcome, '2026-08-27');
    expect(capped.dueDate).toBe('2026-08-27');
    expect(capped.explanation).toContain('anticipata');
  });

  it('non modifica nulla senza appello', () => {
    const outcome = computeNextReview({ repetition: 1, intervalDays: 3, ease: 2.5 }, 3, '2026-08-05');
    expect(capReviewToExamDate(outcome, null)).toEqual(outcome);
  });
});

describe('applyMasteryDelta', () => {
  it('resta tra 0 e 1', () => {
    expect(applyMasteryDelta(0.95, 0.2)).toBe(1);
    expect(applyMasteryDelta(0.1, -0.5)).toBe(0);
  });
});
