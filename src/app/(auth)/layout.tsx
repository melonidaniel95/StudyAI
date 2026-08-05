import Link from 'next/link';
import { GraduationCap } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="contenuto"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10"
    >
      <Link href="/" className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <GraduationCap className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-lg font-semibold">StudyOS</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Un sistema per studiare con metodo: piano giornaliero, recupero attivo e ripetizione
        dilazionata.
      </p>
    </main>
  );
}
