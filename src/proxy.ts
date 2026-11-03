import { NextResponse, type NextRequest } from 'next/server'

const adminSections = new Set([
  'dashboard',
  'users',
  'establishments',
  'stores',
  'products',
  'orders',
  'analytics',
  'roles',
  'media',
  'activity-images',
  'ads',
  'carousel',
  'promotions',
  'reports',
  'payments',
  'settlements',
  'exchange-rates',
  'referrals',
  'notifications',
  'settings',
  'backup',
  'audit',
])

const legacyAdminSections = new Set([
  'carousel',
  'activity-images',
  'exchange-rates',
  'referrals',
  'backup',
])

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  const roleCookie = request.cookies.get('yafa-role')?.value

  // Review frames and audit tools must always route to legacy app
  if (searchParams.has('reviewToken')) {
    return NextResponse.rewrite(new URL('/legacy', request.url))
  }


  // Owner Portal Routes
  if (pathname.startsWith('/owner')) {
    // Signup flow is accessible to visitors wishing to register
    if (
      pathname === '/owner/signup' ||
      pathname === '/owner/establishment' ||
      pathname === '/owner/submitted'
    ) {
      return NextResponse.next()
    }

    // Protected owner routes: require owner role
    if (roleCookie !== 'owner') {
      const loginUrl = new URL('/auth/owner-login', request.url)
      loginUrl.searchParams.set('return', pathname)
      return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
  }

  // Admin Portal Routes
  if (pathname.startsWith('/admin')) {
    const section = pathname.split('/')[2] || 'dashboard'

    // Protected admin routes: require admin role AND valid server-side session token (payload-token)
    const hasServerSession = request.cookies.has('payload-token')
    if (roleCookie !== 'admin' || !hasServerSession) {
      const loginUrl = new URL('/auth/admin-login', request.url)
      loginUrl.searchParams.set('return', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Interactive modules with local state reside in legacy app
    if (legacyAdminSections.has(section)) {
      return NextResponse.rewrite(new URL('/legacy', request.url))
    }

    if (adminSections.has(section)) {
      return NextResponse.rewrite(new URL(`/management/${section}`, request.url))
    }

    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/auth/:path*',
    '/admin/:path*',
    '/entry',
    '/audit',
    '/review-board',
    '/legacy',
    '/visitor/:path*',
    '/owner/:path*',
  ],
}

