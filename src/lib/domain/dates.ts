/**
 * Utilità sulle date in formato ISO 'yyyy-MM-dd', indipendenti dal fuso orario.
 * Il fuso di riferimento dell'utente è Europe/Rome: per evitare gli errori
 * classici di `new Date()` lavoriamo sempre con date "civili" (senza ora).
 */
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { it } from 'date-fns/locale';
import type { IsoDate } from './types';

export const APP_TIME_ZONE = 'Europe/Rome';

/** Data odierna nel fuso dell'utente, come 'yyyy-MM-dd'. */
export function todayIso(timeZone: string = APP_TIME_ZONE, now: Date = new Date()): IsoDate {
  // en-CA produce direttamente il formato yyyy-MM-dd
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function toIso(date: Date): IsoDate {
  return format(date, 'yyyy-MM-dd');
}

export function fromIso(date: IsoDate): Date {
  return parseISO(`${date}T00:00:00`);
}

export function addDaysIso(date: IsoDate, days: number): IsoDate {
  return toIso(addDays(fromIso(date), days));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return differenceInCalendarDays(fromIso(to), fromIso(from));
}

/** 1 = lunedì ... 7 = domenica */
export function isoWeekday(date: IsoDate): number {
  const day = fromIso(date).getDay(); // 0 = domenica
  return day === 0 ? 7 : day;
}

export function isWeekend(date: IsoDate): boolean {
  return isoWeekday(date) >= 6;
}

export function weekStartIso(date: IsoDate): IsoDate {
  return toIso(startOfWeek(fromIso(date), { weekStartsOn: 1 }));
}

/** Elenco di date ISO consecutive, estremi inclusi. */
export function dateRange(start: IsoDate, days: number): IsoDate[] {
  const out: IsoDate[] = [];
  for (let i = 0; i < days; i += 1) out.push(addDaysIso(start, i));
  return out;
}

/** Formato italiano leggibile, es. "mer 5 agosto 2026". */
export function formatItalianDate(date: IsoDate | Date, pattern = 'EEE d MMMM yyyy'): string {
  const value = typeof date === 'string' ? fromIso(date) : date;
  return format(value, pattern, { locale: it });
}

/** Formato compatto italiano, es. "05/08/2026". */
export function formatShortDate(date: IsoDate | Date): string {
  const value = typeof date === 'string' ? fromIso(date) : date;
  return format(value, 'dd/MM/yyyy', { locale: it });
}

/** "2 ore e 30 minuti" → forma breve "2h 30m". */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Testo relativo non allarmante: "tra 12 giorni", "oggi", "3 giorni fa". */
export function relativeDayLabel(from: IsoDate, to: IsoDate): string {
  const diff = daysBetween(from, to);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  if (diff === -1) return 'ieri';
  if (diff > 1) return `tra ${diff} giorni`;
  return `${Math.abs(diff)} giorni fa`;
}
