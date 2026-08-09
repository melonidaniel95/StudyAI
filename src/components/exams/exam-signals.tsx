'use client';

import { CalendarCheck, CalendarX, Clock, FileCheck2, FileX2 } from 'lucide-react';
import {
  urgencyFromDaysRemaining,
  type UrgencyLevel,
} from '@/lib/domain/exam-signals';
import { cn } from '@/lib/utils';

/**
 * Segnali di stato di un esame.
 *
 * Il colore è un acceleratore, non l'unica informazione: ogni pastiglia ha
 * sempre anche un'icona e un'etichetta testuale, così resta comprensibile
 * a chi non distingue i colori e agli screen reader.
 */

const URGENCY_STYLE: Record<UrgencyLevel, string> = {
  imminente:
    'bg-[hsl(var(--risk-red))]/12 text-[hsl(var(--risk-red))] border-[hsl(var(--risk-red))]/30',
  vicino:
    'bg-[hsl(var(--risk-orange))]/12 text-[hsl(var(--risk-orange))] border-[hsl(var(--risk-orange))]/30',
  medio:
    'bg-[hsl(var(--risk-yellow))]/12 text-[hsl(var(--risk-yellow))] border-[hsl(var(--risk-yellow))]/30',
  lontano: 'bg-primary/10 text-primary border-primary/25',
  nessuna_data:
    'bg-[hsl(var(--risk-gray))]/12 text-[hsl(var(--risk-gray))] border-[hsl(var(--risk-gray))]/30',
};

/** Barra colorata a sinistra della scheda: urgenza percepita subito. */
export const URGENCY_BAR: Record<UrgencyLevel, string> = {
  imminente: 'bg-[hsl(var(--risk-red))]',
  vicino: 'bg-[hsl(var(--risk-orange))]',
  medio: 'bg-[hsl(var(--risk-yellow))]',
  lontano: 'bg-primary',
  nessuna_data: 'bg-[hsl(var(--risk-gray))]/50',
};

const OK_STYLE =
  'bg-[hsl(var(--risk-green))]/12 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/30';
const MISSING_STYLE =
  'bg-[hsl(var(--risk-gray))]/12 text-[hsl(var(--risk-gray))] border-[hsl(var(--risk-gray))]/30 border-dashed';

function Chip({
  className,
  icon: Icon,
  children,
  title,
}: {
  className: string;
  icon: typeof Clock;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

export function ExamSignalChips({
  hasMaterial,
  hasBookedSession,
  daysRemaining,
  compact = false,
}: {
  hasMaterial: boolean;
  hasBookedSession: boolean;
  daysRemaining: number | null;
  /** Nelle tabelle mostra solo le etichette brevi. */
  compact?: boolean;
}) {
  const urgency = urgencyFromDaysRemaining(daysRemaining);

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Chip
        className={hasMaterial ? OK_STYLE : MISSING_STYLE}
        icon={hasMaterial ? FileCheck2 : FileX2}
        title={
          hasMaterial
            ? 'Materiale caricato: l’esame entra nel piano.'
            : 'Materiale mancante: senza slide l’esame non viene pianificato.'
        }
      >
        {hasMaterial ? 'Materiale' : compact ? 'No materiale' : 'Materiale mancante'}
      </Chip>

      <Chip
        className={hasBookedSession ? OK_STYLE : MISSING_STYLE}
        icon={hasBookedSession ? CalendarCheck : CalendarX}
        title={
          hasBookedSession
            ? 'Appello scelto: la scadenza guida le priorità del piano.'
            : 'Nessun appello scelto: manca una scadenza reale.'
        }
      >
        {hasBookedSession ? 'Appello scelto' : compact ? 'No appello' : 'Appello da scegliere'}
      </Chip>

      <Chip className={URGENCY_STYLE[urgency.level]} icon={Clock} title={urgency.description}>
        {daysRemaining === null
          ? '—'
          : daysRemaining < 0
            ? 'Passato'
            : daysRemaining === 0
              ? 'Oggi'
              : `${daysRemaining} gg`}
      </Chip>
    </span>
  );
}

/** Legenda dei colori, mostrata una volta in cima all'elenco. */
export function ExamSignalsLegend() {
  return (
    <details className="rounded-md border bg-card px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-muted-foreground">
        Come leggere i colori
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          <strong className="text-foreground">Materiale</strong> e{' '}
          <strong className="text-foreground">appello</strong>: verde se ci sono, grigio tratteggiato
          se mancano. Sono i due requisiti perché un esame entri nel piano.
        </p>
        <p>
          <strong className="text-foreground">Giorni all’appello</strong>, con la barra colorata a
          sinistra della scheda:
        </p>
        <ul className="ml-1 space-y-1">
          {(
            [
              ['imminente', 'meno di 7 giorni'],
              ['vicino', 'da 7 a 21 giorni'],
              ['medio', 'da 22 a 45 giorni'],
              ['lontano', 'oltre 45 giorni'],
              ['nessuna_data', 'nessun appello scelto'],
            ] as Array<[UrgencyLevel, string]>
          ).map(([level, testo]) => (
            <li key={level} className="flex items-center gap-2">
              <span className={cn('h-3 w-3 shrink-0 rounded-sm', URGENCY_BAR[level])} aria-hidden />
              {testo}
            </li>
          ))}
        </ul>
        <p>
          I colori non sono mai l’unica informazione: accanto trovi sempre un’icona e un’etichetta.
        </p>
      </div>
    </details>
  );
}
