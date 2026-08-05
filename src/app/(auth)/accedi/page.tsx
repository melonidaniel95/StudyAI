import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Accedi' };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ successivo?: string }>;
}) {
  const params = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accedi</CardTitle>
        <CardDescription>Riprendi da dove avevi lasciato.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignInForm next={params.successivo ?? '/oggi'} />
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <Link href="/recupero-password" className="text-primary underline-offset-4 hover:underline">
              Password dimenticata?
            </Link>
          </p>
          <p>
            Non hai un account?{' '}
            <Link href="/registrati" className="text-primary underline-offset-4 hover:underline">
              Registrati
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
