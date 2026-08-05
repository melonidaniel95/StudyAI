/**
 * Schemi Zod condivisi tra client (React Hook Form) e server (Server Action).
 * La validazione lato server è sempre eseguita, anche se il client ha già
 * validato: i dati che arrivano dal browser non sono mai considerati sicuri.
 */
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data non valida (formato atteso: aaaa-mm-gg)');

export const emailSchema = z.string().trim().email('Indirizzo email non valido');

export const passwordSchema = z
  .string()
  .min(8, 'La password deve avere almeno 8 caratteri')
  .max(72, 'La password è troppo lunga');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Inserisci la password'),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().max(120).optional().or(z.literal('')),
});

export const resetPasswordSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Le password non coincidono',
    path: ['confirm'],
  });

export const examSchema = z.object({
  name: z.string().trim().min(2, 'Il nome è troppo corto').max(200),
  shortName: z.string().trim().max(60).optional().or(z.literal('')),
  cfu: z.coerce.number().int().min(0).max(30).optional(),
  kind: z.enum(['scritto', 'orale', 'misto', 'idoneita', 'progetto']),
  hasExercises: z.boolean().default(true),
  hasOral: z.boolean().default(false),
  difficulty: z.coerce.number().int().min(1).max(5),
  initialLevel: z.coerce.number().int().min(1).max(5),
  priority: z.coerce.number().int().min(1).max(5),
  estimatedHours: z.coerce.number().min(0).max(1000).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const examSessionSchema = z.object({
  examId: z.string().uuid(),
  examDate: isoDate,
  status: z.enum(['stimato', 'confermato', 'sostenuto', 'superato', 'non_superato', 'annullato']),
  isEstimated: z.boolean().default(false),
  location: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
});

export const examAttemptSchema = z.object({
  examId: z.string().uuid(),
  examSessionId: z.string().uuid().optional().or(z.literal('')),
  attemptDate: isoDate,
  outcome: z.enum(['superato', 'non_superato', 'ritirato', 'assente']),
  grade: z.coerce.number().int().min(18).max(31).optional(),
  cumLaude: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const moduleSchema = z.object({
  examId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const topicSchema = z.object({
  moduleId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  estimatedMinutes: z.coerce.number().int().min(5).max(1200),
  difficulty: z.coerce.number().int().min(1).max(5),
  frequentlyAsked: z.boolean().default(false),
});

export const importSyllabusSchema = z.object({
  examId: z.string().uuid(),
  /**
   * Testo libero: le righe senza rientro diventano moduli,
   * quelle con "-" o rientro diventano argomenti.
   */
  text: z.string().trim().min(3, 'Incolla il programma da importare').max(20000),
  defaultMinutes: z.coerce.number().int().min(5).max(600).default(60),
});

export const availabilitySchema = z.object({
  days: z
    .array(
      z.object({
        weekday: z.coerce.number().int().min(1).max(7),
        availableMinutes: z.coerce.number().int().min(0).max(960),
        isRestDay: z.boolean().default(false),
        preferredStart: z.string().optional().or(z.literal('')),
      }),
    )
    .length(7),
});

export const unavailableDateSchema = z.object({
  date: isoDate,
  reason: z.string().trim().max(160).optional().or(z.literal('')),
  availableMinutes: z.coerce.number().int().min(0).max(960).optional(),
});

export const profileSchema = z.object({
  fullName: z.string().trim().max(120).optional().or(z.literal('')),
  targetDate: isoDate,
  maxSessionMinutes: z.coerce.number().int().min(15).max(480),
  minSessionMinutes: z.coerce.number().int().min(5).max(120),
  weeklyBufferRatio: z.coerce.number().min(0).max(0.5),
  maxParallelExams: z.coerce.number().int().min(1).max(5),
  studyPreference: z.enum(['teoria', 'esercizi', 'misto']),
  notificationsEnabled: z.boolean().default(false),
  aiEnabled: z.boolean().default(false),
});

export const readinessWeightsSchema = z.object({
  coverage: z.coerce.number().min(0).max(1),
  activeRecall: z.coerce.number().min(0).max(1),
  exercises: z.coerce.number().min(0).max(1),
  mock: z.coerce.number().min(0).max(1),
  reviewRegularity: z.coerce.number().min(0).max(1),
});

export const sessionCompletionSchema = z.object({
  sessionId: z.string().uuid(),
  effectiveMinutes: z.coerce.number().int().min(0).max(600),
  pauseMinutes: z.coerce.number().int().min(0).max(600).default(0),
  interruptions: z.coerce.number().int().min(0).max(50).default(0),
  comprehension: z.coerce.number().int().min(1).max(5),
  recall: z.coerce.number().int().min(1).max(5),
  objectiveCompleted: z.boolean(),
  difficulties: z.string().trim().max(2000).optional().or(z.literal('')),
  doubts: z.string().trim().max(2000).optional().or(z.literal('')),
  nextReviewDays: z.coerce.number().int().min(0).max(60).optional(),
  addError: z.boolean().default(false),
  errorText: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const reviewGradeSchema = z.object({
  reviewId: z.string().uuid(),
  grade: z.coerce.number().int().min(0).max(4),
});

export const resourceSchema = z.object({
  title: z.string().trim().min(2).max(200),
  type: z.enum(['pdf', 'libro', 'video', 'link', 'appunti', 'formulario', 'prova_precedente']),
  examId: z.string().uuid().optional().or(z.literal('')),
  url: z.string().trim().url('Indirizzo non valido').optional().or(z.literal('')),
  author: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  tags: z.string().trim().max(300).optional().or(z.literal('')),
  topicIds: z.array(z.string().uuid()).default([]),
});

export const questionSchema = z.object({
  examId: z.string().uuid(),
  topicId: z.string().uuid().optional().or(z.literal('')),
  type: z.enum(['aperta', 'flashcard', 'scelta_multipla', 'esercizio']),
  prompt: z.string().trim().min(3).max(4000),
  answer: z.string().trim().max(8000).optional().or(z.literal('')),
  evaluationCriteria: z.string().trim().max(4000).optional().or(z.literal('')),
  difficulty: z.coerce.number().int().min(1).max(5),
});

export const flashcardSchema = z.object({
  examId: z.string().uuid(),
  topicId: z.string().uuid().optional().or(z.literal('')),
  front: z.string().trim().min(1).max(2000),
  back: z.string().trim().min(1).max(4000),
  hint: z.string().trim().max(500).optional().or(z.literal('')),
  difficulty: z.coerce.number().int().min(1).max(5),
});

export const exerciseSchema = z.object({
  examId: z.string().uuid(),
  topicId: z.string().uuid().optional().or(z.literal('')),
  title: z.string().trim().min(2).max(200),
  statement: z.string().trim().min(3).max(8000),
  solution: z.string().trim().max(8000).optional().or(z.literal('')),
  difficulty: z.coerce.number().int().min(1).max(5),
  estimatedMinutes: z.coerce.number().int().min(1).max(600),
});

export const exerciseAttemptSchema = z.object({
  exerciseId: z.string().uuid(),
  isCorrect: z.boolean(),
  selfScore: z.coerce.number().int().min(0).max(5),
  minutesUsed: z.coerce.number().int().min(0).max(600).optional(),
  answer: z.string().trim().max(8000).optional().or(z.literal('')),
  errorType: z
    .enum([
      'concettuale',
      'calcolo',
      'distrazione',
      'formula_dimenticata',
      'interpretazione',
      'procedimento_incompleto',
      'gestione_tempo',
      'esposizione_orale',
    ])
    .optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

export const mockExamSchema = z.object({
  examId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  kind: z.enum(['scritto', 'orale', 'quiz', 'misto']),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  maxScore: z.coerce.number().min(1).max(100),
  passThreshold: z.coerce.number().min(0).max(100),
  topicIds: z.array(z.string().uuid()).default([]),
});

export const mockAttemptSchema = z.object({
  mockExamId: z.string().uuid(),
  score: z.coerce.number().min(0).max(100),
  minutesUsed: z.coerce.number().int().min(0).max(600),
  selfEvaluation: z.coerce.number().int().min(1).max(5),
  weakPoints: z.string().trim().max(4000).optional().or(z.literal('')),
  notes: z.string().trim().max(4000).optional().or(z.literal('')),
});

export const errorLogSchema = z.object({
  examId: z.string().uuid(),
  topicId: z.string().uuid().optional().or(z.literal('')),
  questionText: z.string().trim().min(3).max(4000),
  givenAnswer: z.string().trim().max(4000).optional().or(z.literal('')),
  correctAnswer: z.string().trim().max(4000).optional().or(z.literal('')),
  errorType: z.enum([
    'concettuale',
    'calcolo',
    'distrazione',
    'formula_dimenticata',
    'interpretazione',
    'procedimento_incompleto',
    'gestione_tempo',
    'esposizione_orale',
  ]),
  cause: z.string().trim().max(2000).optional().or(z.literal('')),
  correction: z.string().trim().max(4000).optional().or(z.literal('')),
  occurredOn: isoDate,
  nextAttemptDate: isoDate.optional().or(z.literal('')),
});

export const onboardingSchema = z.object({
  fullName: z.string().trim().max(120).optional().or(z.literal('')),
  targetDate: isoDate,
  weekdayMinutes: z.coerce.number().int().min(0).max(960),
  weekendMinutes: z.coerce.number().int().min(0).max(960),
  restDays: z.array(z.coerce.number().int().min(1).max(7)).default([]),
  maxSessionMinutes: z.coerce.number().int().min(15).max(480),
  studyPreference: z.enum(['teoria', 'esercizi', 'misto']),
  loadDemoContent: z.boolean().default(true),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ExamInput = z.infer<typeof examSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type SessionCompletionInput = z.infer<typeof sessionCompletionSchema>;
export type ResourceInput = z.infer<typeof resourceSchema>;
