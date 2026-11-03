import LegacyRoot from '@/components/LegacyRoot'
import { notFound } from 'next/navigation'

const validOwnerSections = new Set([
  'dashboard',
  'products',
  'setup',
  'sections',
  'share',
  'orders',
  'ads',
  'reports',
  'preview',
  'signup',
  'establishment',
  'submitted',
])

export default async function OwnerSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  if (!validOwnerSections.has(section)) {
    notFound()
  }
  return <LegacyRoot />
}
