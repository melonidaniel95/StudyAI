import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'StudyAI — il tuo sistema di studio',
    template: '%s · StudyAI',
  },
  description:
    'StudyAI organizza esami, appelli, programmi, ripassi ed esercizi e ti dice ogni giorno che cosa studiare e come verificare di averlo imparato.',
  manifest: '/manifest.webmanifest',
  applicationName: 'StudyAI',
  appleWebApp: { capable: true, title: 'StudyAI', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F4EE' },
    { media: '(prefers-color-scheme: dark)', color: '#1B1F24' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      {/*
        suppressHydrationWarning sul body: le estensioni del browser (ColorZilla,
        gestori di password, traduttori) aggiungono attributi al body prima che
        React si carichi. Non è codice nostro e non possiamo evitarlo, quindi si
        dice a React di ignorare le differenze su questo singolo elemento.
        Il contenuto interno resta comunque controllato normalmente.
      */}
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={200}>
            <a
              href="#contenuto"
              className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            >
              Vai al contenuto principale
            </a>
            {children}
            <Toaster position="top-center" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
