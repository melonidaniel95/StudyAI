'use client';

import { useEffect } from 'react';

interface NotificationSchedulerProps {
  enabled: boolean;
  dueReviews: number;
  pendingTasks: number;
}

const LAST_KEY = 'studyai:ultima-notifica';

/**
 * Promemoria discreto: al massimo una notifica al giorno, solo se il permesso
 * è già stato concesso e le notifiche sono attive nel profilo.
 */
export function NotificationScheduler({
  enabled,
  dueReviews,
  pendingTasks,
}: NotificationSchedulerProps) {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (dueReviews === 0 && pendingTasks === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    try {
      if (window.localStorage.getItem(LAST_KEY) === today) return;
      window.localStorage.setItem(LAST_KEY, today);
    } catch {
      return;
    }

    const parts: string[] = [];
    if (pendingTasks > 0) {
      parts.push(`${pendingTasks} ${pendingTasks === 1 ? 'attività' : 'attività'} in programma`);
    }
    if (dueReviews > 0) {
      parts.push(`${dueReviews} ${dueReviews === 1 ? 'ripasso' : 'ripassi'} in scadenza`);
    }

    new Notification('StudyAI — il piano di oggi', {
      body: parts.join(' · '),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'studyos-oggi',
    });
  }, [enabled, dueReviews, pendingTasks]);

  return null;
}
