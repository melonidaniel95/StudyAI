import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Percorsi accessibili senza autenticazione. */
const PUBLIC_PATHS = [
  '/accedi',
  '/registrati',
  '/recupero-password',
  '/aggiorna-password',
  '/auth/callback',
  '/offline',
];

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Aggiorna la sessione Supabase a ogni richiesta e protegge le route private.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Senza configurazione l'app mostra le istruzioni di setup invece di rompersi.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      /*
       * Il parametro è tipato esplicitamente e non lasciato all'inferenza:
       * versioni diverse di @supabase/ssr descrivono questa callback in modo
       * leggermente diverso, e con `noImplicitAny` la build fallirebbe su
       * quelle in cui il tipo non viene dedotto.
       */
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/accedi';
    redirectUrl.searchParams.set('successivo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === '/accedi' || pathname === '/registrati')) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/oggi';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
