import {
  BarChart3,
  BookMarked,
  BookOpen,
  Bot,
  CalendarDays,
  ClipboardList,
  FileQuestion,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Library,
  NotebookPen,
  RefreshCw,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
}

/** Navigazione principale (sidebar desktop). */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Panoramica generale' },
  { href: '/oggi', label: 'Oggi', icon: Sun, description: 'Il piano di oggi' },
  { href: '/esami', label: 'Esami', icon: GraduationCap, description: 'Esami, appelli e programmi' },
  { href: '/piano', label: 'Piano', icon: ClipboardList, description: 'Pianificazione e carico' },
  { href: '/calendario', label: 'Calendario', icon: CalendarDays, description: 'Giorno, settimana, mese' },
  { href: '/ripassi', label: 'Ripassi', icon: RefreshCw, description: 'Ripetizione dilazionata' },
  { href: '/domande', label: 'Domande e flashcard', icon: FileQuestion, description: 'Recupero attivo' },
  { href: '/esercizi', label: 'Esercizi', icon: NotebookPen, description: 'Applicazione pratica' },
  { href: '/simulazioni', label: 'Simulazioni', icon: FlaskConical, description: 'Prove d’esame' },
  { href: '/errori', label: 'Quaderno degli errori', icon: BookMarked, description: 'Errori e correzioni' },
  { href: '/risorse', label: 'Risorse', icon: Library, description: 'Materiali di studio' },
  { href: '/statistiche', label: 'Statistiche', icon: BarChart3, description: 'Andamento reale' },
  { href: '/assistente', label: 'Assistente AI', icon: Bot, description: 'Spiegazioni e interrogazioni' },
  { href: '/impostazioni', label: 'Impostazioni', icon: Settings, description: 'Profilo e disponibilità' },
];

/** Voci sempre visibili nella barra inferiore su mobile. */
export const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: '/oggi', label: 'Oggi', icon: Sun },
  { href: '/esami', label: 'Esami', icon: GraduationCap },
  { href: '/calendario', label: 'Calendario', icon: CalendarDays },
  { href: '/ripassi', label: 'Ripassi', icon: RefreshCw },
];

/** Voci raggruppate sotto "Altro" su mobile. */
export const MOBILE_MORE_ITEMS: NavItem[] = NAV_ITEMS.filter(
  (item) => !MOBILE_NAV_ITEMS.some((m) => m.href === item.href),
);

export const BOOK_ICON = BookOpen;
