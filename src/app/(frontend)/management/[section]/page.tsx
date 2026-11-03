import AdminPortal from '@/components/admin/AdminPortal'
import { getAdminSnapshot } from '@/lib/admin-data'
import { notFound } from 'next/navigation'

const sections = new Set([
  'dashboard', 'users', 'establishments', 'stores', 'products', 'orders', 'analytics', 'roles',
  'media', 'activity-images', 'ads', 'carousel', 'promotions', 'reports', 'payments', 'settlements',
  'exchange-rates', 'referrals', 'notifications', 'settings', 'backup', 'audit',
])

export default async function ManagementPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.has(section)) notFound()
  const snapshot = await getAdminSnapshot(section)
  return <AdminPortal snapshot={snapshot} />
}
