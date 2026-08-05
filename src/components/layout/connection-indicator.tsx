'use client';

import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';

/** Indicatore discreto di assenza di connessione. */
export function ConnectionIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;

  return (
    <span
      className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
      role="status"
    >
      <CloudOff className="h-3.5 w-3.5" aria-hidden />
      Offline
    </span>
  );
}
