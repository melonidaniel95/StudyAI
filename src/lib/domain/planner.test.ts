import { describe, expect, it } from 'vitest';
import { generatePlan, PLANNER_DEFAULTS, suggestedHorizon } from './planner';
import type { AvailabilityDay, PlannerExamInput, PlannerOptions } from './types';

const availability: AvailabilityDay[] = [
  { weekday: 1, availableMinutes: 120, isRestDay: false },
  { weekday: 2, availableMinutes: 120, isRestDay: false },
  { weekday: 3, availableMinutes: 120, isRestDay: false },
  { weekday: 4, availableMinutes: 120, isRestDay: false },
  { weekday: 5, availableMinutes: 120, isRestDay: false },
  { weekday: 6, availableMinutes: 240, isRestDay: false },
  { weekday: 7, availableMinutes: 240, isRestDay: false },
];

function makeExam(overrides: Partial<PlannerExamInput> & { examId: string }): PlannerExamInput {
  return {
    name: overrides.examId,
    shortName: overrides.examId,
    kind: 'scritto',
    difficulty: 4,
    priority: 4,
    primarySessionDate: null,
    backupSessionDate: null,
    readiness: 0.2,
    remainingMinutes: 1200,
    pendingTopics: Array.from({ length: 10 }, (_, i) => ({
      id: `${overrides.examId}-t${i}`,
      title: `Argomento ${i}`,
      estimatedMinutes: 120,
      difficulty: 3,
      status: 'non_iniziato' as const,
      blockedBy: [],
    })),
    dueReviews: [],
    openErrors: 0,
    backlogMinutes: 0,
    mockDone: 0,
    ...overrides,
  };
}

const options: PlannerOptions = {
  today: '2026-08-05',
  horizonDays: 30,
  availability,
  unavailable: [],
  bufferRatio: PLANNER_DEFAULTS.bufferRatio,
  maxSessionMinutes: 120,
  minSessionMinutes: 25,
  maxParallelExams: 2,
  freezeNewTopicsDays: 6,
  firstMockDaysBefore: 14,
};

describe('generatePlan', () => {
  it('produce attività a partire dagli argomenti mancanti', () => {
    const plan = generatePlan([makeExam({ examId: 'elettronica', primarySessionDate: '2026-08-27' })], options);
    expect(plan.tasks.length).toBeGreaterThan(10);
    expect(plan.tasks.every((t) => t.plannedMinutes >= 15)).toBe(true);
    expect(plan.tasks.every((t) => t.priorityExplanation.length > 0)).toBe(true);
  });

  it('non supera mai il tempo pianificabile giornaliero (margine del 15%)', () => {
    const plan = generatePlan(
      [
        makeExam({ examId: 'elettronica', primarySessionDate: '2026-08-27' }),
        makeExam({ examId: 'metodi', primarySessionDate: '2026-09-15' }),
      ],
      options,
    );
    const byDate = new Map<string, number>();
    for (const task of plan.tasks) {
      byDate.set(task.date, (byDate.get(task.date) ?? 0) + task.plannedMinutes);
    }
    for (const [date, minutes] of byDate) {
      const weekday = new Date(`${date}T00:00:00`).getDay();
      const raw = weekday === 0 || weekday === 6 ? 240 : 120;
      expect(minutes).toBeLessThanOrEqual(Math.floor(raw * 0.85));
    }
  });

  it('non pianifica più di due materie principali nello stesso giorno', () => {
    const plan = generatePlan(
      [
        makeExam({ examId: 'a', primarySessionDate: '2026-08-27' }),
        makeExam({ examId: 'b', primarySessionDate: '2026-09-15' }),
        makeExam({ examId: 'c', primarySessionDate: '2026-09-20' }),
        makeExam({ examId: 'd', primarySessionDate: '2026-09-25' }),
      ],
      options,
    );
    const byDate = new Map<string, Set<string>>();
    for (const task of plan.tasks) {
      const set = byDate.get(task.date) ?? new Set<string>();
      set.add(task.examId);
      byDate.set(task.date, set);
    }
    for (const set of byDate.values()) expect(set.size).toBeLessThanOrEqual(2);
  });

  it('ammette una terza materia leggera solo con sessioni brevi', () => {
    const plan = generatePlan(
      [
        makeExam({ examId: 'a', primarySessionDate: '2026-08-27' }),
        makeExam({ examId: 'b', primarySessionDate: '2026-09-15' }),
        makeExam({ examId: 'inglese', kind: 'idoneita', priority: 3, primarySessionDate: '2026-09-09' }),
      ],
      { ...options, lightExamIds: ['inglese'] },
    );
    const inglese = plan.tasks.filter((t) => t.examId === 'inglese');
    expect(inglese.length).toBeGreaterThan(0);
    expect(inglese.every((t) => t.plannedMinutes <= 30)).toBe(true);
  });

  it('non introduce nuovi argomenti negli ultimi giorni prima dell’appello', () => {
    const plan = generatePlan(
      [makeExam({ examId: 'elettronica', primarySessionDate: '2026-08-27' })],
      options,
    );
    const ultimiGiorni = plan.tasks.filter(
      (t) => t.examId === 'elettronica' && t.date >= '2026-08-22' && t.date <= '2026-08-27',
    );
    expect(ultimiGiorni.length).toBeGreaterThan(0);
    expect(ultimiGiorni.some((t) => t.activityType === 'teoria')).toBe(false);
  });

  it('pianifica almeno una simulazione entro i 14 giorni precedenti', () => {
    const plan = generatePlan(
      [makeExam({ examId: 'elettronica', primarySessionDate: '2026-08-27' })],
      options,
    );
    const simulazioni = plan.tasks.filter((t) => t.activityType === 'simulazione');
    expect(simulazioni.length).toBeGreaterThan(0);
    expect(simulazioni.every((t) => t.date >= '2026-08-13' && t.date <= '2026-08-27')).toBe(true);
  });

  it('mette i ripassi in scadenza prima del nuovo programma', () => {
    const plan = generatePlan(
      [
        makeExam({
          examId: 'elettronica',
          primarySessionDate: '2026-08-27',
          dueReviews: [{ topicId: 'x', title: 'Giunzione PN', dueDate: '2026-08-05' }],
        }),
      ],
      options,
    );
    const primoGiorno = plan.tasks.filter((t) => t.date === '2026-08-05');
    expect(primoGiorno[0]?.activityType).toBe('ripasso');
  });

  it('non pianifica nulla nei giorni indisponibili', () => {
    const plan = generatePlan(
      [makeExam({ examId: 'elettronica', primarySessionDate: '2026-08-27' })],
      { ...options, unavailable: [{ date: '2026-08-06', availableMinutes: null, reason: 'Famiglia' }] },
    );
    expect(plan.tasks.some((t) => t.date === '2026-08-06')).toBe(false);
  });

  it('trasferisce il tempo alla materia successiva dopo l’appello sostenuto', () => {
    const plan = generatePlan(
      [
        makeExam({ examId: 'elettronica', primarySessionDate: '2026-08-27', priority: 5 }),
        makeExam({ examId: 'metodi', primarySessionDate: '2026-09-15', priority: 5 }),
      ],
      { ...options, horizonDays: 45 },
    );
    const dopo = plan.tasks.filter((t) => t.date > '2026-08-27');
    expect(dopo.length).toBeGreaterThan(0);
    expect(dopo.every((t) => t.examId === 'metodi')).toBe(true);
  });

  it('segnala quando il lavoro non entra nel tempo disponibile', () => {
    const plan = generatePlan(
      [
        makeExam({
          examId: 'elettronica',
          primarySessionDate: '2026-08-12',
          remainingMinutes: 6000,
          backupSessionDate: '2026-09-09',
        }),
      ],
      options,
    );
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings.join(' ')).toContain('riserva');
  });

  it('calcola il carico settimanale', () => {
    const plan = generatePlan(
      [makeExam({ examId: 'elettronica', primarySessionDate: '2026-08-27' })],
      options,
    );
    expect(plan.weeklyLoad.length).toBeGreaterThan(0);
    for (const week of plan.weeklyLoad) {
      expect(week.plannedMinutes).toBeLessThanOrEqual(week.availableMinutes);
    }
  });
});

describe('suggestedHorizon', () => {
  it('arriva a due settimane oltre il primo appello', () => {
    const horizon = suggestedHorizon(
      [makeExam({ examId: 'a', primarySessionDate: '2026-08-27' })],
      '2026-08-05',
    );
    expect(horizon).toBe(36);
  });

  it('usa un orizzonte breve se non ci sono appelli', () => {
    expect(suggestedHorizon([makeExam({ examId: 'a' })], '2026-08-05')).toBe(30);
  });
});
