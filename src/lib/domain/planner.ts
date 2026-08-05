/**
 * Motore di pianificazione.
 *
 * Genera il piano giorno per giorno rispettando regole esplicite:
 *  - non si usa più dell'(1 - bufferRatio) del tempo disponibile (default 85%);
 *  - al massimo `maxParallelExams` materie principali in contemporanea;
 *  - una terza materia è ammessa solo per attività brevi (es. Inglese);
 *  - teoria ed esercizi si alternano;
 *  - la prima simulazione cade 10–14 giorni prima dell'appello;
 *  - nessun argomento nuovo negli ultimi 5–7 giorni;
 *  - i ripassi dovuti hanno la precedenza sul nuovo programma;
 *  - il lavoro arretrato viene distribuito, non ammassato sul giorno dopo.
 *
 * Il motore non cambia mai l'appello da solo: se il piano non è sostenibile
 * lo segnala e propone l'appello di riserva.
 */
import { addDaysIso, daysBetween, weekStartIso } from './dates';
import { buildCapacityCalendar, type DayCapacity } from './availability';
import { computePriority } from './priority';
import type {
  ActivityType,
  IsoDate,
  PlannedTask,
  PlannerExamInput,
  PlannerOptions,
  PlannerResult,
} from './types';

interface TopicRuntime {
  id: string;
  title: string;
  remaining: number;
  difficulty: number;
  blockedBy: string[];
}

interface ExamRuntime {
  input: PlannerExamInput;
  queue: TopicRuntime[];
  completed: Set<string>;
  lastActivity: ActivityType | null;
  lastTopic: { id: string; title: string } | null;
  mockPlanned: number;
  backlogRemaining: number;
  errorsHandled: boolean;
  plannedMinutes: number;
}

const BLOCK = 15; // granularità delle sessioni, in minuti

function roundToBlock(minutes: number): number {
  return Math.max(0, Math.round(minutes / BLOCK) * BLOCK);
}

function isExamActiveOn(exam: PlannerExamInput, date: IsoDate): boolean {
  if (!exam.primarySessionDate) return true; // esame senza appello: lavoro di fondo
  return exam.primarySessionDate >= date;
}

function buildRuntime(exams: PlannerExamInput[]): ExamRuntime[] {
  return exams.map((exam) => ({
    input: exam,
    queue: exam.pendingTopics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      remaining: Math.max(BLOCK, topic.estimatedMinutes),
      difficulty: topic.difficulty,
      blockedBy: topic.blockedBy,
    })),
    completed: new Set<string>(),
    lastActivity: null,
    lastTopic: null,
    mockPlanned: 0,
    backlogRemaining: Math.max(0, exam.backlogMinutes),
    errorsHandled: false,
    plannedMinutes: 0,
  }));
}

function nextAvailableTopic(runtime: ExamRuntime): TopicRuntime | null {
  for (const topic of runtime.queue) {
    if (topic.remaining <= 0) continue;
    const blocked = topic.blockedBy.some(
      (id) => !runtime.completed.has(id) && runtime.queue.some((t) => t.id === id && t.remaining > 0),
    );
    if (!blocked) return topic;
  }
  // se tutti risultano bloccati (dipendenze circolari o dati incompleti) si prende il primo
  return runtime.queue.find((t) => t.remaining > 0) ?? null;
}

/** Giorni mancanti all'appello per un dato giorno di pianificazione. */
function daysToExam(exam: PlannerExamInput, date: IsoDate): number | null {
  if (!exam.primarySessionDate) return null;
  return daysBetween(date, exam.primarySessionDate);
}

interface DailySlot {
  runtime: ExamRuntime;
  minutes: number;
  score: number;
  explanation: string[];
  isLight: boolean;
}

function allocateDay(
  runtimes: ExamRuntime[],
  day: DayCapacity,
  options: PlannerOptions,
): DailySlot[] {
  const lightIds = new Set(options.lightExamIds ?? []);

  const scored = runtimes
    .filter((r) => isExamActiveOn(r.input, day.date))
    .filter((r) => r.queue.some((t) => t.remaining > 0) || r.backlogRemaining > 0 || hasReviewOn(r, day.date) || shouldPlanMock(r, day.date, options))
    .map((r) => {
      const days = daysToExam(r.input, day.date);
      const priority = computePriority({
        today: day.date,
        examDate: r.input.primarySessionDate,
        manualPriority: r.input.priority,
        difficulty: r.input.difficulty,
        readiness: r.input.readiness,
        unlocksExams: 0,
        backlogMinutes: r.backlogRemaining,
        openErrors: r.input.openErrors,
        loadRatio:
          days !== null && days > 0 && day.plannableMinutes > 0
            ? remainingWork(r) / Math.max(1, days * day.plannableMinutes)
            : null,
      });
      return { runtime: r, score: priority.score, explanation: priority.explanation };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || day.plannableMinutes < options.minSessionMinutes) return [];

  const mains = scored.filter((s) => !lightIds.has(s.runtime.input.examId)).slice(0, options.maxParallelExams);
  const light = scored.find((s) => lightIds.has(s.runtime.input.examId));

  let budget = day.plannableMinutes;
  const slots: DailySlot[] = [];

  // La materia "leggera" prende al massimo un blocco breve, e solo se avanza tempo.
  let lightMinutes = 0;
  if (light && budget >= options.minSessionMinutes * (mains.length + 1)) {
    lightMinutes = Math.min(30, options.minSessionMinutes);
    budget -= lightMinutes;
  }

  const totalScore = mains.reduce((sum, s) => sum + s.score, 0);
  if (totalScore > 0) {
    let assigned = 0;
    mains.forEach((slot, index) => {
      const isLast = index === mains.length - 1;
      let minutes = isLast
        ? budget - assigned
        : roundToBlock((slot.score / totalScore) * budget);
      minutes = Math.min(minutes, options.maxSessionMinutes * 2);
      if (minutes < options.minSessionMinutes) minutes = 0;
      assigned += minutes;
      if (minutes > 0) {
        slots.push({
          runtime: slot.runtime,
          minutes,
          score: slot.score,
          explanation: slot.explanation,
          isLight: false,
        });
      }
    });
    // Se nulla è stato assegnato (giornata corta) tutto va alla materia più urgente.
    const first = mains[0];
    if (slots.length === 0 && first && budget >= options.minSessionMinutes) {
      slots.push({
        runtime: first.runtime,
        minutes: budget,
        score: first.score,
        explanation: first.explanation,
        isLight: false,
      });
    }
  }

  if (light && lightMinutes > 0) {
    slots.push({
      runtime: light.runtime,
      minutes: lightMinutes,
      score: light.score,
      explanation: [...light.explanation, 'Attività breve: terza materia ammessa solo in sessioni corte.'],
      isLight: true,
    });
  }

  return slots;
}

function remainingWork(runtime: ExamRuntime): number {
  return (
    runtime.queue.reduce((sum, t) => sum + Math.max(0, t.remaining), 0) + runtime.backlogRemaining
  );
}

function hasReviewOn(runtime: ExamRuntime, date: IsoDate): boolean {
  return runtime.input.dueReviews.some((r) => r.dueDate <= date);
}

function shouldPlanMock(runtime: ExamRuntime, date: IsoDate, options: PlannerOptions): boolean {
  const days = daysToExam(runtime.input, date);
  if (days === null) return false;
  const window = options.firstMockDaysBefore ?? 14;
  if (days > window || days < 1) return false;
  const totalMocks = runtime.mockPlanned + runtime.input.mockDone;
  // una simulazione ogni ~5 giorni nell'ultima finestra
  return totalMocks < Math.max(1, Math.ceil(window / 5)) && days % 5 <= 1;
}

/**
 * Suddivide i minuti assegnati a un esame in attività concrete per la giornata.
 */
function buildTasksForSlot(
  slot: DailySlot,
  day: DayCapacity,
  options: PlannerOptions,
  positionStart: number,
): PlannedTask[] {
  const runtime = slot.runtime;
  const exam = runtime.input;
  const tasks: PlannedTask[] = [];
  let remaining = slot.minutes;
  let position = positionStart;
  const days = daysToExam(exam, day.date);
  const freeze = options.freezeNewTopicsDays ?? 6;
  const noNewTopics = days !== null && days <= freeze;

  const push = (
    activityType: ActivityType,
    minutes: number,
    title: string,
    objective: string,
    topicId: string | null,
    extraReason?: string,
  ) => {
    if (minutes < BLOCK) return;
    tasks.push({
      date: day.date,
      examId: exam.examId,
      topicId,
      title,
      objective,
      activityType,
      plannedMinutes: minutes,
      priorityScore: slot.score,
      priorityExplanation: extraReason ? [...slot.explanation, extraReason] : slot.explanation,
      position,
    });
    position += 1;
    remaining -= minutes;
    runtime.lastActivity = activityType;
    runtime.plannedMinutes += minutes;
  };

  // 1. Ripassi dovuti: hanno la precedenza.
  const dueReviews = exam.dueReviews.filter((r) => r.dueDate <= day.date).slice(0, 2);
  for (const review of dueReviews) {
    const minutes = Math.min(30, Math.max(BLOCK, Math.floor(remaining / 2)));
    if (remaining < BLOCK) break;
    push(
      'ripasso',
      minutes,
      `Ripasso: ${review.title}`,
      'Rievoca i punti principali senza guardare gli appunti, poi verifica.',
      review.topicId,
      `Ripasso in scadenza dal ${review.dueDate}.`,
    );
  }

  // 2. Simulazione nella finestra pre-appello.
  if (remaining >= 45 && shouldPlanMock(runtime, day.date, options)) {
    const minutes = Math.min(remaining, Math.max(45, Math.min(120, options.maxSessionMinutes)));
    runtime.mockPlanned += 1;
    push(
      'simulazione',
      minutes,
      `Simulazione d'esame — ${exam.shortName}`,
      'Prova a tempo, poi correzione ragionata degli errori.',
      null,
      days !== null ? `Prima simulazione entro ${options.firstMockDaysBefore ?? 14} giorni dall'appello (mancano ${days} giorni).` : undefined,
    );
  }

  // 3. Correzione errori se ce ne sono molti aperti (una volta ogni giornata di studio).
  if (remaining >= BLOCK && exam.openErrors >= 3 && !runtime.errorsHandled) {
    runtime.errorsHandled = true;
    push(
      'correzione_errori',
      Math.min(30, remaining),
      `Quaderno degli errori — ${exam.shortName}`,
      'Rifai gli errori aperti e annota la correzione.',
      null,
      `${exam.openErrors} errori aperti sull'esame.`,
    );
  }

  // 4. Recupero arretrato distribuito (mai più di 45 minuti al giorno).
  if (remaining >= BLOCK && runtime.backlogRemaining > 0) {
    const minutes = Math.min(remaining, roundToBlock(Math.min(45, runtime.backlogRemaining)));
    if (minutes >= BLOCK) {
      runtime.backlogRemaining -= minutes;
      push(
        'ripasso',
        minutes,
        `Recupero attività — ${exam.shortName}`,
        'Riprendi ciò che era rimasto indietro, senza rifare tutto in un giorno.',
        runtime.lastTopic?.id ?? null,
        'Recupero distribuito su più giorni.',
      );
    }
  }

  // 5. Teoria / esercizi alternati sul programma.
  let guard = 0;
  while (remaining >= options.minSessionMinutes && guard < 6) {
    guard += 1;
    const wantExercises =
      runtime.lastActivity === 'teoria' && (exam.kind !== 'idoneita' ? true : false);

    if (noNewTopics) {
      // Ultimi giorni: solo consolidamento.
      const minutes = Math.min(remaining, options.maxSessionMinutes);
      const topic = runtime.lastTopic;
      push(
        wantExercises ? 'esercizi' : 'recupero_attivo',
        minutes,
        wantExercises
          ? `Esercizi di consolidamento — ${exam.shortName}`
          : `Recupero attivo — ${exam.shortName}`,
        'Niente argomenti nuovi: si consolida ciò che è già stato studiato.',
        topic?.id ?? null,
        `Mancano ${days} giorni all'appello: nessun nuovo argomento.`,
      );
      break;
    }

    if (wantExercises && runtime.lastTopic) {
      const minutes = Math.min(remaining, Math.max(options.minSessionMinutes, roundToBlock(remaining / 2)));
      push(
        'esercizi',
        minutes,
        `Esercizi: ${runtime.lastTopic.title}`,
        'Applica quanto studiato risolvendo esercizi senza guardare la soluzione.',
        runtime.lastTopic.id,
        'Teoria ed esercizi si alternano.',
      );
      continue;
    }

    const topic = nextAvailableTopic(runtime);
    if (!topic) break;
    const minutes = Math.min(
      remaining,
      options.maxSessionMinutes,
      Math.max(options.minSessionMinutes, roundToBlock(topic.remaining)),
    );
    topic.remaining -= minutes;
    if (topic.remaining <= 0) runtime.completed.add(topic.id);
    runtime.lastTopic = { id: topic.id, title: topic.title };
    push(
      'teoria',
      minutes,
      `Studio: ${topic.title}`,
      'Studia attivamente: alla fine spiega l’argomento a voce senza guardare.',
      topic.id,
    );
  }

  return tasks;
}

export function generatePlan(exams: PlannerExamInput[], options: PlannerOptions): PlannerResult {
  const runtimes = buildRuntime(exams);
  const calendar = buildCapacityCalendar(
    options.today,
    options.horizonDays,
    options.availability,
    options.unavailable,
    options.bufferRatio,
  );

  const tasks: PlannedTask[] = [];
  const warnings: string[] = [];

  for (const day of calendar) {
    for (const runtime of runtimes) runtime.errorsHandled = false;
    if (day.plannableMinutes < options.minSessionMinutes) continue;

    const slots = allocateDay(runtimes, day, options);
    let position = 0;
    for (const slot of slots) {
      const dayTasks = buildTasksForSlot(slot, day, options, position);
      position += dayTasks.length;
      tasks.push(...dayTasks);
    }
  }

  // ---- Verifiche di sostenibilità (segnalazioni, nessuna modifica automatica) ----
  const upcoming = exams.filter((e) => e.primarySessionDate);
  if (upcoming.length > options.maxParallelExams) {
    const soon = upcoming
      .filter((e) => e.primarySessionDate && daysBetween(options.today, e.primarySessionDate) <= 45)
      .map((e) => e.shortName);
    if (soon.length > options.maxParallelExams) {
      warnings.push(
        `Hai ${soon.length} appelli entro 45 giorni (${soon.join(', ')}): il piano ne segue ${options.maxParallelExams} come materie principali.`,
      );
    }
  }

  for (const runtime of runtimes) {
    const left = remainingWork(runtime);
    const date = runtime.input.primarySessionDate;
    if (date && left > 0) {
      const plannedBefore = tasks
        .filter((t) => t.examId === runtime.input.examId && t.date <= date)
        .reduce((sum, t) => sum + t.plannedMinutes, 0);
      if (plannedBefore < runtime.input.remainingMinutes * 0.8) {
        warnings.push(
          `${runtime.input.shortName}: nel tempo disponibile prima del ${date} rientra circa il ${Math.round(
            (plannedBefore / Math.max(1, runtime.input.remainingMinutes)) * 100,
          )}% del lavoro stimato.${runtime.input.backupSessionDate ? ` Esiste un appello di riserva il ${runtime.input.backupSessionDate}: la scelta resta tua.` : ''}`,
        );
      }
    }
  }

  // ---- Carico settimanale ----
  const weekly = new Map<IsoDate, { plannedMinutes: number; availableMinutes: number }>();
  for (const day of calendar) {
    const key = weekStartIso(day.date);
    const entry = weekly.get(key) ?? { plannedMinutes: 0, availableMinutes: 0 };
    entry.availableMinutes += day.rawMinutes;
    weekly.set(key, entry);
  }
  for (const task of tasks) {
    const key = weekStartIso(task.date);
    const entry = weekly.get(key) ?? { plannedMinutes: 0, availableMinutes: 0 };
    entry.plannedMinutes += task.plannedMinutes;
    weekly.set(key, entry);
  }

  const weeklyLoad = [...weekly.entries()]
    .map(([weekStart, value]) => ({ weekStart, ...value }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const overloaded = weeklyLoad.filter(
    (w) => w.availableMinutes > 0 && w.plannedMinutes / w.availableMinutes > 1 - options.bufferRatio + 0.02,
  );
  if (overloaded.length > 0) {
    warnings.push(
      `In ${overloaded.length} settimane il piano supera il ${Math.round((1 - options.bufferRatio) * 100)}% del tempo disponibile: valuta di ridurre qualche attività.`,
    );
  }

  return { tasks, warnings, weeklyLoad };
}

/** Orizzonte di pianificazione consigliato: fino al primo appello + 14 giorni, max 90. */
export function suggestedHorizon(exams: PlannerExamInput[], today: IsoDate): number {
  const dates = exams
    .map((e) => e.primarySessionDate)
    .filter((d): d is IsoDate => Boolean(d))
    .sort();
  const first = dates[0];
  if (!first) return 30;
  const days = daysBetween(today, first) + 14;
  return Math.min(90, Math.max(14, days));
}

export const PLANNER_DEFAULTS = {
  horizonDays: 45,
  bufferRatio: 0.15,
  maxSessionMinutes: 120,
  minSessionMinutes: 25,
  maxParallelExams: 2,
  freezeNewTopicsDays: 6,
  firstMockDaysBefore: 14,
} as const;

export function nextDayAfter(date: IsoDate): IsoDate {
  return addDaysIso(date, 1);
}
