import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Registrati' };

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crea il tuo account</CardTitle>
        <CardDescription>Bastano pochi minuti per impostare il primo piano.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignUpForm />
        <p className="text-sm text-muted-foreground">
          Hai già un account?{' '}
          <Link href="/accedi" className="text-primary underline-offset-4 hover:underline">
            Accedi
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
