'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { syncOfflineSessionAction } from '@/server/actions/sessions';

const QUEUE_KEY = 'studyai:sessioni-da-sincronizzare';

export interface QueuedSession {
  clientUuid: string;
  examId: string;
  topicId: string | null;
  taskId: string | null;
  startedAt: string;
  effectiveMinutes: number;
  comprehension: number;
  recall: number;
  objectiveCompleted: boolean;
  notes?: string;
}

/** Aggiunge una sessione alla coda locale (usata quando manca la rete). */
export function enqueueSession(session: QueuedSession): void {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const queue: QueuedSession[] = raw ? JSON.parse(raw) : [];
    queue.push(session);
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // spazio non disponibile
  }
}

/** Svuota la coda alla riconnessione: l'invio è idempotente grazie a clientUuid. */
export function OfflineSync() {
  useEffect(() => {
    async function flush() {
      if (!navigator.onLine) return;
      let queue: QueuedSession[] = [];
      try {
        const raw = window.localStorage.getItem(QUEUE_KEY);
        queue = raw ? JSON.parse(raw) : [];
      } catch {
        return;
      }
      if (queue.length === 0) return;

      const remaining: QueuedSession[] = [];
      for (const item of queue) {
        const result = await syncOfflineSessionAction(item);
        if (!result.ok) remaining.push(item);
      }

      try {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      } catch {
        // ignorato
      }

      const synced = queue.length - remaining.length;
      if (synced > 0) {
        toast.success(
          `${synced} ${synced === 1 ? 'sessione sincronizzata' : 'sessioni sincronizzate'}.`,
        );
      }
    }

    void flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  return null;
}
