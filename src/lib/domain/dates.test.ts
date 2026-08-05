import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  dateRange,
  daysBetween,
  formatMinutes,
  formatShortDate,
  isWeekend,
  isoWeekday,
  relativeDayLabel,
  todayIso,
  weekStartIso,
} from './dates';

describe('utilità sulle date', () => {
  it('somma i giorni restando in formato ISO', () => {
    expect(addDaysIso('2026-08-05', 22)).toBe('2026-08-27');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('calcola i giorni tra due date', () => {
    expect(daysBetween('2026-08-05', '2026-08-27')).toBe(22);
    expect(daysBetween('2026-08-27', '2026-08-05')).toBe(-22);
  });

  it('usa la convenzione ISO per i giorni della settimana', () => {
    expect(isoWeekday('2026-08-03')).toBe(1); // lunedì
    expect(isoWeekday('2026-08-09')).toBe(7); // domenica
    expect(isWeekend('2026-08-08')).toBe(true);
    expect(isWeekend('2026-08-05')).toBe(false);
  });

  it('trova l’inizio della settimana (lunedì)', () => {
    expect(weekStartIso('2026-08-05')).toBe('2026-08-03');
    expect(weekStartIso('2026-08-03')).toBe('2026-08-03');
  });

  it('genera intervalli di date', () => {
    expect(dateRange('2026-08-05', 3)).toEqual(['2026-08-05', '2026-08-06', '2026-08-07']);
  });

  it('formatta le date in italiano', () => {
    expect(formatShortDate('2026-08-27')).toBe('27/08/2026');
  });

  it('formatta le durate in modo compatto', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(150)).toBe('2h 30m');
  });

  it('usa etichette relative comprensibili', () => {
    expect(relativeDayLabel('2026-08-05', '2026-08-05')).toBe('oggi');
    expect(relativeDayLabel('2026-08-05', '2026-08-06')).toBe('domani');
    expect(relativeDayLabel('2026-08-05', '2026-08-12')).toBe('tra 7 giorni');
    expect(relativeDayLabel('2026-08-05', '2026-08-01')).toBe('4 giorni fa');
  });

  it('calcola la data odierna nel fuso di Roma', () => {
    const value = todayIso('Europe/Rome', new Date('2026-08-05T23:30:00Z'));
    expect(value).toBe('2026-08-06'); // a Roma è già il giorno dopo
  });
});
