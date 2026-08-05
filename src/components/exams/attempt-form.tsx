'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { recordAttemptAction } from '@/server/actions/exams';
import { formatShortDate } from '@/lib/domain/dates';
import type { IsoDate } from '@/lib/domain/types';

interface AttemptRow {
  id: string;
  date: IsoDate;
  outcome: string;
  grade: number | null;
  cumLaude: boolean;
  notes: string | null;
}

const OUTCOME_LABELS: Record<string, string> = {
  superato: 'Superato',
  non_superato: 'Non superato',
  ritirato: 'Ritirato',
  assente: 'Assente',
};

export function AttemptForm({
  examId,
  today,
  sessions,
  attempts,
}: {
  examId: string;
  today: IsoDate;
  sessions: Array<{ id: string; date: IsoDate }>;
  attempts: AttemptRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(today);
  const [sessionId, setSessionId] = useState('');
  const [outcome, setOutcome] = useState('superato');
  const [grade, setGrade] = useState('');
  const [cumLaude, setCumLaude] = useState(false);
  const [notes, setNotes] = useState('');

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Registra un esito</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="attempt-date">Data</Label>
              <Input
                id="attempt-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attempt-session">Appello</Label>
              <select
                id="attempt-session"
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="">Non collegato</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {formatShortDate(session.date)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="attempt-outcome">Esito</Label>
              <select
                id="attempt-outcome"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              >
                {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="attempt-grade">Voto</Label>
              <Input
                id="attempt-grade"
                type="number"
                min={18}
                max={31}
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                disabled={outcome !== 'superato'}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cumLaude}
              onChange={(event) => setCumLaude(event.target.checked)}
              className="h-4 w-4"
              disabled={outcome !== 'superato'}
            />
            Con lode
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="attempt-notes">Note</Label>
            <Textarea
              id="attempt-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <Button
            loading={pending}
            onClick={() => {
              const formData = new FormData();
              formData.set('examId', examId);
              formData.set('examSessionId', sessionId);
              formData.set('attemptDate', date);
              formData.set('outcome', outcome);
              if (grade) formData.set('grade', grade);
              formData.set('cumLaude', String(cumLaude));
              formData.set('notes', notes);
              startTransition(async () => {
                const result = await recordAttemptAction(formData);
                if (result.ok) {
                  toast.success(result.message);
                  setNotes('');
                  setGrade('');
                  router.refresh();
                } else {
                  toast.error(result.message);
                }
              });
            }}
          >
            Salva esito
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tentativi registrati</CardTitle>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun tentativo registrato.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {attempts.map((attempt) => (
                <li key={attempt.id} className="rounded-md border p-3">
                  <p className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatShortDate(attempt.date)}</span>
                    <Badge variant={attempt.outcome === 'superato' ? 'default' : 'muted'}>
                      {OUTCOME_LABELS[attempt.outcome] ?? attempt.outcome}
                      {attempt.grade ? ` · ${attempt.grade}${attempt.cumLaude ? ' e lode' : ''}` : ''}
                    </Badge>
                  </p>
                  {attempt.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">{attempt.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
