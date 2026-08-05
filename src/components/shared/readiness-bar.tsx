'use client';

import { Info } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ScoreComponent } from '@/lib/domain/types';
import { percent } from '@/lib/utils';

interface ReadinessBarProps {
  value: number; // 0..1
  components?: ScoreComponent[];
  confidence?: number;
  label?: string;
}

/**
 * Una percentuale non compare mai da sola: il tooltip spiega come è composta.
 */
export function ReadinessBar({ value, components, confidence, label = 'Preparazione' }: ReadinessBarProps) {
  const pct = percent(value);
  const description = components
    ?.filter((c) => c.applicable)
    .map((c) => `${c.label}: ${percent(c.value)}% (peso ${percent(c.weight)}%)`)
    .join(' · ');

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          {label}
          {components?.length ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="Come è calcolata la preparazione"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="mb-1 font-medium">Come è calcolata</p>
                <ul className="space-y-1">
                  {components
                    .filter((c) => c.applicable)
                    .map((c) => (
                      <li key={c.key}>
                        <span className="font-medium">{c.label}</span>: {percent(c.value)}% · peso{' '}
                        {percent(c.weight)}%
                      </li>
                    ))}
                </ul>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </span>
        <span className="tabular-nums font-semibold">{pct}%</span>
      </div>
      <Progress
        value={pct}
        aria-label={`${label}: ${pct}%`}
        aria-describedby={description ? undefined : undefined}
      />
      {typeof confidence === 'number' && confidence < 0.25 ? (
        <p className="text-xs text-muted-foreground">
          Stima poco affidabile: servono più sessioni, domande o esercizi registrati.
        </p>
      ) : null}
      {description ? <p className="sr-only">{description}</p> : null}
    </div>
  );
}
