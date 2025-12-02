import { updateSession } from '@/lib/supabase/middleware'
import { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware';
import { locales, localePrefix } from './i18n/navigation';

const intlMiddleware = createMiddleware({
  locales,
  localePrefix,
  defaultLocale: 'en'
});

export async function middleware(request: NextRequest) {
  // 1. Run next-intl middleware to handle locale routing
  const response = intlMiddleware(request);

  // 2. Run Supabase auth middleware
  // We pass the request to updateSession.
  // Note: updateSession creates a new response internally.
  const supabaseResponse = await updateSession(request);

  // If Supabase wants to redirect (e.g. to login), we must respect that.
  if (supabaseResponse.headers.get('location')) {
    return supabaseResponse;
  }

  // If Supabase just set cookies (refresh session), we need to copy them to the next-intl response
  // so that we preserve both the locale routing (from next-intl) and the auth session (from supabase)
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value, cookie);
  });

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes should probably be excluded from i18n routing or handled carefully)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
