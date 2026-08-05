/**
 * Valutazione di fattibilità di un appello.
 *
 * Non si guarda solo al tempo trascorso: contano il tempo residuo, il ritmo
 * reale delle ultime due settimane, la preparazione misurata e le simulazioni.
 * Il messaggio finale non è mai colpevolizzante.
 */
import { daysBetween } from './dates';
import { clamp01 } from './readiness';
import type { FeasibilityInput, FeasibilityResult, RiskLevel } from './types';

const LABELS: Record<RiskLevel, string> = {
  verde: 'Obiettivo raggiungibile',
  giallo: 'Serve aumentare leggermente il ritmo',
  arancione: 'Servono modifiche al piano',
  rosso: 'Piano a rischio',
  grigio: 'Dati insufficienti per una stima',
};

const MESSAGES: Record<RiskLevel, string> = {
  verde: 'Con il ritmo attuale arrivi pronto all’appello. Mantieni ripassi e simulazioni.',
  giallo: 'L’obiettivo resta possibile con un piccolo aumento del ritmo o qualche sessione in più.',
  arancione:
    'Con il tempo disponibile serve una modifica: ridurre gli argomenti secondari, aumentare le ore o valutare l’appello di riserva.',
  rosso:
    'Il tempo disponibile non copre il lavoro stimato. Valuta l’appello di riserva: la decisione resta tua.',
  grigio:
    'Servono ancora alcune sessioni registrate per stimare la fattibilità in modo affidabile.',
};

/** Numero minimo di dati raccolti sotto il quale la stima resta "grigia". */
export const MIN_DATA_POINTS = 5;

export function evaluateFeasibility(input: FeasibilityInput): FeasibilityResult {
  const daysRemaining = input.examDate ? daysBetween(input.today, input.examDate) : null;
  const available = Math.max(0, input.availableMinutesBeforeExam);
  const required = Math.max(0, input.requiredMinutes);
  const loadRatio = available > 0 ? required / available : required > 0 ? Infinity : 0;

  const reasons: string[] = [];

  if (daysRemaining === null) {
    return {
      risk: 'grigio',
      label: LABELS.grigio,
      message: 'Nessun appello selezionato: scegli una data per ottenere una valutazione.',
      daysRemaining: null,
      requiredMinutes: required,
      availableMinutes: available,
      loadRatio: null,
      reasons: ['Nessun appello principale impostato per questo esame.'],
      suggestBackup: false,
    };
  }

  reasons.push(
    `Mancano ${daysRemaining} giorni; ore disponibili stimate ${(available / 60).toFixed(1)}, ore necessarie ${(required / 60).toFixed(1)}.`,
  );

  if (input.dataPoints < MIN_DATA_POINTS) {
    return {
      risk: 'grigio',
      label: LABELS.grigio,
      message: MESSAGES.grigio,
      daysRemaining,
      requiredMinutes: required,
      availableMinutes: available,
      loadRatio: Number.isFinite(loadRatio) ? Number(loadRatio.toFixed(2)) : null,
      reasons: [...reasons, 'Poche sessioni registrate: la stima diventerà affidabile a breve.'],
      suggestBackup: false,
    };
  }

  // Contributi al rischio (0 = tutto bene, 1 = critico)
  const loadRisk = Number.isFinite(loadRatio) ? clamp01((loadRatio - 0.6) / 0.7) : 1;
  const readinessExpected = daysRemaining <= 0 ? 1 : clamp01(1 - daysRemaining / 90);
  const readinessRisk = clamp01(readinessExpected - input.readiness + 0.15);
  const coverageRisk =
    daysRemaining <= 14 ? clamp01((0.9 - input.coverage) * 1.5) : clamp01((0.5 - input.coverage) * 1.2);
  const mockRisk =
    daysRemaining <= 14 && input.doneMocks === 0
      ? 0.7
      : input.plannedMocks === 0 && daysRemaining <= 21
        ? 0.4
        : 0;
  const reviewRisk = clamp01(input.missingReviews / 10);
  const paceNeeded = daysRemaining > 0 ? required / daysRemaining : required;
  const paceRisk =
    input.recentPaceMinutesPerDay <= 0
      ? 0.5
      : clamp01((paceNeeded / Math.max(1, input.recentPaceMinutesPerDay) - 1) / 1.5);

  const riskScore = clamp01(
    loadRisk * 0.34 +
      readinessRisk * 0.22 +
      coverageRisk * 0.14 +
      paceRisk * 0.16 +
      mockRisk * 0.09 +
      reviewRisk * 0.05,
  );

  if (Number.isFinite(loadRatio)) {
    reasons.push(
      loadRatio <= 0.85
        ? `Il carico occupa circa il ${Math.round(loadRatio * 100)}% del tempo disponibile: c’è margine.`
        : `Il carico occupa circa il ${Math.round(loadRatio * 100)}% del tempo disponibile.`,
    );
  } else {
    reasons.push('Non risulta tempo disponibile prima dell’appello.');
  }

  if (input.recentPaceMinutesPerDay > 0) {
    reasons.push(
      `Ritmo reale delle ultime due settimane: ${Math.round(input.recentPaceMinutesPerDay)} minuti al giorno; ne servirebbero ${Math.round(paceNeeded)}.`,
    );
  }

  if (daysRemaining <= 14 && input.doneMocks === 0) {
    reasons.push('Nessuna simulazione ancora svolta a meno di due settimane dall’appello.');
  }

  if (input.missingReviews > 0) {
    reasons.push(`${input.missingReviews} ripassi in attesa.`);
  }

  let risk: RiskLevel;
  if (riskScore < 0.25) risk = 'verde';
  else if (riskScore < 0.45) risk = 'giallo';
  else if (riskScore < 0.65) risk = 'arancione';
  else risk = 'rosso';

  return {
    risk,
    label: LABELS[risk],
    message: MESSAGES[risk],
    daysRemaining,
    requiredMinutes: required,
    availableMinutes: available,
    loadRatio: Number.isFinite(loadRatio) ? Number(loadRatio.toFixed(2)) : null,
    reasons,
    suggestBackup: (risk === 'rosso' || risk === 'arancione') && input.backupExamDate !== null,
  };
}

export const FEASIBILITY_LABELS = LABELS;
