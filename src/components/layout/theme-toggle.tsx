'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Interruttore chiaro/scuro.
 *
 * Il tema effettivo è noto solo nel browser: sul server `resolvedTheme` è
 * `undefined`. Per non generare una differenza tra HTML del server e primo
 * render del client (errore di idratazione), finché il componente non è
 * montato si mostra una versione neutra — stessa icona e stessa etichetta in
 * entrambi gli ambienti. Subito dopo il montaggio compare lo stato reale.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  const label = !mounted
    ? 'Cambia tema'
    : isDark
      ? 'Passa alla modalità chiara'
      : 'Passa alla modalità scura';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <Moon className="h-5 w-5" aria-hidden />
      ) : (
        <Sun className="h-5 w-5" aria-hidden />
      )}
    </Button>
  );
}
