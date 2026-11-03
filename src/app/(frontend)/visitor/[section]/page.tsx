import LegacyRoot from '@/components/LegacyRoot'
import { notFound } from 'next/navigation'

const validVisitorSections = new Set([
  'home',
  'stores',
  'exchange-rates',
  'share',
  'fuel',
  'used',
  'remittance',
  'search',
  'chats',
  'cart',
  'orders',
  'favorites',
  'notifications',
  'restaurants',
  'groceries',
  'electronics',
  'fashion',
  'furniture',
  'building',
  'aluminum',
  'services',
  'vehicles',
  'dealers',
  'property',
  'health',
  'pharmacies',
  'offices',
  'maintenance',
  'exchange',
  'offers',
  'ads',
])

export default async function VisitorSectionPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const { section } = await params
  if (!validVisitorSections.has(section)) {
    notFound()
  }
  return <LegacyRoot />
}
