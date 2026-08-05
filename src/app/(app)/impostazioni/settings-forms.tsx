'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bell, CalendarOff, LogOut, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { signOutAction } from '@/server/actions/auth';
import {
  addUnavailableDateAction,
  deleteUnavailableDateAction,
  updateAvailabilityAction,
  updateProfileAction,
  updateReadinessWeightsAction,
} from '@/server/actions/settings';
import { formatItalianDate, formatMinutes } from '@/lib/domain/dates';
import type { AvailabilityDay, IsoDate } from '@/lib/domain/types';

const WEEKDAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

interface ProfileValues {
  fullName: string;
  targetDate: IsoDate;
  maxSessionMinutes: number;
  minSessionMinutes: number;
  weeklyBufferRatio: number;
  maxParallelExams: number;
  studyPreference: 'teoria' | 'esercizi' | 'misto';
  notificationsEnabled: boolean;
  aiEnabled: boolean;
  readinessWeights: {
    coverage: number;
    activeRecall: number;
    exercises: number;
    mock: number;
    reviewRegularity: number;
  };
}

export function SettingsForms({
  email,
  today,
  profile,
  availability,
  unavailable,
}: {
  email: string;
  today: IsoDate;
  profile: ProfileValues;
  availability: AvailabilityDay[];
  unavailable: Array<{ id: string; date: IsoDate; reason: string | null; availableMinutes: number | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [values, setValues] = useState(profile);
  const [days, setDays] = useState(availability);
  const [weights, setWeights] = useState(profile.readinessWeights);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [notificationStatus, setNotificationStatus] = useState<string>('');

  const weeklyTotal = days.reduce(
    (sum, day) => sum + (day.isRestDay ? 0 : day.availableMinutes),
    0,
  );

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  async function requestNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('Il tuo browser non supporta le notifiche.');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationStatus(
      permission === 'granted'
        ? 'Notifiche attivate: riceverai i promemoria di ripassi e sessioni.'
        : 'Permesso non concesso: puoi cambiarlo dalle impostazioni del browser.',
    );
    if (permission === 'granted') {
      setValues((current) => ({ ...current, notificationsEnabled: true }));
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Profilo e preferenze</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="set-name">Nome</Label>
              <Input
                id="set-name"
                value={values.fullName}
                onChange={(e) => setValues({ ...values, fullName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-target">Data obiettivo</Label>
              <Input
                id="set-target"
                type="date"
                value={values.targetDate}
                onChange={(e) => setValues({ ...values, targetDate: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-min">Sessione minima (min)</Label>
              <Input
                id="set-min"
                type="number"
                min={5}
                max={120}
                value={values.minSessionMinutes}
                onChange={(e) => setValues({ ...values, minSessionMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-max">Sessione massima (min)</Label>
              <Input
                id="set-max"
                type="number"
                min={15}
                max={480}
                value={values.maxSessionMinutes}
                onChange={(e) => setValues({ ...values, maxSessionMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-parallel">Materie in parallelo</Label>
              <Input
                id="set-parallel"
                type="number"
                min={1}
                max={5}
                value={values.maxParallelExams}
                onChange={(e) => setValues({ ...values, maxParallelExams: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-buffer">
              Margine settimanale non pianificato: {Math.round(values.weeklyBufferRatio * 100)}%
            </Label>
            <Input
              id="set-buffer"
              type="range"
              min={0}
              max={40}
              step={5}
              value={Math.round(values.weeklyBufferRatio * 100)}
              onChange={(e) =>
                setValues({ ...values, weeklyBufferRatio: Number(e.target.value) / 100 })
              }
            />
            <p className="text-xs text-muted-foreground">
              Il motore non userà mai più del {100 - Math.round(values.weeklyBufferRatio * 100)}% del
              tempo disponibile.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="set-pref">Preferenza di studio</Label>
            <select
              id="set-pref"
              value={values.studyPreference}
              onChange={(e) =>
                setValues({ ...values, studyPreference: e.target.value as ProfileValues['studyPreference'] })
              }
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-64"
            >
              <option value="teoria">Soprattutto teoria</option>
              <option value="esercizi">Soprattutto esercizi</option>
              <option value="misto">Misto</option>
            </select>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Notifiche del browser</p>
                <p className="text-xs text-muted-foreground">
                  Promemoria per ripassi e sessioni, solo dopo il tuo consenso.
                </p>
              </div>
              <Switch
                checked={values.notificationsEnabled}
                onCheckedChange={(checked) => {
                  setValues({ ...values, notificationsEnabled: checked });
                  if (checked) void requestNotifications();
                }}
                aria-label="Attiva le notifiche"
              />
            </div>
            {notificationStatus ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Bell className="h-3.5 w-3.5" aria-hidden />
                {notificationStatus}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div>
                <p className="text-sm font-medium">Assistente AI</p>
                <p className="text-xs text-muted-foreground">
                  L’app funziona anche senza. I contenuti generati sono sempre marcati «Da verificare».
                </p>
              </div>
              <Switch
                checked={values.aiEnabled}
                onCheckedChange={(checked) => setValues({ ...values, aiEnabled: checked })}
                aria-label="Attiva l’assistente AI"
              />
            </div>
          </div>

          <Button
            loading={pending}
            onClick={() => {
              const formData = new FormData();
              formData.set('fullName', values.fullName);
              formData.set('targetDate', values.targetDate);
              formData.set('maxSessionMinutes', String(values.maxSessionMinutes));
              formData.set('minSessionMinutes', String(values.minSessionMinutes));
              formData.set('weeklyBufferRatio', String(values.weeklyBufferRatio));
              formData.set('maxParallelExams', String(values.maxParallelExams));
              formData.set('studyPreference', values.studyPreference);
              formData.set('notificationsEnabled', String(values.notificationsEnabled));
              formData.set('aiEnabled', String(values.aiEnabled));
              run(() => updateProfileAction(formData));
            }}
          >
            <Save className="h-4 w-4" aria-hidden />
            Salva profilo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Disponibilità settimanale</CardTitle>
          <CardDescription>
            Totale dichiarato: {formatMinutes(weeklyTotal)} · pianificabile{' '}
            {formatMinutes(Math.floor(weeklyTotal * (1 - values.weeklyBufferRatio)))}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {days.map((day, index) => (
              <li key={day.weekday} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm">{WEEKDAY_NAMES[index]}</span>
                <Input
                  type="number"
                  min={0}
                  max={960}
                  step={15}
                  value={day.availableMinutes}
                  aria-label={`Minuti disponibili di ${WEEKDAY_NAMES[index]}`}
                  className="h-9 w-24"
                  disabled={day.isRestDay}
                  onChange={(event) =>
                    setDays((current) =>
                      current.map((item) =>
                        item.weekday === day.weekday
                          ? { ...item, availableMinutes: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={day.isRestDay}
                    onChange={(event) =>
                      setDays((current) =>
                        current.map((item) =>
                          item.weekday === day.weekday
                            ? { ...item, isRestDay: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  Riposo
                </label>
              </li>
            ))}
          </ul>
          <Button
            loading={pending}
            onClick={() => {
              const formData = new FormData();
              for (const day of days) {
                formData.set(`minutes-${day.weekday}`, String(day.availableMinutes));
                formData.set(`rest-${day.weekday}`, String(day.isRestDay));
              }
              run(() => updateAvailabilityAction(formData));
            }}
          >
            <Save className="h-4 w-4" aria-hidden />
            Salva disponibilità
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Giornate non disponibili</CardTitle>
          <CardDescription>Ferie, impegni familiari, trasferte: il piano le salterà.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="unav-date">Data</Label>
              <Input
                id="unav-date"
                type="date"
                min={today}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unav-reason">Motivo</Label>
              <Input
                id="unav-reason"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                className="w-56"
              />
            </div>
            <Button
              variant="secondary"
              disabled={!newDate || pending}
              onClick={() => {
                const formData = new FormData();
                formData.set('date', newDate);
                formData.set('reason', newReason);
                run(() => addUnavailableDateAction(formData));
                setNewDate('');
                setNewReason('');
              }}
            >
              <CalendarOff className="h-4 w-4" aria-hidden />
              Aggiungi
            </Button>
          </div>

          {unavailable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna giornata registrata.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {unavailable.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <span>
                    {formatItalianDate(item.date)}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Rimuovi giornata"
                    disabled={pending}
                    onClick={() => run(() => deleteUnavailableDateAction(item.id))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Pesi del calcolo di preparazione</CardTitle>
          <CardDescription>
            I valori vengono normalizzati automaticamente. Le componenti non applicabili a un esame
            redistribuiscono il proprio peso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ['coverage', 'Programma completato'],
                ['activeRecall', 'Recupero attivo'],
                ['exercises', 'Esercizi'],
                ['mock', 'Simulazioni'],
                ['reviewRegularity', 'Regolarità dei ripassi'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`w-${key}`}>
                  {label}: {Math.round(weights[key] * 100)}%
                </Label>
                <Input
                  id={`w-${key}`}
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={Math.round(weights[key] * 100)}
                  onChange={(event) =>
                    setWeights({ ...weights, [key]: Number(event.target.value) / 100 })
                  }
                />
              </div>
            ))}
          </div>
          <Button
            loading={pending}
            onClick={() => {
              const formData = new FormData();
              for (const [key, value] of Object.entries(weights)) {
                formData.set(key, String(value));
              }
              run(() => updateReadinessWeightsAction(formData));
            }}
          >
            <Save className="h-4 w-4" aria-hidden />
            Salva pesi
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-muted-foreground">Esci dal tuo account su questo dispositivo.</p>
          <Button variant="outline" onClick={() => void signOutAction()}>
            <LogOut className="h-4 w-4" aria-hidden />
            Esci
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
