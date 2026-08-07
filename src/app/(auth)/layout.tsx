import Link from 'next/link';
import { Logo } from '@/components/layout/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="contenuto"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10"
    >
      <Link href="/" className="flex items-center gap-2">
        <Logo size={44} />
        <span className="text-lg font-semibold">StudyAI</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Un sistema per studiare con metodo: piano giornaliero, recupero attivo e ripetizione
        dilazionata.
      </p>
    </main>
  );
}
