import type { Metadata } from 'next';
import Link from 'next/link';
import { CloudOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Senza connessione' };

export default function OfflinePage() {
  return (
    <main id="contenuto" className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CloudOff className="h-5 w-5" aria-hidden />
            Sei senza connessione
          </CardTitle>
          <CardDescription>
            Le pagine già visitate restano disponibili. Le sessioni che registri ora vengono salvate
            sul dispositivo e sincronizzate appena torna la rete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/oggi">Riprova</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
