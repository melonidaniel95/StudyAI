'use client';

/**
 * Icone delle materie.
 *
 * Elenco curato di icone Lucide: nel database si salva solo il nome, così i
 * dati restano indipendenti dalla libreria grafica. Se un nome non è
 * riconosciuto si ricade su `book-open`, senza rompere nulla.
 */
import {
  Atom,
  BookOpen,
  Braces,
  Calculator,
  ChartNoAxesCombined,
  CircuitBoard,
  Cloud,
  Cpu,
  Database,
  Dices,
  FlaskConical,
  Gauge,
  GitBranch,
  Globe,
  Languages,
  Lightbulb,
  Microscope,
  Network,
  Orbit,
  RadioTower,
  Ruler,
  Server,
  Shapes,
  Shield,
  Sigma,
  SlidersHorizontal,
  Smartphone,
  Terminal,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export interface ExamIconOption {
  /** Nome salvato nel database. */
  value: string;
  /** Etichetta leggibile, mostrata nel selettore. */
  label: string;
  icon: LucideIcon;
}

/** Icone disponibili, raggruppate per ambito. */
export const EXAM_ICONS: ExamIconOption[] = [
  { value: 'book-open', label: 'Generico', icon: BookOpen },
  { value: 'cpu', label: 'Elettronica', icon: Cpu },
  { value: 'circuit-board', label: 'Circuiti', icon: CircuitBoard },
  { value: 'microchip', label: 'Architettura', icon: Cpu },
  { value: 'zap', label: 'Elettrotecnica', icon: Zap },
  { value: 'waves', label: 'Segnali', icon: Waves },
  { value: 'sliders-horizontal', label: 'Controlli', icon: SlidersHorizontal },
  { value: 'gauge', label: 'Misure', icon: Gauge },
  { value: 'sigma', label: 'Matematica', icon: Sigma },
  { value: 'calculator', label: 'Calcolo', icon: Calculator },
  { value: 'dices', label: 'Probabilità', icon: Dices },
  { value: 'chart', label: 'Statistica', icon: ChartNoAxesCombined },
  { value: 'shapes', label: 'Geometria', icon: Shapes },
  { value: 'ruler', label: 'Meccanica', icon: Ruler },
  { value: 'atom', label: 'Fisica', icon: Atom },
  { value: 'orbit', label: 'Sistemi complessi', icon: Orbit },
  { value: 'flask', label: 'Chimica', icon: FlaskConical },
  { value: 'microscope', label: 'Laboratorio', icon: Microscope },
  { value: 'terminal', label: 'Sistemi operativi', icon: Terminal },
  { value: 'braces', label: 'Programmazione', icon: Braces },
  { value: 'git-branch', label: 'Ingegneria del software', icon: GitBranch },
  { value: 'database', label: 'Basi di dati', icon: Database },
  { value: 'server', label: 'Server e cloud', icon: Server },
  { value: 'cloud', label: 'Cloud', icon: Cloud },
  { value: 'network', label: 'Reti e algoritmi', icon: Network },
  { value: 'radio-tower', label: 'Telecomunicazioni', icon: RadioTower },
  { value: 'globe', label: 'Internet e web', icon: Globe },
  { value: 'smartphone', label: 'Mobile', icon: Smartphone },
  { value: 'shield', label: 'Sicurezza', icon: Shield },
  { value: 'languages', label: 'Lingue', icon: Languages },
  { value: 'wrench', label: 'Tecnica applicata', icon: Wrench },
  { value: 'lightbulb', label: 'Progetto', icon: Lightbulb },
];

const BY_VALUE = new Map(EXAM_ICONS.map((option) => [option.value, option]));

/** Icona corrispondente al nome salvato; ripiego su quella generica. */
export function getExamIcon(value: string | null | undefined): LucideIcon {
  return BY_VALUE.get(value ?? '')?.icon ?? BookOpen;
}

export function getExamIconLabel(value: string | null | undefined): string {
  return BY_VALUE.get(value ?? '')?.label ?? 'Generico';
}

/**
 * Icona suggerita dal nome della materia.
 * Le parole sono ordinate dalla più specifica alla più generica.
 */
const KEYWORDS: Array<[RegExp, string]> = [
  [/elettronic/i, 'cpu'],
  [/elettric|elettrotecnic|industriali/i, 'zap'],
  [/architettur.*calcolator|calcolator/i, 'microchip'],
  [/controll.*automatic|automatic/i, 'sliders-horizontal'],
  [/misur|strument/i, 'gauge'],
  [/probabilis|probabilit|aleator/i, 'dices'],
  [/statistic/i, 'chart'],
  [/matematic|analisi|algebra/i, 'sigma'],
  [/geometr/i, 'shapes'],
  [/fisic/i, 'atom'],
  [/chimic/i, 'flask'],
  [/meccanic|costruzion/i, 'ruler'],
  [/segnal|onde|campi/i, 'waves'],
  [/sistemi operativ/i, 'terminal'],
  [/software|programmazione.*oggett|ingegneria del software/i, 'git-branch'],
  [/mobil|android|ios/i, 'smartphone'],
  [/programmazione|linguagg|informatic/i, 'braces'],
  [/base.*dati|database|dbms/i, 'database'],
  [/cloud/i, 'cloud'],
  [/amministrazione.*sistem|sistemi it|server/i, 'server'],
  [/telecomunicazion|trasmission/i, 'radio-tower'],
  [/internet|web|tecnologie internet/i, 'globe'],
  [/sicurezz|crittograf/i, 'shield'],
  [/rete|reti|algoritm|ricerca operativa|decision/i, 'network'],
  [/inglese|lingua|francese|tedesc|spagnol/i, 'languages'],
  [/tirocinio|laboratori/i, 'microscope'],
  [/tesi|progetto/i, 'lightbulb'],
];

export function suggestExamIcon(examName: string): string {
  for (const [pattern, icon] of KEYWORDS) {
    if (pattern.test(examName)) return icon;
  }
  return 'book-open';
}

/** Icona della materia, con il colore dell'esame. */
export function ExamIcon({
  icon,
  color,
  size = 16,
  className,
}: {
  icon: string | null | undefined;
  color?: string;
  size?: number;
  className?: string;
}) {
  const Icon = getExamIcon(icon);
  return (
    <Icon
      width={size}
      height={size}
      style={color ? { color } : undefined}
      className={className}
      aria-hidden
    />
  );
}
