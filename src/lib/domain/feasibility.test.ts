import { describe, expect, it } from 'vitest';
import { evaluateFeasibility } from './feasibility';
import type { FeasibilityInput } from './types';

const base: FeasibilityInput = {
  today: '2026-08-05',
  examDate: '2026-08-27',
  backupExamDate: '2026-09-09',
  requiredMinutes: 1200,
  availableMinutesBeforeExam: 3000,
  readiness: 0.6,
  coverage: 0.7,
  recentPaceMinutesPerDay: 120,
  missingReviews: 0,
  plannedMocks: 2,
  doneMocks: 1,
  dataPoints: 40,
};

describe('evaluateFeasibility', () => {
  it('è grigia senza appello selezionato', () => {
    const result = evaluateFeasibility({ ...base, examDate: null });
    expect(result.risk).toBe('grigio');
    expect(result.daysRemaining).toBeNull();
  });

  it('è grigia con troppi pochi dati', () => {
    const result = evaluateFeasibility({ ...base, dataPoints: 1 });
    expect(result.risk).toBe('grigio');
    expect(result.message).toContain('sessioni registrate');
  });

  it('è verde con largo margine', () => {
    const result = evaluateFeasibility(base);
    expect(result.risk).toBe('verde');
    expect(result.label).toBe('Obiettivo raggiungibile');
    expect(result.loadRatio).toBeCloseTo(0.4, 2);
  });

  it('è rossa quando il lavoro supera il tempo disponibile', () => {
    const result = evaluateFeasibility({
      ...base,
      requiredMinutes: 6000,
      availableMinutesBeforeExam: 1500,
      readiness: 0.15,
      coverage: 0.2,
      recentPaceMinutesPerDay: 40,
      doneMocks: 0,
      plannedMocks: 0,
    });
    expect(result.risk).toBe('rosso');
    expect(result.suggestBackup).toBe(true);
    expect(result.message).not.toMatch(/colpa|dovresti aver|sei in ritardo/i);
  });

  it('non propone l’appello di riserva se non esiste', () => {
    const result = evaluateFeasibility({
      ...base,
      backupExamDate: null,
      requiredMinutes: 9000,
      availableMinutesBeforeExam: 1000,
      readiness: 0.1,
      coverage: 0.1,
      recentPaceMinutesPerDay: 20,
    });
    expect(result.suggestBackup).toBe(false);
  });

  it('peggiora se manca ogni simulazione a ridosso dell’esame', () => {
    const conSimulazioni = evaluateFeasibility({ ...base, today: '2026-08-20' });
    const senzaSimulazioni = evaluateFeasibility({
      ...base,
      today: '2026-08-20',
      doneMocks: 0,
      plannedMocks: 0,
    });
    const order = ['verde', 'giallo', 'arancione', 'rosso'];
    expect(order.indexOf(senzaSimulazioni.risk)).toBeGreaterThanOrEqual(
      order.indexOf(conSimulazioni.risk),
    );
  });

  it('fornisce sempre le motivazioni', () => {
    const result = evaluateFeasibility(base);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});
