import AdminPortal from '@/components/admin/AdminPortal'
import { getAdminSnapshot } from '@/lib/admin-data'
import { verifySessionToken } from '@/lib/session'
import config from '@payload-config'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

const sections = new Set([
  'dashboard', 'users', 'establishments', 'stores', 'products', 'orders', 'analytics', 'roles',
  'media', 'activity-images', 'ads', 'carousel', 'promotions', 'reports', 'payments', 'settlements',
  'exchange-rates', 'referrals', 'notifications', 'settings', 'backup', 'audit', 'appearance',
  'professionals', 'app-images',
])

export default async function ManagementPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.has(section)) notFound()

  const cookieStore = await cookies()
  const session = await verifySessionToken(cookieStore.get('yafa-session')?.value)
  let authorized = session?.role === 'admin'

  if (!authorized && cookieStore.has('payload-token')) {
    try {
      const payload = await getPayload({ config })
      const headerList = await headers()
      const { user } = await payload.auth({ headers: headerList })
      if (user && user.collection === 'admins') {
        authorized = true
      }
    } catch {
      authorized = false
    }
  }

  if (!authorized) {
    redirect(`/auth/admin-login?return=${encodeURIComponent(`/management/${section}`)}`)
  }

  const snapshot = await getAdminSnapshot(section)
  return <AdminPortal snapshot={snapshot} />
}
