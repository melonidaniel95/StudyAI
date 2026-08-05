import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Configurazione necessaria' };

/** Mostrata quando mancano le variabili d'ambiente di Supabase. */
export default function ConfigurationPage() {
  return (
    <main id="contenuto" className="mx-auto flex min-h-dvh max-w-2xl items-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Manca la configurazione di Supabase</CardTitle>
          <CardDescription>
            StudyOS ha bisogno di un progetto Supabase per database, autenticazione e archiviazione
            dei materiali.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Crea un progetto su <span className="font-medium">supabase.com</span>.
            </li>
            <li>
              Copia il file <code className="rounded bg-muted px-1">.env.example</code> in{' '}
              <code className="rounded bg-muted px-1">.env.local</code>.
            </li>
            <li>
              Inserisci <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
              <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> che trovi in
              Project Settings → API.
            </li>
            <li>
              Esegui le migrazioni della cartella{' '}
              <code className="rounded bg-muted px-1">supabase/migrations</code> nell’SQL Editor, in
              ordine numerico.
            </li>
            <li>Riavvia il server di sviluppo.</li>
          </ol>
          <p className="text-muted-foreground">
            Le istruzioni complete sono nel file <code className="rounded bg-muted px-1">README.md</code>.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
