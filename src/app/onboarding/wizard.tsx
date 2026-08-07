'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarClock, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { completeOnboardingAction } from '@/server/actions/onboarding';
import { formatMinutes } from '@/lib/domain/dates';

const WEEKDAYS = [
  { value: 1, label: 'Lunedì' },
  { value: 2, label: 'Martedì' },
  { value: 3, label: 'Mercoledì' },
  { value: 4, label: 'Giovedì' },
  { value: 5, label: 'Venerdì' },
  { value: 6, label: 'Sabato' },
  { value: 7, label: 'Domenica' },
];

const PRECREATED_EXAMS = [
  'Amministrazione di Sistemi IT e Cloud',
  'Applicazioni Industriali Elettriche',
  'Architettura dei Calcolatori Elettronici',
  'Elementi di Elettronica',
  'Fondamenti di Controlli Automatici',
  'Idoneità di Lingua Inglese B2',
  'Ingegneria del Software',
  'Matematica Applicata',
  'Metodi Probabilistici per l’Ingegneria',
  'Modelli e Algoritmi per il Supporto alle Decisioni',
  'Programmazione di Sistemi Mobili',
  'Reti di Telecomunicazione',
  'Sistemi Operativi',
  'Tecnologie Internet',
];

const TOTAL_STEPS = 4;

export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(defaultName);
  const [targetDate, setTargetDate] = useState('2027-09-30');
  const [weekdayMinutes, setWeekdayMinutes] = useState(120);
  const [weekendMinutes, setWeekendMinutes] = useState(240);
  const [restDays, setRestDays] = useState<number[]>([]);
  const [maxSessionMinutes, setMaxSessionMinutes] = useState(120);
  const [studyPreference, setStudyPreference] = useState<'teoria' | 'esercizi' | 'misto'>('misto');

  const weeklyMinutes =
    WEEKDAYS.reduce((sum, day) => {
      if (restDays.includes(day.value)) return sum;
      return sum + (day.value >= 6 ? weekendMinutes : weekdayMinutes);
    }, 0);

  function toggleRestDay(value: number) {
    setRestDays((current) =>
      current.includes(value) ? current.filter((day) => day !== value) : [...current, value],
    );
  }

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set('fullName', fullName);
    formData.set('targetDate', targetDate);
    formData.set('weekdayMinutes', String(weekdayMinutes));
    formData.set('weekendMinutes', String(weekendMinutes));
    formData.set('maxSessionMinutes', String(maxSessionMinutes));
    formData.set('studyPreference', studyPreference);
    for (const day of restDays) formData.append('restDays', String(day));

    startTransition(async () => {
      const result = await completeOnboardingAction(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(result.message);
      router.push('/oggi');
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Logo size={38} />
          <div>
            <h1 className="text-xl font-semibold">Configuriamo StudyAI</h1>
            <p className="text-sm text-muted-foreground">
              Passo {step} di {TOTAL_STEPS} — meno di due minuti.
            </p>
          </div>
        </div>
        <Progress value={(step / TOTAL_STEPS) * 100} aria-label={`Passo ${step} di ${TOTAL_STEPS}`} />
      </div>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Obiettivo</CardTitle>
            <CardDescription>Entro quando vuoi aver superato tutti gli esami?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Come ti chiami (facoltativo)</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetDate">Data obiettivo complessiva</Label>
              <Input
                id="targetDate"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Preimpostata al 30 settembre 2027. Puoi cambiarla quando vuoi.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quanto tempo hai davvero</CardTitle>
            <CardDescription>
              Indica il tempo realistico, non quello ideale. StudyAI ne lascia comunque il 15% libero
              come margine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="weekdayMinutes">Minuti nei giorni feriali</Label>
                <Input
                  id="weekdayMinutes"
                  type="number"
                  min={0}
                  max={960}
                  step={15}
                  value={weekdayMinutes}
                  onChange={(e) => setWeekdayMinutes(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="weekendMinutes">Minuti nel weekend e nei festivi</Label>
                <Input
                  id="weekendMinutes"
                  type="number"
                  min={0}
                  max={960}
                  step={15}
                  value={weekendMinutes}
                  onChange={(e) => setWeekendMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Giorni di riposo</legend>
              <p className="text-xs text-muted-foreground">
                In questi giorni non verrà pianificato nulla.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {WEEKDAYS.map((day) => (
                  <label
                    key={day.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
                  >
                    <Checkbox
                      checked={restDays.includes(day.value)}
                      onCheckedChange={() => toggleRestDay(day.value)}
                      aria-label={day.label}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <CalendarClock className="h-4 w-4" aria-hidden />
                {formatMinutes(weeklyMinutes)} a settimana
              </p>
              <p className="mt-1 text-muted-foreground">
                Di cui pianificabili circa {formatMinutes(Math.floor(weeklyMinutes * 0.85))}: il resto
                resta libero per imprevisti e recuperi.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Come preferisci studiare</CardTitle>
            <CardDescription>Puoi cambiare tutto in seguito dalle impostazioni.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="maxSessionMinutes">Durata massima di una sessione (minuti)</Label>
              <Input
                id="maxSessionMinutes"
                type="number"
                min={15}
                max={480}
                step={15}
                value={maxSessionMinutes}
                onChange={(e) => setMaxSessionMinutes(Number(e.target.value))}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Preferenza di studio</legend>
              <RadioGroup
                value={studyPreference}
                onValueChange={(value) => setStudyPreference(value as typeof studyPreference)}
              >
                {[
                  { value: 'teoria', label: 'Soprattutto teoria' },
                  { value: 'esercizi', label: 'Soprattutto esercizi' },
                  { value: 'misto', label: 'Misto (consigliato)' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm"
                  >
                    <RadioGroupItem value={option.value} id={`pref-${option.value}`} />
                    {option.label}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Cosa creiamo subito</CardTitle>
            <CardDescription>
              Puoi modificare, aggiungere o eliminare tutto in qualsiasi momento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="mb-2 font-medium">14 esami con i relativi appelli 2026</p>
              <ul className="grid gap-1 text-muted-foreground sm:grid-cols-2">
                {PRECREATED_EXAMS.map((exam) => (
                  <li key={exam} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">{exam}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border border-accent/40 bg-accent/10 p-3">
              <p className="flex items-center gap-2 font-medium">
                <Sparkles className="h-4 w-4 text-accent" aria-hidden />
                Priorità immediate
              </p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                <li>Elementi di Elettronica — appello principale 27/08/2026</li>
                <li>Metodi Probabilistici — appello principale 15/09/2026</li>
              </ul>
            </div>

            <ul className="space-y-1 text-muted-foreground">
              <li>• 8 relazioni di prerequisito tra gli esami</li>
              <li>• Programmi dimostrativi di Elettronica e Metodi, marcati come bozza da verificare</li>
              <li>• Ingegneria del Software senza appelli: le date non sono ancora disponibili</li>
              <li>• Il primo piano di studio, generato sul tuo tempo reale</li>
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => setStep((current) => Math.max(1, current - 1))}
          disabled={step === 1 || pending}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Indietro
        </Button>
        {step < TOTAL_STEPS ? (
          <Button onClick={() => setStep((current) => Math.min(TOTAL_STEPS, current + 1))}>
            Avanti
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button onClick={submit} loading={pending}>
            Crea tutto e genera il piano
          </Button>
        )}
      </div>
    </div>
  );
}
