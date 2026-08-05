'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireUser } from '@/lib/supabase/server';
import {
  getAvailability,
  getBacklogTasks,
  getDueReviews,
  getExamOverviews,
  getProfile,
  getTasksBetween,
  getUnavailableDates,
} from '@/server/data';
import { generatePlan, suggestedHorizon } from '@/lib/domain/planner';
import { buildCapacityCalendar } from '@/lib/domain/availability';
import { rescheduleTasks, type ReschedulableTask } from '@/lib/domain/reschedule';
import { addDaysIso, todayIso } from '@/lib/domain/dates';
import type { PlannerExamInput } from '@/lib/domain/types';

export interface PlanResult {
  ok: boolean;
  message: string;
  warnings?: string[];
  created?: number;
}

const REVALIDATE = ['/oggi', '/dashboard', '/piano', '/calendario'];

function revalidateAll() {
  for (const path of REVALIDATE) revalidatePath(path);
}

/**
 * Rigenera il piano automatico a partire dallo stato reale dello studio.
 * Le attività già completate e quelle bloccate a mano non vengono toccate.
 */
export async function generatePlanAction(): Promise<PlanResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const profile = await getProfile(user.id);
  if (!profile) return { ok: false, message: 'Profilo non trovato.' };

  const today = todayIso(profile.timezone);
  const [overviews, availability, unavailable, backlog, dueReviews] = await Promise.all([
    getExamOverviews(user.id, { today }),
    getAvailability(user.id),
    getUnavailableDates(user.id, today),
    getBacklogTasks(user.id, today),
    getDueReviews(user.id, today, 60),
  ]);

  if (overviews.length === 0) {
    return { ok: false, message: 'Aggiungi almeno un esame prima di generare il piano.' };
  }

  const backlogByExam = new Map<string, number>();
  for (const task of backlog) {
    backlogByExam.set(task.exam_id, (backlogByExam.get(task.exam_id) ?? 0) + task.planned_minutes);
  }

  const examInputs: PlannerExamInput[] = overviews.map((overview) => {
    const pendingTopics = overview.topics
      .filter((topic) => topic.status !== 'consolidato')
      .sort((a, b) => a.position - b.position)
      .map((topic) => ({
        id: topic.id,
        title: topic.title,
        estimatedMinutes: Math.max(
          15,
          Math.round(topic.estimated_minutes * (1 - Number(topic.mastery))),
        ),
        difficulty: topic.difficulty,
        status: topic.status,
        blockedBy: [] as string[],
      }));

    return {
      examId: overview.exam.id,
      name: overview.exam.name,
      shortName: overview.exam.short_name ?? overview.exam.name,
      kind: overview.exam.kind,
      difficulty: overview.exam.difficulty,
      priority: overview.exam.priority,
      primarySessionDate: overview.primarySession?.exam_date ?? null,
      backupSessionDate: overview.backupSession?.exam_date ?? null,
      readiness: overview.readiness.overall,
      remainingMinutes: overview.remainingMinutes,
      pendingTopics,
      dueReviews: dueReviews
        .filter((review) => review.exam_id === overview.exam.id)
        .map((review) => ({
          topicId: review.topic_id,
          title: review.topic?.title ?? 'Argomento',
          dueDate: review.due_date,
        })),
      openErrors: overview.openErrors,
      backlogMinutes: backlogByExam.get(overview.exam.id) ?? 0,
      mockDone: 0,
    };
  });

  const lightExamIds = overviews
    .filter((o) => o.exam.kind === 'idoneita')
    .map((o) => o.exam.id);

  const horizon = suggestedHorizon(examInputs, today);

  const plan = generatePlan(examInputs, {
    today,
    horizonDays: horizon,
    availability,
    unavailable,
    bufferRatio: Number(profile.weekly_buffer_ratio),
    maxSessionMinutes: profile.max_session_minutes,
    minSessionMinutes: profile.min_session_minutes,
    maxParallelExams: profile.max_parallel_exams,
    lightExamIds,
    freezeNewTopicsDays: 6,
    firstMockDaysBefore: 14,
  });

  // Piano attivo
  const { data: planRow } = await supabase
    .from('study_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  let planId = (planRow as { id: string } | null)?.id ?? null;
  if (!planId) {
    const { data: created } = await supabase
      .from('study_plans')
      .insert({
        user_id: user.id,
        name: 'Piano principale',
        start_date: today,
        end_date: profile.target_date,
        is_active: true,
      })
      .select('id')
      .single();
    planId = (created as { id: string } | null)?.id ?? null;
  }

  // Rimuove solo le attività future ancora pianificate e non bloccate a mano.
  await supabase
    .from('study_tasks')
    .delete()
    .eq('user_id', user.id)
    .eq('status', 'pianificata')
    .eq('is_locked', false)
    .gte('scheduled_date', today);

  const rows = plan.tasks.map((task) => ({
    user_id: user.id,
    plan_id: planId,
    exam_id: task.examId,
    topic_id: task.topicId,
    scheduled_date: task.date,
    position: task.position,
    planned_minutes: task.plannedMinutes,
    activity_type: task.activityType,
    title: task.title,
    objective: task.objective,
    status: 'pianificata' as const,
    priority_score: task.priorityScore,
    priority_explanation: task.priorityExplanation,
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from('study_tasks').insert(chunk);
    if (error) return { ok: false, message: `Errore nel salvataggio del piano: ${error.message}` };
  }

  await supabase
    .from('study_plans')
    .update({ generated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('id', planId ?? '');

  revalidateAll();

  return {
    ok: true,
    created: rows.length,
    warnings: plan.warnings,
    message: `Piano aggiornato: ${rows.length} attività nei prossimi ${horizon} giorni.`,
  };
}

/** Segna un'attività come completata (senza passare dalla sessione cronometrata). */
export async function completeTaskAction(taskId: string, actualMinutes?: number): Promise<PlanResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: task } = await supabase
    .from('study_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!task) return { ok: false, message: 'Attività non trovata.' };
  const row = task as { planned_minutes: number };

  const { error } = await supabase
    .from('study_tasks')
    .update({
      status: 'completata',
      actual_minutes: actualMinutes ?? row.planned_minutes,
    })
    .eq('id', taskId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile aggiornare l’attività.' };

  revalidateAll();
  return { ok: true, message: 'Attività completata.' };
}

/** Cambia la durata pianificata di un'attività. */
export async function updateTaskDurationAction(
  taskId: string,
  minutes: number,
): Promise<PlanResult> {
  const user = await requireUser();
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 480) {
    return { ok: false, message: 'La durata deve essere compresa tra 5 e 480 minuti.' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('study_tasks')
    .update({ planned_minutes: Math.round(minutes), is_locked: true })
    .eq('id', taskId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile aggiornare la durata.' };
  revalidateAll();
  return { ok: true, message: 'Durata aggiornata.' };
}

/**
 * "Non posso farlo oggi": l'attività viene marcata come saltata e ricollocata
 * distribuendo il carico, mai ammassata sul giorno successivo.
 */
export async function skipTaskAction(taskId: string): Promise<PlanResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(user.id);
  if (!profile) return { ok: false, message: 'Profilo non trovato.' };

  const today = todayIso(profile.timezone);

  const { data } = await supabase
    .from('study_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data) return { ok: false, message: 'Attività non trovata.' };
  const task = data as {
    id: string;
    exam_id: string;
    planned_minutes: number;
    scheduled_date: string;
    activity_type: string;
    title: string;
    reschedule_count: number;
  };

  const [availability, unavailable, overviews, futureTasks] = await Promise.all([
    getAvailability(user.id),
    getUnavailableDates(user.id, today),
    getExamOverviews(user.id, { today }),
    getTasksBetween(user.id, today, addDaysIso(today, 21)),
  ]);

  const capacity = buildCapacityCalendar(
    addDaysIso(today, 1),
    21,
    availability,
    unavailable,
    Number(profile.weekly_buffer_ratio),
  );

  const plannedByDate: Record<string, number> = {};
  for (const item of futureTasks) {
    if (item.id === taskId) continue;
    if (item.status === 'saltata' || item.status === 'completata') continue;
    plannedByDate[item.scheduled_date] =
      (plannedByDate[item.scheduled_date] ?? 0) + item.planned_minutes;
  }

  const examDeadlines: Record<string, string | null> = {};
  for (const overview of overviews) {
    examDeadlines[overview.exam.id] =
      overview.primarySession?.exam_date ?? overview.nextSession?.exam_date ?? null;
  }

  const reschedulable: ReschedulableTask = {
    id: task.id,
    examId: task.exam_id,
    plannedMinutes: task.planned_minutes,
    scheduledDate: task.scheduled_date,
    activityType: 'teoria',
    title: task.title,
  };

  const result = rescheduleTasks([reschedulable], {
    today: addDaysIso(today, 1),
    capacity,
    plannedByDate,
    examDeadlines,
    maxRecoveryMinutesPerDay: 60,
  });

  const first = result.assignments[0];
  if (!first) {
    await supabase
      .from('study_tasks')
      .update({ status: 'saltata' })
      .eq('id', taskId)
      .eq('user_id', user.id);
    revalidateAll();
    return {
      ok: true,
      message:
        result.unplaced[0]?.reason ??
        'Attività segnata come saltata: al momento non c’è spazio per ricollocarla.',
    };
  }

  // La prima parte viene spostata, le eventuali parti successive create come nuove attività.
  await supabase
    .from('study_tasks')
    .update({
      scheduled_date: first.toDate,
      planned_minutes: first.minutes,
      status: 'pianificata',
      rescheduled_from: task.scheduled_date,
      reschedule_count: task.reschedule_count + 1,
    })
    .eq('id', taskId)
    .eq('user_id', user.id);

  const extra = result.assignments.slice(1);
  if (extra.length > 0) {
    await supabase.from('study_tasks').insert(
      extra.map((assignment, index) => ({
        user_id: user.id,
        exam_id: task.exam_id,
        scheduled_date: assignment.toDate,
        planned_minutes: assignment.minutes,
        activity_type: task.activity_type,
        title: `${task.title} (parte ${index + 2})`,
        status: 'pianificata' as const,
        rescheduled_from: task.scheduled_date,
        reschedule_count: task.reschedule_count + 1,
        priority_explanation: [assignment.reason],
      })),
    );
  }

  revalidateAll();
  return {
    ok: true,
    message: `Spostata al ${first.toDate}. ${first.reason}`,
  };
}

/** Sposta un'attività a una data scelta manualmente (drag and drop del calendario). */
export async function moveTaskAction(taskId: string, newDate: string): Promise<PlanResult> {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { ok: false, message: 'Data non valida.' };
  }
  const supabase = await createClient();
  const profile = await getProfile(user.id);
  if (!profile) return { ok: false, message: 'Profilo non trovato.' };

  const { data: current } = await supabase
    .from('study_tasks')
    .select('scheduled_date, planned_minutes')
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!current) return { ok: false, message: 'Attività non trovata.' };

  const { error } = await supabase
    .from('study_tasks')
    .update({
      scheduled_date: newDate,
      is_locked: true,
      rescheduled_from: (current as { scheduled_date: string }).scheduled_date,
    })
    .eq('id', taskId)
    .eq('user_id', user.id);

  if (error) return { ok: false, message: 'Non è stato possibile spostare l’attività.' };

  // Verifica di sostenibilità del giorno di destinazione
  const dayTasks = await getTasksBetween(user.id, newDate, newDate);
  const availability = await getAvailability(user.id);
  const weekday = new Date(`${newDate}T00:00:00`).getDay();
  const isoDay = weekday === 0 ? 7 : weekday;
  const capacity = availability.find((a) => a.weekday === isoDay);
  const plannable = Math.floor(
    (capacity?.availableMinutes ?? 0) * (1 - Number(profile.weekly_buffer_ratio)),
  );
  const total = dayTasks
    .filter((t) => t.status !== 'completata' && t.status !== 'saltata')
    .reduce((sum, t) => sum + t.planned_minutes, 0);

  revalidateAll();

  if (plannable > 0 && total > plannable) {
    return {
      ok: true,
      message: `Attività spostata. Attenzione: quel giorno arrivi a ${Math.round(total / 60 * 10) / 10} ore su ${Math.round((plannable / 60) * 10) / 10} pianificabili.`,
    };
  }

  return { ok: true, message: 'Attività spostata.' };
}

/** Ridistribuisce tutte le attività arretrate sui giorni successivi. */
export async function rescheduleBacklogAction(): Promise<PlanResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const profile = await getProfile(user.id);
  if (!profile) return { ok: false, message: 'Profilo non trovato.' };

  const today = todayIso(profile.timezone);
  const [backlog, availability, unavailable, overviews, futureTasks] = await Promise.all([
    getBacklogTasks(user.id, today),
    getAvailability(user.id),
    getUnavailableDates(user.id, today),
    getExamOverviews(user.id, { today }),
    getTasksBetween(user.id, today, addDaysIso(today, 30)),
  ]);

  if (backlog.length === 0) return { ok: true, message: 'Non ci sono attività arretrate.' };

  const capacity = buildCapacityCalendar(
    today,
    30,
    availability,
    unavailable,
    Number(profile.weekly_buffer_ratio),
  );

  const plannedByDate: Record<string, number> = {};
  for (const item of futureTasks) {
    if (item.status === 'saltata' || item.status === 'completata') continue;
    plannedByDate[item.scheduled_date] =
      (plannedByDate[item.scheduled_date] ?? 0) + item.planned_minutes;
  }

  const examDeadlines: Record<string, string | null> = {};
  for (const overview of overviews) {
    examDeadlines[overview.exam.id] =
      overview.primarySession?.exam_date ?? overview.nextSession?.exam_date ?? null;
  }

  const result = rescheduleTasks(
    backlog.map((task) => ({
      id: task.id,
      examId: task.exam_id,
      plannedMinutes: task.planned_minutes,
      scheduledDate: task.scheduled_date,
      activityType: task.activity_type,
      title: task.title,
    })),
    { today, capacity, plannedByDate, examDeadlines, maxRecoveryMinutesPerDay: 60 },
  );

  const firstAssignments = new Map<string, (typeof result.assignments)[number]>();
  for (const assignment of result.assignments) {
    if (!firstAssignments.has(assignment.taskId)) firstAssignments.set(assignment.taskId, assignment);
  }

  for (const [taskId, assignment] of firstAssignments) {
    await supabase
      .from('study_tasks')
      .update({
        scheduled_date: assignment.toDate,
        planned_minutes: assignment.minutes,
        status: 'pianificata',
        rescheduled_from: assignment.fromDate,
      })
      .eq('id', taskId)
      .eq('user_id', user.id);
  }

  revalidateAll();

  const moved = firstAssignments.size;
  const unplaced = result.unplaced.length;
  return {
    ok: true,
    message:
      unplaced > 0
        ? `${moved} attività ridistribuite. ${unplaced} non hanno trovato spazio: valuta di ridurle o di spostare l’appello.`
        : `${moved} attività ridistribuite sui prossimi giorni, senza sovraccaricare una sola giornata.`,
  };
}
