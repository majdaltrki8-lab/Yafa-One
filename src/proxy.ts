import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionToken } from '@/lib/session'

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
  'cities',
  'complaints',
  'used',
  'vehicles',
  'categories',
  'professionals',
  'appearance',
  'app-images',
])

const payloadAdminPrefixes = [
  '/admin/collections',
  '/admin/globals',
  '/admin/login',
  '/admin/logout',
  '/admin/account',
  '/admin/create-first-user',
  '/admin/forgot',
  '/admin/reset',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const roleCookie = request.cookies.get('yafa-role')?.value
  const session = await verifySessionToken(request.cookies.get('yafa-session')?.value)

  const hasPayloadSession = roleCookie === 'admin' && request.cookies.has('payload-token')
  const hasVerifiedAdminSession = session?.role === 'admin'

  // Protect internal audit, review-board, and management routes behind verified Admin session
  if (
    pathname.startsWith('/management') ||
    pathname === '/audit' ||
    pathname === '/review-board'
  ) {
    if (!hasVerifiedAdminSession && !hasPayloadSession) {
      const loginUrl = new URL('/auth/admin-login', request.url)
      loginUrl.searchParams.set('return', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // Owner Portal Routes
  if (pathname.startsWith('/owner')) {
    // Signup flow is accessible to visitors wishing to register
    if (
      pathname === '/owner/signup' ||
      pathname === '/owner/submitted'
    ) {
      return NextResponse.next()
    }

    // Protected owner routes: require verified owner session
    if (session?.role !== 'owner') {
      const loginUrl = new URL('/auth/owner-login', request.url)
      loginUrl.searchParams.set('return', pathname)
      return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
  }

  // Admin Portal Routes
  if (pathname.startsWith('/admin')) {
    if (
      pathname === '/admin' ||
      payloadAdminPrefixes.some((prefix) => pathname.startsWith(prefix))
    ) {
      return NextResponse.next()
    }

    const section = pathname.split('/')[2] || 'dashboard'

    if (!hasVerifiedAdminSession && !hasPayloadSession) {
      const loginUrl = new URL('/auth/admin-login', request.url)
      loginUrl.searchParams.set('return', pathname)
      return NextResponse.redirect(loginUrl)
    }

    if (adminSections.has(section)) {
      return NextResponse.rewrite(new URL('/legacy', request.url))
    }

    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/auth/:path*',
    '/admin/:path*',
    '/management/:path*',
    '/entry',
    '/audit',
    '/review-board',
    '/legacy',
    '/visitor/:path*',
    '/owner/:path*',
  ],
}
