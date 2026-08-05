import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Scambia il codice ricevuto via email con una sessione valida
 * (conferma registrazione e recupero password).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('successivo') ?? '/oggi';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next.startsWith('/') ? next : '/oggi'}`);
    }
  }

  return NextResponse.redirect(`${origin}/accedi?errore=link-non-valido`);
}
