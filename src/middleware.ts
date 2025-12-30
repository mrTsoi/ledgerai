import { updateSession } from '@/lib/supabase/middleware'
import { NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware';
import { locales, localePrefix } from './i18n/navigation';

const intlMiddleware = createMiddleware({
  locales,
  localePrefix,
  defaultLocale: 'en',
  localeDetection: true
});

export async function middleware(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    if (code) {
      console.debug('[middleware] incoming code param:', code, 'path:', request.nextUrl.pathname, 'fullUrl:', request.url)
      try {
        console.debug('[middleware] incoming cookies:', request.headers.get('cookie'))
      } catch (e) {}

      // If the OAuth provider returned to the app root (e.g. / or /en) with a code,
      // redirect to our localized auth callback route so server-side exchange runs.
      const path = request.nextUrl.pathname
      const localeMatch = path.match(/^\/(en|zh-CN|zh-HK|zh-TW)/)
      const locale = localeMatch ? localeMatch[0] : ''
      const isAtRoot = path === '/' || path === '' || path === `/${locale.replace(/^\//, '')}` || path === `/${locale.replace(/^\//, '')}/`

      if (isAtRoot) {
        const PUBLIC_DOMAIN = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
        const requestOrigin = new URL(request.url).origin
        const targetOrigin = (process.env.NEXT_PUBLIC_SITE_URL || requestOrigin).replace(/\/$/, '')
        const targetPath = `${locale}/auth/callback`
        const redirectUrl = `${targetOrigin.startsWith('http') ? '' : ''}${targetOrigin}${targetPath.startsWith('/') ? '' : '/'}${targetPath}${request.nextUrl.search}`

        try {
          const url = new URL(redirectUrl)
          const resp = NextResponse.redirect(url)
          return resp
        } catch (e) {
          // fallback: simple redirect to relative path
          const url = request.nextUrl.clone()
          url.pathname = `/${locale.replace(/^\//, '')}/auth/callback`
          const resp = NextResponse.redirect(url)
          return resp
        }
      }
    }
  } catch (e) {}
  // Legacy locale redirect: zh-TW -> zh-HK
  if (request.nextUrl.pathname === '/zh-TW' || request.nextUrl.pathname.startsWith('/zh-TW/')) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname.replace(/^\/zh-TW(\/|$)/, '/zh-HK$1');
    // Force public domain for redirect
    const PUBLIC_DOMAIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://ledgerai.sophiesofts.com';
    try {
      const { host, protocol } = new URL(PUBLIC_DOMAIN);
      url.host = host;
      url.protocol = protocol;
    } catch {
      url.host = PUBLIC_DOMAIN.replace(/^https?:\/\//, '');
      url.protocol = PUBLIC_DOMAIN.startsWith('https') ? 'https:' : 'http:';
    }
    const resp = NextResponse.redirect(url);
    return resp;
  }

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
