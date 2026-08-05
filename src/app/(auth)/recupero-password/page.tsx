import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'Recupero password' };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recupera la password</CardTitle>
        <CardDescription>Ti inviamo un link per impostarne una nuova.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResetPasswordForm />
        <p className="text-sm text-muted-foreground">
          <Link href="/accedi" className="text-primary underline-offset-4 hover:underline">
            Torna all’accesso
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
