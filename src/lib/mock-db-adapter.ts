import { createDatabaseAdapter } from 'payload'

// Seed in-memory store with authentic Yafa One platform data
function createInitialStore(): Record<string, any[]> {
  return {
    admins: [
      {
        id: 'admin-1',
        email: 'admin@yafaone.com',
        role: 'superadmin',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    users: [
      {
        id: 'user-1',
        name: 'أحمد محمد اليافعي',
        email: 'owner@yafa.test',
        role: 'owner',
        status: 'نشط',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'user-2',
        name: 'منى علي',
        email: 'visitor@yafa.test',
        role: 'customer',
        status: 'نشط',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'user-3',
        name: 'خالد سالم الصلاحي',
        email: 'owner2@yafa.test',
        role: 'owner',
        status: 'معلق',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    establishments: [
      {
        id: 'est-1',
        name: 'عسل يافع الطبيعي',
        district: 'لبعوس',
        category: 'غذاء وبقالة',
        status: 'معتمدة',
        approved: true,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'est-2',
        name: 'مطعم القمة السياحي',
        district: 'رصد',
        category: 'مطاعم ومقاهي',
        status: 'قيد المراجعة',
        approved: false,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'est-3',
        name: 'تقنية يافع للإلكترونيات',
        district: 'الحد',
        category: 'إلكترونيات',
        status: 'معتمدة',
        approved: true,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    products: [
      {
        id: 'prod-1',
        name: 'عسل سدر يافعي دوعني أصلي',
        price: 35000,
        currency: 'YER',
        stock: 45,
        status: 'منشور',
        establishment: 'عسل يافع الطبيعي',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'prod-2',
        name: 'بن يافعي درجة أولى حمصة وسط',
        price: 4800,
        currency: 'YER',
        stock: 120,
        status: 'منشور',
        establishment: 'قهوة يافع الأصيلة',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'prod-3',
        name: 'هاتف ذكي سامسونج A54 سعة 256GB',
        price: 425000,
        currency: 'YER',
        stock: 12,
        status: 'منشور',
        establishment: 'تقنية يافع للإلكترونيات',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    orders: [
      {
        id: 'ord-1',
        orderNumber: '#ORD-1068',
        establishment: 'سوق القمة',
        paymentMethod: 'نقدي عند الاستلام',
        total: 75000,
        status: 'مكتمل',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ord-2',
        orderNumber: '#ORD-1067',
        establishment: 'عسل يافع الطبيعي',
        paymentMethod: 'إلكتروني / تحويل',
        total: 35000,
        status: 'قيد التنفيذ',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ord-3',
        orderNumber: '#ORD-1066',
        establishment: 'تقنية يافع للإلكترونيات',
        paymentMethod: 'نقدي',
        total: 425000,
        status: 'ملغي',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    advertisements: [
      {
        id: 'ad-1',
        title: 'منتجات يافع الأصيلة',
        placement: 'الرئيسية',
        active: true,
        status: 'نشط',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ad-2',
        title: 'عروض السوبرماركت والمواد الغذائية',
        placement: 'قسم البقالة',
        active: true,
        status: 'نشط',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    payments: [
      {
        id: 'pay-1',
        receiptNumber: 'ST-001',
        establishment: 'سوق القمة',
        amount: 97000,
        currency: 'YER',
        commission: 2910,
        status: 'مكتمل',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    'exchange-rates': [
      {
        id: 'rate-1',
        currency: 'SAR / USD',
        sarBuy: 532,
        sarSell: 535,
        usdBuy: 2025,
        usdSell: 2035,
        source: 'محلات الصرافة المعتمدة في لبعوس',
        effectiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    'audit-logs': [
      {
        id: 'audit-1',
        action: 'login',
        actorEmail: 'admin@yafaone.com',
        summary: 'تسجيل دخول مدير المنصة',
        status: 'مسجل',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  }
}

export function mockDatabaseAdapter(): any {
  const store = createInitialStore()

  return createDatabaseAdapter({
    name: 'yafa-in-memory-db',
    defaultIDType: 'text',
    init: () => {},
    connect: async () => {
      return Promise.resolve()
    },
    destroy: async () => {},
    beginTransaction: async () => null,
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    count: async ({ collection }: { collection: string }) => {
      const records = store[collection] || []
      return { totalDocs: records.length }
    },
    countGlobalVersions: async () => ({ totalDocs: 0 }),
    countVersions: async () => ({ totalDocs: 0 }),
    create: async ({ collection, data }: any) => {
      if (!store[collection]) store[collection] = []
      const newDoc = {
        id: data?.id || `${collection}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...data,
      }
      store[collection].push(newDoc)
      return newDoc
    },
    createGlobal: async ({ data }: any) => data,
    createGlobalVersion: async ({ data }: any) => data,
    createVersion: async ({ data }: any) => data,
    deleteMany: async ({ collection, where }: any) => {
      const records = store[collection] || []
      store[collection] = []
      return { docs: records, errors: [] }
    },
    deleteOne: async ({ collection, where }: any) => {
      return {}
    },
    deleteVersions: async () => ({}),
    find: async ({ collection, limit = 10, page = 1, where }: any) => {
      let records = store[collection] || []
      if (where?.id?.equals) {
        records = records.filter((r) => r.id === where.id.equals)
      } else if (where?.slug?.equals) {
        records = records.filter((r) => r.slug === where.slug.equals)
      }
      const totalDocs = records.length
      const totalPages = Math.max(1, Math.ceil(totalDocs / limit))
      const paginatedDocs = records.slice((page - 1) * limit, page * limit)
      return {
        docs: paginatedDocs,
        totalDocs,
        limit,
        totalPages,
        page,
        pagingCounter: (page - 1) * limit + 1,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
        prevPage: page > 1 ? page - 1 : null,
        nextPage: page < totalPages ? page + 1 : null,
      }
    },
    findDistinct: async () => [],
    findGlobal: async () => null,
    findGlobalVersions: async () => ({ docs: [], totalDocs: 0 }),
    findOne: async ({ collection, where }: any) => {
      const records = store[collection] || []
      if (!records.length) return null
      if (where?.id?.equals) {
        return records.find((r) => r.id === where.id.equals) || null
      }
      if (where?.email?.equals) {
        return records.find((r) => r.email === where.email.equals) || null
      }
      return records[0] || null
    },
    findVersions: async ({ collection, limit = 10, page = 1 }: any) => {
      return {
        docs: [],
        totalDocs: 0,
        limit,
        totalPages: 1,
        page,
        hasPrevPage: false,
        hasNextPage: false,
        prevPage: null,
        nextPage: null,
      }
    },
    queryDrafts: async ({ limit = 10, page = 1 }: any) => ({
      docs: [],
      totalDocs: 0,
      limit,
      totalPages: 1,
      page,
      hasPrevPage: false,
      hasNextPage: false,
      prevPage: null,
      nextPage: null,
    }),
    updateGlobal: async ({ data }: any) => data,
    updateGlobalVersion: async ({ data }: any) => data,
    updateJobs: async () => [],
    updateMany: async ({ collection, data }: any) => ({ docs: [], errors: [] }),
    updateOne: async ({ collection, where, data }: any) => {
      const records = store[collection] || []
      const index = records.findIndex((r) => r.id === where?.id?.equals)
      if (index !== -1) {
        records[index] = { ...records[index], ...data, updatedAt: new Date().toISOString() }
        return records[index]
      }
      return { id: where?.id?.equals || 'doc-1', ...data }
    },
    updateVersion: async ({ data }: any) => data,
    upsert: async ({ collection, where, data }: any) => {
      const records = store[collection] || []
      const existing = records.find((r) => r.id === where?.id?.equals)
      if (existing) {
        Object.assign(existing, data, { updatedAt: new Date().toISOString() })
        return existing
      }
      const newDoc = { id: where?.id?.equals || `${collection}-${Date.now()}`, ...data }
      records.push(newDoc)
      return newDoc
    },
  } as any)
}
