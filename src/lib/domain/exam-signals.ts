/**
 * Segnali visivi di uno studio: a colpo d'occhio, che cosa manca.
 *
 * Tre informazioni indipendenti, che rispondono a tre domande diverse:
 *  1. ho caricato il materiale?      → senza, l'esame non entra nel piano
 *  2. ho scelto l'appello?           → senza, non c'è una scadenza reale
 *  3. quanto manca all'esame?        → quanto è urgente
 *
 * Funzioni pure: la UI decide come disegnarle, qui si stabilisce solo il livello.
 */

export type UrgencyLevel = 'imminente' | 'vicino' | 'medio' | 'lontano' | 'nessuna_data';

export interface UrgencyInfo {
  level: UrgencyLevel;
  label: string;
  /** Descrizione estesa, usata nei tooltip e per gli screen reader. */
  description: string;
}

const URGENCY: Record<UrgencyLevel, { label: string; description: string }> = {
  imminente: { label: 'Meno di una settimana', description: 'L’appello è a meno di 7 giorni.' },
  vicino: { label: 'Entro tre settimane', description: 'L’appello è fra 7 e 21 giorni.' },
  medio: { label: 'Entro un mese e mezzo', description: 'L’appello è fra 22 e 45 giorni.' },
  lontano: { label: 'Oltre un mese e mezzo', description: 'L’appello è a più di 45 giorni.' },
  nessuna_data: {
    label: 'Nessun appello scelto',
    description: 'Non hai ancora selezionato un appello principale: manca una scadenza reale.',
  },
};

/** Livello di urgenza a partire dai giorni mancanti all'appello. */
export function urgencyFromDaysRemaining(daysRemaining: number | null): UrgencyInfo {
  if (daysRemaining === null) return { level: 'nessuna_data', ...URGENCY.nessuna_data };
  if (daysRemaining < 7) return { level: 'imminente', ...URGENCY.imminente };
  if (daysRemaining <= 21) return { level: 'vicino', ...URGENCY.vicino };
  if (daysRemaining <= 45) return { level: 'medio', ...URGENCY.medio };
  return { level: 'lontano', ...URGENCY.lontano };
}

export interface ExamSignals {
  hasMaterial: boolean;
  hasBookedSession: boolean;
  urgency: UrgencyInfo;
}

/**
 * Cosa manca perché l'esame sia pianificabile, in ordine di importanza.
 * Elenco vuoto = tutto a posto.
 */
export function missingSteps(signals: ExamSignals): string[] {
  const missing: string[] = [];
  if (!signals.hasMaterial) missing.push('Carica il materiale');
  if (!signals.hasBookedSession) missing.push('Scegli l’appello');
  return missing;
}
