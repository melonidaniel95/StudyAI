import { AlertTriangle, CheckCircle2, CircleHelp, Info, TriangleAlert } from 'lucide-react';
import type { RiskLevel } from '@/lib/domain/types';
import { cn } from '@/lib/utils';

const CONFIG: Record<RiskLevel, { label: string; className: string; Icon: typeof Info }> = {
  verde: {
    label: 'Obiettivo raggiungibile',
    className: 'bg-[hsl(var(--risk-green))]/12 text-[hsl(var(--risk-green))] border-[hsl(var(--risk-green))]/30',
    Icon: CheckCircle2,
  },
  giallo: {
    label: 'Serve aumentare leggermente il ritmo',
    className: 'bg-[hsl(var(--risk-yellow))]/12 text-[hsl(var(--risk-yellow))] border-[hsl(var(--risk-yellow))]/30',
    Icon: Info,
  },
  arancione: {
    label: 'Servono modifiche',
    className: 'bg-[hsl(var(--risk-orange))]/12 text-[hsl(var(--risk-orange))] border-[hsl(var(--risk-orange))]/30',
    Icon: TriangleAlert,
  },
  rosso: {
    label: 'Piano a rischio',
    className: 'bg-[hsl(var(--risk-red))]/12 text-[hsl(var(--risk-red))] border-[hsl(var(--risk-red))]/30',
    Icon: AlertTriangle,
  },
  grigio: {
    label: 'Dati insufficienti per una stima',
    className: 'bg-[hsl(var(--risk-gray))]/12 text-[hsl(var(--risk-gray))] border-[hsl(var(--risk-gray))]/30',
    Icon: CircleHelp,
  },
};

/**
 * Il colore non è mai l'unico indicatore: c'è sempre un'icona e un'etichetta
 * testuale, per accessibilità e per chi non distingue i colori.
 */
export function RiskBadge({
  risk,
  label,
  className,
  compact = false,
}: {
  risk: RiskLevel;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const config = CONFIG[risk];
  const Icon = config.Icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        config.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{compact ? risk.charAt(0).toUpperCase() + risk.slice(1) : (label ?? config.label)}</span>
    </span>
  );
}

export const RISK_CONFIG = CONFIG;
