/**
 * Riprogrammazione delle attività non svolte.
 *
 * Regola esplicita del progetto: il lavoro saltato NON viene spostato in blocco
 * al giorno successivo. Viene distribuito sui giorni successivi rispettando la
 * capacità residua e un tetto di recupero giornaliero, in modo che una giornata
 * storta non generi una giornata impossibile.
 */
import type { DayCapacity } from './availability';
import type { ActivityType, IsoDate } from './types';

export interface ReschedulableTask {
  id: string;
  examId: string;
  plannedMinutes: number;
  scheduledDate: IsoDate;
  activityType: ActivityType;
  title: string;
}

export interface RescheduleOptions {
  today: IsoDate;
  /** Capacità giornaliera già al netto del margine. */
  capacity: DayCapacity[];
  /** Minuti già pianificati per data (attività ancora attive). */
  plannedByDate: Record<IsoDate, number>;
  /** Data limite per esame (appello principale): oltre non ha senso spostare. */
  examDeadlines: Record<string, IsoDate | null>;
  /** Tetto di minuti di recupero aggiunti a una singola giornata. */
  maxRecoveryMinutesPerDay?: number;
  /** Se una singola attività è più lunga della capacità residua, la si può spezzare. */
  allowSplit?: boolean;
}

export interface RescheduleAssignment {
  taskId: string;
  fromDate: IsoDate;
  toDate: IsoDate;
  minutes: number;
  reason: string;
}

export interface RescheduleResult {
  assignments: RescheduleAssignment[];
  unplaced: Array<{ taskId: string; reason: string }>;
}

export function rescheduleTasks(
  tasks: ReschedulableTask[],
  options: RescheduleOptions,
): RescheduleResult {
  const maxRecovery = options.maxRecoveryMinutesPerDay ?? 60;
  const allowSplit = options.allowSplit ?? true;

  const future = options.capacity
    .filter((day) => day.date >= options.today && day.plannableMinutes > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const load = new Map<IsoDate, number>();
  const recovery = new Map<IsoDate, number>();
  for (const day of future) load.set(day.date, options.plannedByDate[day.date] ?? 0);

  const assignments: RescheduleAssignment[] = [];
  const unplaced: Array<{ taskId: string; reason: string }> = [];

  // Le attività più vecchie vengono ricollocate per prime.
  const ordered = [...tasks].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  for (const task of ordered) {
    const deadline = options.examDeadlines[task.examId] ?? null;
    let left = task.plannedMinutes;
    let placedAny = false;

    for (const day of future) {
      if (left <= 0) break;
      if (deadline && day.date > deadline) break;

      const used = load.get(day.date) ?? 0;
      const recovered = recovery.get(day.date) ?? 0;
      const freeCapacity = day.plannableMinutes - used;
      const freeRecovery = maxRecovery - recovered;
      const usable = Math.min(freeCapacity, freeRecovery);
      if (usable < 15) continue;

      const minutes = Math.min(left, usable);
      if (!allowSplit && minutes < left) continue;

      load.set(day.date, used + minutes);
      recovery.set(day.date, recovered + minutes);
      assignments.push({
        taskId: task.id,
        fromDate: task.scheduledDate,
        toDate: day.date,
        minutes,
        reason:
          minutes === task.plannedMinutes
            ? `Spostata al primo giorno con spazio sufficiente, senza sovraccaricare la giornata.`
            : `Suddivisa su più giorni per non concentrare il recupero in una sola giornata (max ${maxRecovery} minuti al giorno).`,
      });
      left -= minutes;
      placedAny = true;
    }

    if (left > 0) {
      unplaced.push({
        taskId: task.id,
        reason: placedAny
          ? `Ricollocata solo in parte: prima del ${deadline ?? 'termine dell’orizzonte'} non c’è spazio sufficiente.`
          : `Non c’è spazio disponibile prima del ${deadline ?? 'termine dell’orizzonte'}. Valuta di ridurre l’attività o di spostare l’appello.`,
      });
    }
  }

  return { assignments, unplaced };
}

/**
 * Attività arretrate: pianificate nel passato e mai completate.
 */
export function findBacklog<T extends { scheduledDate: IsoDate; status: string }>(
  tasks: T[],
  today: IsoDate,
): T[] {
  return tasks.filter(
    (t) => t.scheduledDate < today && (t.status === 'pianificata' || t.status === 'in_corso'),
  );
}
