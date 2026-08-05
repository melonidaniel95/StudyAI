'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Client Supabase per i componenti eseguiti nel browser.
 * Usa esclusivamente le variabili pubbliche: nessun segreto nel bundle.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Configurazione mancante: imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY nel file .env.local',
    );
  }

  return createBrowserClient(url, key);
}
