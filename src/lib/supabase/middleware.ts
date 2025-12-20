import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { Database } from '@/types/database.types'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          supabaseResponse.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          supabaseResponse = NextResponse.next({
            request,
          })
          supabaseResponse.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  // Regex to match locale prefix (optional)
  const localePrefix = /^\/(en|zh-CN|zh-HK|zh-TW)/
  const pathWithoutLocale = path.replace(localePrefix, '') || '/'

  // Protect routes that require authentication
  if (
    !user &&
    !pathWithoutLocale.startsWith('/login') &&
    !pathWithoutLocale.startsWith('/signup') &&
    !pathWithoutLocale.startsWith('/auth') &&
    pathWithoutLocale !== '/' // Allow landing page if exists
  ) {
    const url = request.nextUrl.clone()
    // Keep the locale if present, otherwise default to nothing (or en)
    // Actually, we should redirect to the localized login page
    // If path is /dashboard, redirect to /login (preserving locale if any)
    
    // Simple approach: just redirect to /login, next-intl middleware will handle the locale prefix if we redirect to a relative path?
    // No, NextResponse.redirect requires absolute URL.
    
    // If we are at /zh-CN/dashboard, we want /zh-CN/login
    // If we are at /dashboard (no locale), we want /login
    
    // Let's construct the target path
    const localeMatch = path.match(localePrefix)
    const locale = localeMatch ? localeMatch[0] : ''
    
    url.pathname = `${locale}/login`
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (
    user &&
    (pathWithoutLocale.startsWith('/login') ||
      pathWithoutLocale.startsWith('/signup'))
  ) {
    const url = request.nextUrl.clone()
    const localeMatch = path.match(localePrefix)
    const locale = localeMatch ? localeMatch[0] : ''
    
    url.pathname = `${locale}/dashboard`
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
