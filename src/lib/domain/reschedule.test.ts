import { describe, expect, it } from 'vitest';
import { buildCapacityCalendar } from './availability';
import { findBacklog, rescheduleTasks, type ReschedulableTask } from './reschedule';
import type { AvailabilityDay } from './types';

const availability: AvailabilityDay[] = Array.from({ length: 7 }, (_, i) => ({
  weekday: i + 1,
  availableMinutes: i + 1 <= 5 ? 120 : 240,
  isRestDay: false,
}));

const capacity = buildCapacityCalendar('2026-08-05', 14, availability, [], 0.15);

function task(id: string, minutes: number, date = '2026-08-04'): ReschedulableTask {
  return {
    id,
    examId: 'elettronica',
    plannedMinutes: minutes,
    scheduledDate: date,
    activityType: 'teoria',
    title: `Attività ${id}`,
  };
}

describe('rescheduleTasks', () => {
  it('non ammassa tutto il lavoro saltato sul giorno successivo', () => {
    const tasks = [task('a', 60), task('b', 60), task('c', 60), task('d', 60)];
    const result = rescheduleTasks(tasks, {
      today: '2026-08-05',
      capacity,
      plannedByDate: {},
      examDeadlines: { elettronica: '2026-08-27' },
      maxRecoveryMinutesPerDay: 60,
    });
    const byDate = new Map<string, number>();
    for (const a of result.assignments) {
      byDate.set(a.toDate, (byDate.get(a.toDate) ?? 0) + a.minutes);
    }
    expect(byDate.size).toBeGreaterThan(1);
    for (const minutes of byDate.values()) expect(minutes).toBeLessThanOrEqual(60);
  });

  it('rispetta la capacità già occupata', () => {
    const result = rescheduleTasks([task('a', 60)], {
      today: '2026-08-05',
      capacity,
      plannedByDate: { '2026-08-05': 102, '2026-08-06': 102 },
      examDeadlines: { elettronica: '2026-08-27' },
    });
    expect(result.assignments[0]?.toDate).not.toBe('2026-08-05');
    expect(result.assignments[0]?.toDate).not.toBe('2026-08-06');
  });

  it('non sposta oltre la data dell’appello', () => {
    const result = rescheduleTasks([task('a', 90)], {
      today: '2026-08-05',
      capacity,
      plannedByDate: {},
      examDeadlines: { elettronica: '2026-08-06' },
      maxRecoveryMinutesPerDay: 30,
    });
    for (const a of result.assignments) expect(a.toDate <= '2026-08-06').toBe(true);
    expect(result.unplaced.length).toBeGreaterThan(0);
  });

  it('spiega sempre lo spostamento', () => {
    const result = rescheduleTasks([task('a', 45)], {
      today: '2026-08-05',
      capacity,
      plannedByDate: {},
      examDeadlines: { elettronica: null },
    });
    expect(result.assignments[0]?.reason.length).toBeGreaterThan(10);
  });

  it('segnala le attività che non trovano spazio', () => {
    const many = Array.from({ length: 40 }, (_, i) => task(`t${i}`, 60));
    const result = rescheduleTasks(many, {
      today: '2026-08-05',
      capacity,
      plannedByDate: {},
      examDeadlines: { elettronica: '2026-08-10' },
    });
    expect(result.unplaced.length).toBeGreaterThan(0);
    expect(result.unplaced[0]?.reason).toContain('spazio');
  });
});

describe('findBacklog', () => {
  it('trova solo le attività passate non completate', () => {
    const tasks = [
      { scheduledDate: '2026-08-01', status: 'pianificata' },
      { scheduledDate: '2026-08-02', status: 'completata' },
      { scheduledDate: '2026-08-10', status: 'pianificata' },
    ];
    const backlog = findBacklog(tasks, '2026-08-05');
    expect(backlog).toHaveLength(1);
    expect(backlog[0]?.scheduledDate).toBe('2026-08-01');
  });
});
