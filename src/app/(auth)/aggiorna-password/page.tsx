import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UpdatePasswordForm } from './update-form';

export const metadata: Metadata = { title: 'Nuova password' };

export default function UpdatePasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Imposta una nuova password</CardTitle>
        <CardDescription>Scegli una password di almeno 8 caratteri.</CardDescription>
      </CardHeader>
      <CardContent>
        <UpdatePasswordForm />
      </CardContent>
    </Card>
  );
}
