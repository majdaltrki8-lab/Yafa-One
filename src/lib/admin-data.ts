import 'server-only'

import config from '@payload-config'
import { getPayload } from 'payload'
import { headers } from 'next/headers'

export type AdminRow = {
  id: string
  title: string
  detail: string
  status: string
  date: string
}

export type AdminSnapshot = {
  adminEmail: string
  counts: Record<string, number>
  rows: AdminRow[]
  section: string
  lastExchangeUpdate: string | null
  dbError?: string | null
}

const sectionCollections: Record<string, string> = {
  dashboard: 'audit-logs',
  users: 'users',
  establishments: 'establishments',
  products: 'products',
  orders: 'orders',
  roles: 'roles',
  media: 'app-images',
  ads: 'advertisements',
  promotions: 'promotions',
  payments: 'payments',
  notifications: 'notifications',
  audit: 'audit-logs',
  analytics: 'orders',
  reports: 'orders',
  settings: 'exchange-rates',
  appearance: 'app-images',
}

function relationLabel(value: unknown) {
  if (!value) return '—'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    return String(item.name || item.title || item.email || item.orderNumber || item.receiptNumber || item.id || '—')
  }
  return '—'
}

function toRow(doc: Record<string, unknown>): AdminRow {
  const title = relationLabel(doc.name || doc.title || doc.orderNumber || doc.receiptNumber || doc.code || doc.currency || doc.summary || doc.email)
  const detail = relationLabel(doc.establishment || doc.owner || doc.customer || doc.accountType || doc.placement || doc.audience || doc.area || doc.district)
  return {
    id: String(doc.id),
    title,
    detail,
    status: String(doc.status || doc.reviewStatus || (doc.active === true ? 'نشط' : doc.active === false ? 'متوقف' : '—')),
    date: doc.updatedAt ? new Intl.DateTimeFormat('ar-YE', { dateStyle: 'medium' }).format(new Date(String(doc.updatedAt))) : '—',
  }
}

export async function getAdminSnapshot(section: string): Promise<AdminSnapshot> {
  try {
    const payload = await getPayload({ config })
    let adminEmail = 'admin@yafaone.com'

    try {
      const headerList = await headers()
      const { user } = await payload.auth({ headers: headerList })
      if (user?.email) {
        adminEmail = String(user.email)
      }
    } catch {
      // In development or preview without auth cookie, use preview admin
      adminEmail = 'admin@yafaone.com'
    }

    const countSlugs = ['users', 'establishments', 'products', 'orders', 'advertisements', 'payments']
    const countResults = await Promise.all(
      countSlugs.map(async (slug) => {
        try {
          const result = await payload.count({ collection: slug as never, overrideAccess: true })
          return [slug, result.totalDocs] as const
        } catch {
          return [slug, 0] as const
        }
      }),
    )

    const collection = sectionCollections[section]
    let rows: AdminRow[] = []
    if (collection) {
      try {
        const result = await payload.find({
          collection: collection as never,
          depth: 1,
          limit: 25,
          overrideAccess: true,
          sort: '-updatedAt',
        })
        rows = (result?.docs || []).map((doc) => toRow(doc as unknown as Record<string, unknown>))
      } catch (err) {
        console.warn(`Could not load records for collection ${collection}:`, err)
        rows = []
      }
    }

    let lastExchangeUpdate: string | null = null
    try {
      const exchange = await payload.find({
        collection: 'exchange-rates',
        limit: 1,
        overrideAccess: true,
        sort: '-effectiveAt',
      })
      lastExchangeUpdate = exchange?.docs?.[0]?.effectiveAt ? String(exchange.docs[0].effectiveAt) : null
    } catch {
      lastExchangeUpdate = null
    }

    return {
      adminEmail,
      counts: Object.fromEntries(countResults),
      rows,
      section,
      lastExchangeUpdate,
      dbError: null,
    }
  } catch (error) {
    console.error('Database connection error in getAdminSnapshot:', error)
    return {
      adminEmail: 'admin@yafaone.com',
      counts: { users: 0, establishments: 0, products: 0, orders: 0, advertisements: 0, payments: 0 },
      rows: [],
      section,
      lastExchangeUpdate: null,
      dbError: 'تعذر الاتصال بقاعدة البيانات. يرجى التحقق من إعدادات الاتصال أو إعادة المحاولة لاحقاً.',
    }
  }
}
