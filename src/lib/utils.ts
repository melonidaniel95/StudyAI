import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Percentuale intera a partire da un valore 0..1. */
export function percent(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

/** Ordina in modo stabile per chiave numerica decrescente. */
export function byDesc<T>(selector: (item: T) => number) {
  return (a: T, b: T) => selector(b) - selector(a);
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Raggruppa un array in una Map. */
export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
