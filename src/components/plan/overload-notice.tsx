import { Info } from 'lucide-react';

interface OverloadNoticeProps {
  plannedMinutes: number;
  capacityMinutes: number;
  bufferRatio: number;
}

/**
 * Avviso discreto, mai colpevolizzante, quando la giornata è troppo carica.
 */
export function OverloadNotice({ plannedMinutes, capacityMinutes, bufferRatio }: OverloadNoticeProps) {
  if (capacityMinutes <= 0) return null;
  const plannable = Math.floor(capacityMinutes * (1 - bufferRatio));
  if (plannedMinutes <= plannable) return null;

  const extra = Math.round(plannedMinutes - plannable);

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p>
        Oggi il piano supera di {extra} minuti il tempo che ti eri dato. Puoi ridurre la durata di
        un’attività o spostarne una: non serve fare tutto.
      </p>
    </div>
  );
}
