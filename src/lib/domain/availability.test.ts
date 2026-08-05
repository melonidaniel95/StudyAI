import { describe, expect, it } from 'vitest';
import {
  buildCapacityCalendar,
  plannableMinutesBetween,
  weeklyRawMinutes,
} from './availability';
import type { AvailabilityDay } from './types';

const availability: AvailabilityDay[] = [
  { weekday: 1, availableMinutes: 120, isRestDay: false },
  { weekday: 2, availableMinutes: 120, isRestDay: false },
  { weekday: 3, availableMinutes: 120, isRestDay: false },
  { weekday: 4, availableMinutes: 120, isRestDay: false },
  { weekday: 5, availableMinutes: 120, isRestDay: false },
  { weekday: 6, availableMinutes: 240, isRestDay: false },
  { weekday: 7, availableMinutes: 240, isRestDay: false },
];

describe('weeklyRawMinutes', () => {
  it('somma il tempo dichiarato', () => {
    expect(weeklyRawMinutes(availability)).toBe(120 * 5 + 240 * 2);
  });

  it('esclude i giorni di riposo', () => {
    const conRiposo = availability.map((day) =>
      day.weekday === 7 ? { ...day, isRestDay: true } : day,
    );
    expect(weeklyRawMinutes(conRiposo)).toBe(120 * 5 + 240);
  });
});

describe('buildCapacityCalendar', () => {
  it('lascia sempre il margine indicato', () => {
    const calendar = buildCapacityCalendar('2026-08-05', 7, availability, [], 0.15);
    for (const day of calendar) {
      expect(day.plannableMinutes).toBe(Math.floor(day.rawMinutes * 0.85));
      expect(day.plannableMinutes).toBeLessThan(day.rawMinutes);
    }
  });

  it('azzera i giorni completamente non disponibili', () => {
    const calendar = buildCapacityCalendar(
      '2026-08-05',
      3,
      availability,
      [{ date: '2026-08-06', availableMinutes: null, reason: 'Famiglia' }],
      0.15,
    );
    const day = calendar.find((item) => item.date === '2026-08-06');
    expect(day?.plannableMinutes).toBe(0);
    expect(day?.isUnavailable).toBe(true);
    expect(day?.reason).toBe('Famiglia');
  });

  it('rispetta una disponibilità ridotta per un giorno specifico', () => {
    const calendar = buildCapacityCalendar(
      '2026-08-05',
      3,
      availability,
      [{ date: '2026-08-06', availableMinutes: 60 }],
      0.15,
    );
    const day = calendar.find((item) => item.date === '2026-08-06');
    expect(day?.rawMinutes).toBe(60);
    expect(day?.plannableMinutes).toBe(51);
  });

  it('non pianifica nei giorni di riposo', () => {
    const conRiposo = availability.map((day) =>
      day.weekday === 7 ? { ...day, isRestDay: true } : day,
    );
    const calendar = buildCapacityCalendar('2026-08-05', 7, conRiposo, [], 0.15);
    const domenica = calendar.find((item) => item.weekday === 7);
    expect(domenica?.plannableMinutes).toBe(0);
  });
});

describe('plannableMinutesBetween', () => {
  it('vale 0 se la data finale non è successiva', () => {
    expect(plannableMinutesBetween('2026-08-05', '2026-08-05', availability, [], 0.15)).toBe(0);
  });

  it('somma solo i giorni compresi', () => {
    const total = plannableMinutesBetween('2026-08-05', '2026-08-08', availability, [], 0.15);
    // mercoledì, giovedì, venerdì → 3 giorni da 120 minuti
    expect(total).toBe(Math.floor(120 * 0.85) * 3);
  });
});
