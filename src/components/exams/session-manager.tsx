'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CalendarPlus, Check, Copy, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmButton } from '@/components/shared/confirm-button';
import {
  confirmEstimatedSessionAction,
  createExamSessionAction,
  deleteExamSessionAction,
  duplicateSessionsNextYearAction,
  setSessionRoleAction,
  updateExamSessionDateAction,
} from '@/server/actions/exams';
import { formatItalianDate, relativeDayLabel } from '@/lib/domain/dates';
import type { IsoDate, SessionRole } from '@/lib/domain/types';

interface SessionRow {
  id: string;
  date: IsoDate;
  role: SessionRole;
  status: string;
  isEstimated: boolean;
  location: string | null;
}

export function SessionManager({
  examId,
  sessions,
  today,
}: {
  examId: string;
  sessions: SessionRow[];
  today: IsoDate;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newDate, setNewDate] = useState('');
  const [isEstimated, setIsEstimated] = useState(false);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  const future = sessions.filter((session) => session.date >= today);
  const past = sessions.filter((session) => session.date < today);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Aggiungi un appello</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-session-date">Data</Label>
            <Input
              id="new-session-date"
              type="date"
              value={newDate}
              onChange={(event) => setNewDate(event.target.value)}
              className="w-44"
            />
          </div>
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isEstimated}
              onChange={(event) => setIsEstimated(event.target.checked)}
              className="h-4 w-4"
            />
            Data stimata
          </label>
          <Button
            disabled={!newDate || pending}
            onClick={() => {
              const formData = new FormData();
              formData.set('examId', examId);
              formData.set('examDate', newDate);
              formData.set('status', isEstimated ? 'stimato' : 'confermato');
              formData.set('isEstimated', String(isEstimated));
              run(() => createExamSessionAction(formData));
              setNewDate('');
            }}
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Aggiungi
          </Button>
          <Button
            variant="outline"
            disabled={sessions.length === 0 || pending}
            onClick={() => run(() => duplicateSessionsNextYearAction(examId))}
          >
            <Copy className="h-4 w-4" aria-hidden />
            Duplica sull’anno successivo
          </Button>
        </CardContent>
      </Card>

      {sessions.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Per questo esame non sono ancora disponibili le date degli appelli. Aggiungile appena
          vengono pubblicate: nel frattempo il piano userà la data obiettivo complessiva.
        </p>
      ) : null}

      {[
        { title: 'Appelli futuri', list: future },
        { title: 'Appelli passati', list: past },
      ].map((group) =>
        group.list.length > 0 ? (
          <div key={group.title} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{group.title}</h3>
            <ul className="space-y-2">
              {group.list.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3 text-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-medium">
                      {formatItalianDate(session.date)}
                      {session.role === 'principale' ? <Badge>Principale</Badge> : null}
                      {session.role === 'riserva' ? <Badge variant="secondary">Riserva</Badge> : null}
                      {session.isEstimated ? <Badge variant="accent">Stimata</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {relativeDayLabel(today, session.date)}
                      {session.location ? ` · ${session.location}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <Input
                      type="date"
                      defaultValue={session.date}
                      aria-label={`Modifica data dell'appello del ${session.date}`}
                      className="h-9 w-40"
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value && value !== session.date) {
                          run(() => updateExamSessionDateAction(session.id, value));
                        }
                      }}
                    />
                    {session.role !== 'principale' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => setSessionRoleAction(session.id, 'principale'))}
                      >
                        <Star className="h-4 w-4" aria-hidden />
                        Principale
                      </Button>
                    ) : null}
                    {session.role !== 'riserva' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => setSessionRoleAction(session.id, 'riserva'))}
                      >
                        Riserva
                      </Button>
                    ) : null}
                    {session.isEstimated ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => confirmEstimatedSessionAction(session.id))}
                      >
                        <Check className="h-4 w-4" aria-hidden />
                        Conferma
                      </Button>
                    ) : null}
                    <ConfirmButton
                      trigger={
                        <Button size="icon" variant="ghost" aria-label="Elimina appello">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      }
                      title="Eliminare questo appello?"
                      description="L’operazione non può essere annullata."
                      onConfirm={async () => {
                        const result = await deleteExamSessionAction(session.id);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.message);
                        router.refresh();
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}
