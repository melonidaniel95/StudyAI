/**
 * Calcolo del tempo realmente pianificabile.
 *
 * Regola centrale del sistema: non si pianifica mai il 100% del tempo
 * disponibile. Una quota (default 15%) resta libera come margine per
 * imprevisti e recuperi.
 */
import { dateRange, isoWeekday, weekStartIso } from './dates';
import type { AvailabilityDay, IsoDate, UnavailableDate } from './types';

export interface DayCapacity {
  date: IsoDate;
  weekday: number;
  /** Minuti dichiarati dall'utente per quel giorno. */
  rawMinutes: number;
  /** Minuti effettivamente pianificabili, al netto del margine. */
  plannableMinutes: number;
  isRestDay: boolean;
  isUnavailable: boolean;
  reason?: string | null;
}

export function buildAvailabilityMap(availability: AvailabilityDay[]): Map<number, AvailabilityDay> {
  const map = new Map<number, AvailabilityDay>();
  for (const day of availability) map.set(day.weekday, day);
  return map;
}

export function dayCapacity(
  date: IsoDate,
  availability: Map<number, AvailabilityDay>,
  unavailable: Map<IsoDate, UnavailableDate>,
  bufferRatio: number,
): DayCapacity {
  const weekday = isoWeekday(date);
  const base = availability.get(weekday);
  const override = unavailable.get(date);

  let rawMinutes = base?.availableMinutes ?? 0;
  let isUnavailable = false;
  let reason: string | null | undefined;

  if (base?.isRestDay) {
    rawMinutes = 0;
  }

  if (override) {
    reason = override.reason;
    if (override.availableMinutes === null || override.availableMinutes === undefined) {
      rawMinutes = 0;
      isUnavailable = true;
    } else {
      rawMinutes = override.availableMinutes;
      isUnavailable = override.availableMinutes === 0;
    }
  }

  const ratio = Math.min(0.5, Math.max(0, bufferRatio));
  const plannableMinutes = Math.floor(rawMinutes * (1 - ratio));

  return {
    date,
    weekday,
    rawMinutes,
    plannableMinutes,
    isRestDay: base?.isRestDay ?? false,
    isUnavailable,
    reason,
  };
}

export function buildCapacityCalendar(
  start: IsoDate,
  days: number,
  availability: AvailabilityDay[],
  unavailable: UnavailableDate[],
  bufferRatio: number,
): DayCapacity[] {
  const availabilityMap = buildAvailabilityMap(availability);
  const unavailableMap = new Map<IsoDate, UnavailableDate>();
  for (const item of unavailable) unavailableMap.set(item.date, item);
  return dateRange(start, days).map((date) =>
    dayCapacity(date, availabilityMap, unavailableMap, bufferRatio),
  );
}

/** Minuti pianificabili totali tra due date (estremo finale escluso). */
export function plannableMinutesBetween(
  from: IsoDate,
  to: IsoDate,
  availability: AvailabilityDay[],
  unavailable: UnavailableDate[],
  bufferRatio: number,
): number {
  if (to <= from) return 0;
  const days = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000));
  return buildCapacityCalendar(from, days, availability, unavailable, bufferRatio).reduce(
    (sum, day) => sum + day.plannableMinutes,
    0,
  );
}

/** Minuti dichiarati in una settimana tipo (senza margine). */
export function weeklyRawMinutes(availability: AvailabilityDay[]): number {
  return availability.reduce((sum, day) => sum + (day.isRestDay ? 0 : day.availableMinutes), 0);
}

export function groupByWeek(days: DayCapacity[]): Map<IsoDate, DayCapacity[]> {
  const map = new Map<IsoDate, DayCapacity[]>();
  for (const day of days) {
    const key = weekStartIso(day.date);
    const list = map.get(key);
    if (list) list.push(day);
    else map.set(key, [day]);
  }
  return map;
}
