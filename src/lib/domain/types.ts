/**
 * Tipi del dominio StudyAI.
 *
 * Questo modulo è volutamente indipendente da React, da Next.js e da Supabase:
 * contiene solo strutture dati e viene usato dalle funzioni pure in `lib/domain`,
 * che sono coperte dai test unitari.
 */

export type IsoDate = string; // formato 'yyyy-MM-dd'

export type ExamStatus =
  | 'non_iniziato'
  | 'pianificato'
  | 'in_studio'
  | 'pronto'
  | 'tentato'
  | 'superato';

export type ExamKind = 'scritto' | 'orale' | 'misto' | 'idoneita' | 'progetto';

export type TopicStatus =
  | 'non_iniziato'
  | 'in_corso'
  | 'studiato'
  | 'da_ripassare'
  | 'consolidato';

export type TaskStatus =
  | 'pianificata'
  | 'in_corso'
  | 'completata'
  | 'saltata'
  | 'riprogrammata';

export type ActivityType =
  | 'teoria'
  | 'esercizi'
  | 'ripasso'
  | 'simulazione'
  | 'recupero_attivo'
  | 'lettura'
  | 'correzione_errori'
  | 'altro';

export type RiskLevel = 'verde' | 'giallo' | 'arancione' | 'rosso' | 'grigio';

export type SessionRole = 'nessuno' | 'principale' | 'riserva';

/** Voti del ripasso: dal peggiore al migliore. */
export type RecallGrade = 0 | 1 | 2 | 3 | 4;

export const RECALL_GRADE_LABELS: Record<RecallGrade, string> = {
  0: 'Non ricordavo',
  1: 'Ricordavo con molta difficoltà',
  2: 'Ricordavo parzialmente',
  3: 'Ricordavo bene',
  4: 'Ricordavo perfettamente',
};

/** Pesi del calcolo di preparazione. La somma viene normalizzata a 1. */
export interface ReadinessWeights {
  coverage: number;
  activeRecall: number;
  exercises: number;
  mock: number;
  reviewRegularity: number;
}

export const DEFAULT_READINESS_WEIGHTS: ReadinessWeights = {
  coverage: 0.2,
  activeRecall: 0.25,
  exercises: 0.25,
  mock: 0.2,
  reviewRegularity: 0.1,
};

/** Componente del punteggio, con spiegazione leggibile. */
export interface ScoreComponent {
  key: string;
  label: string;
  value: number;
  weight: number;
  contribution: number;
  explanation: string;
  applicable: boolean;
}

export interface ReadinessInput {
  examKind: ExamKind;
  hasExercises: boolean;
  /** Argomenti del programma con il loro stato. */
  topics: Array<{
    id: string;
    status: TopicStatus;
    mastery: number; // 0..1
    estimatedMinutes: number;
    studiedMinutes: number;
  }>;
  /** Tentativi di recupero attivo (domande aperte, flashcard, quiz). */
  recall: { attempts: number; correct: number };
  /** Esercizi svolti. */
  exercises: { attempts: number; correct: number };
  /** Simulazioni completate, punteggio normalizzato 0..1. */
  mockAttempts: Array<{ scoreRatio: number; date: IsoDate }>;
  /** Ripassi: quanti erano dovuti e quanti sono stati fatti in tempo. */
  reviews: { due: number; doneOnTime: number };
  weights?: ReadinessWeights;
}

export interface ReadinessResult {
  overall: number; // 0..1
  components: ScoreComponent[];
  /** Quanto ci si può fidare della stima (0..1): dipende dalla quantità di dati. */
  confidence: number;
  /** Dettaglio per dimensione, utile nella UI. */
  dimensions: {
    coverage: number;
    comprehension: number;
    memory: number;
    application: number;
    mock: number;
  };
  summary: string;
}

export interface AvailabilityDay {
  /** 1 = lunedì ... 7 = domenica */
  weekday: number;
  availableMinutes: number;
  isRestDay: boolean;
}

export interface UnavailableDate {
  date: IsoDate;
  /** null/undefined = giornata interamente non disponibile */
  availableMinutes?: number | null;
  reason?: string | null;
}

export interface PlannerExamInput {
  examId: string;
  name: string;
  shortName: string;
  kind: ExamKind;
  difficulty: number; // 1..5
  priority: number; // 1..5
  /** Data dell'appello principale, se presente. */
  primarySessionDate: IsoDate | null;
  backupSessionDate: IsoDate | null;
  readiness: number; // 0..1
  /** Minuti di studio ancora necessari, stimati. */
  remainingMinutes: number;
  /** Argomenti ancora da affrontare, in ordine di programma. */
  pendingTopics: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    difficulty: number;
    status: TopicStatus;
    /** Prerequisiti (id di altri argomenti) non ancora completati. */
    blockedBy: string[];
    /** Materiale collegato: permette attività del tipo «slide 45-72». */
    material?: MaterialRef;
  }>;
  /** Ripassi dovuti entro l'orizzonte di pianificazione. */
  dueReviews: Array<{ topicId: string; title: string; dueDate: IsoDate }>;
  /** Numero di errori aperti sull'esame. */
  openErrors: number;
  /** Attività non svolte da recuperare. */
  backlogMinutes: number;
  /** Numero di simulazioni già svolte. */
  mockDone: number;
}

export interface PlannerOptions {
  today: IsoDate;
  horizonDays: number;
  availability: AvailabilityDay[];
  unavailable: UnavailableDate[];
  bufferRatio: number; // quota di tempo NON pianificata
  maxSessionMinutes: number;
  minSessionMinutes: number;
  maxParallelExams: number;
  /** Esami "leggeri" ammessi come terza materia (es. Inglese). */
  lightExamIds?: string[];
  /** Numero di giorni prima dell'appello in cui non si introducono nuovi argomenti. */
  freezeNewTopicsDays?: number;
  /** Giorni prima dell'appello entro cui pianificare la prima simulazione. */
  firstMockDaysBefore?: number;
}

/** Riferimento a un intervallo di pagine di una risorsa. */
export interface MaterialRef {
  resourceId: string;
  segmentId: string;
  /** Titolo breve della risorsa, es. «Elettronica L3». */
  resourceLabel: string;
  pageStart: number;
  pageEnd: number;
  /** Etichetta delle pagine: «slide» per le presentazioni, «pagine» altrimenti. */
  unit: 'slide' | 'pagine';
}

export interface PlannedTask {
  date: IsoDate;
  examId: string;
  topicId: string | null;
  material?: MaterialRef;
  title: string;
  objective: string;
  activityType: ActivityType;
  plannedMinutes: number;
  priorityScore: number;
  priorityExplanation: string[];
  position: number;
}

export interface PlannerResult {
  tasks: PlannedTask[];
  /** Avvisi non colpevolizzanti da mostrare nella UI. */
  warnings: string[];
  /** Minuti pianificati / minuti disponibili per settimana ISO. */
  weeklyLoad: Array<{ weekStart: IsoDate; plannedMinutes: number; availableMinutes: number }>;
}

export interface FeasibilityInput {
  today: IsoDate;
  examDate: IsoDate | null;
  backupExamDate: IsoDate | null;
  requiredMinutes: number;
  availableMinutesBeforeExam: number;
  readiness: number; // 0..1
  coverage: number; // 0..1 programma coperto
  /** Minuti effettivamente studiati negli ultimi 14 giorni. */
  recentPaceMinutesPerDay: number;
  missingReviews: number;
  plannedMocks: number;
  doneMocks: number;
  /** Quantità di dati disponibili: sotto la soglia la stima è "grigia". */
  dataPoints: number;
}

export interface FeasibilityResult {
  risk: RiskLevel;
  label: string;
  message: string;
  daysRemaining: number | null;
  requiredMinutes: number;
  availableMinutes: number;
  /** Rapporto ore necessarie / ore disponibili. >1 significa piano non sostenibile. */
  loadRatio: number | null;
  reasons: string[];
  suggestBackup: boolean;
}
