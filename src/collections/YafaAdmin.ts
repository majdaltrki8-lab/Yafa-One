import type { Access, CollectionAfterChangeHook, CollectionConfig, Field, FieldHook } from 'payload'

const isCMSAdmin: Access = ({ req }) => req.user?.collection === 'admins'
const isCMSAdminOrSelf: Access = ({ req }) => {
  if (req.user?.collection === 'admins') return true
  if (req.user?.collection === 'users') return { id: { equals: req.user.id } }
  return false
}

const adminOnly = {
  create: isCMSAdmin,
  delete: isCMSAdmin,
  read: isCMSAdmin,
  update: isCMSAdmin,
}

const audit =
  (area: string): CollectionAfterChangeHook =>
  async ({ doc, operation, req }) => {
    if (req.context?.skipAudit || req.user?.collection !== 'admins') return doc
    await req.payload.create({
      collection: 'audit-logs',
      data: {
        action: operation,
        area,
        actorEmail: String(req.user.email),
        recordId: String(doc.id),
        summary: `${operation === 'create' ? 'إضافة' : 'تعديل'} سجل في ${area}`,
      },
      context: { skipAudit: true },
      overrideAccess: true,
      req,
    })
    return doc
  }

const statusField: Field = {
  name: 'status',
  type: 'select',
  defaultValue: 'active',
  options: [
    { label: 'نشط', value: 'active' },
    { label: 'موقوف', value: 'disabled' },
    { label: 'محظور', value: 'blocked' },
  ],
}

export const Roles: CollectionConfig = {
  slug: 'roles',
  labels: { singular: 'دور إداري', plural: 'الأدوار والصلاحيات' },
  admin: { group: 'الإدارة والأمان', useAsTitle: 'name' },
  access: adminOnly,
  hooks: { afterChange: [audit('الأدوار والصلاحيات')] },
  fields: [
    { name: 'name', label: 'اسم الدور', type: 'text', required: true },
    { name: 'description', label: 'الوصف', type: 'textarea' },
    {
      name: 'permissions',
      label: 'الصلاحيات',
      type: 'array',
      fields: [
        {
          name: 'section',
          label: 'القسم',
          type: 'select',
          options: ['users', 'stores', 'products', 'orders', 'payments', 'ads', 'reports', 'content', 'settings'],
        },
        { name: 'view', label: 'عرض', type: 'checkbox', defaultValue: true },
        { name: 'create', label: 'إضافة', type: 'checkbox' },
        { name: 'update', label: 'تعديل', type: 'checkbox' },
        { name: 'delete', label: 'حذف', type: 'checkbox' },
        { name: 'approve', label: 'موافقة', type: 'checkbox' },
        { name: 'export', label: 'تصدير', type: 'checkbox' },
      ],
    },
  ],
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'مستخدم', plural: 'المستخدمون' },
  admin: { group: 'المستخدمون والمنشآت', useAsTitle: 'name' },
  auth: true,
  access: {
    create: () => true,
    delete: isCMSAdmin,
    read: isCMSAdminOrSelf,
    update: isCMSAdminOrSelf,
  },
  hooks: { afterChange: [audit('المستخدمين')] },
  fields: [
    { name: 'name', label: 'الاسم', type: 'text', required: true },
    { name: 'phone', label: 'رقم الهاتف', type: 'text' },
    { name: 'district', label: 'المديرية', type: 'text', defaultValue: 'يافع' },
    {
      name: 'accountType',
      label: 'نوع الحساب',
      type: 'select',
      defaultValue: 'visitor',
      options: [
        { label: 'زائر', value: 'visitor' },
        { label: 'صاحب منشأة', value: 'owner' },
      ],
    },
    statusField,
    { name: 'lastLoginAt', label: 'آخر دخول', type: 'date' },
  ],
}

export const Establishments: CollectionConfig = {
  slug: 'establishments',
  labels: { singular: 'منشأة', plural: 'المنشآت والمتاجر' },
  admin: { group: 'المستخدمون والمنشآت', useAsTitle: 'name' },
  access: adminOnly,
  hooks: { afterChange: [audit('المنشآت')] },
  fields: [
    { name: 'name', label: 'اسم المنشأة', type: 'text', required: true },
    { name: 'owner', label: 'صاحب المنشأة', type: 'relationship', relationTo: 'users', required: true },
    { name: 'logo', label: 'الشعار', type: 'upload', relationTo: 'media' },
    { name: 'cover', label: 'صورة الغلاف', type: 'upload', relationTo: 'media' },
    { name: 'activity', label: 'نوع النشاط', type: 'text' },
    { name: 'district', label: 'المديرية', type: 'text', defaultValue: 'يافع' },
    { name: 'address', label: 'العنوان', type: 'textarea' },
    {
      name: 'reviewStatus',
      label: 'حالة المراجعة',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'قيد المراجعة', value: 'pending' },
        { label: 'معتمدة', value: 'approved' },
        { label: 'مرفوضة', value: 'rejected' },
        { label: 'موقوفة', value: 'suspended' },
      ],
    },
    { name: 'featured', label: 'متجر مثبت', type: 'checkbox' },
  ],
}

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'قسم', plural: 'الأقسام والتصنيفات' },
  admin: { group: 'المتاجر والمنتجات', useAsTitle: 'name', defaultColumns: ['name', 'parent', 'order', 'active'] },
  access: { ...adminOnly, read: () => true },
  hooks: { afterChange: [audit('الأقسام')] },
  fields: [
    { name: 'name', label: 'اسم القسم', type: 'text', required: true },
    { name: 'parent', label: 'القسم الأب', type: 'relationship', relationTo: 'categories' },
    { name: 'image', label: 'صورة القسم', type: 'upload', relationTo: 'media' },
    { name: 'order', label: 'الترتيب', type: 'number', defaultValue: 0 },
    { name: 'active', label: 'مفعّل', type: 'checkbox', defaultValue: true },
  ],
}

export const Products: CollectionConfig = {
  slug: 'products',
  labels: { singular: 'منتج', plural: 'المنتجات' },
  admin: { group: 'المتاجر والمنتجات', useAsTitle: 'name' },
  access: { ...adminOnly, read: () => true },
  hooks: { afterChange: [audit('المنتجات')] },
  fields: [
    { name: 'name', label: 'اسم المنتج', type: 'text', required: true },
    { name: 'establishment', label: 'المنشأة', type: 'relationship', relationTo: 'establishments', required: true },
    { name: 'category', label: 'القسم', type: 'relationship', relationTo: 'categories' },
    { name: 'description', label: 'الوصف', type: 'textarea' },
    { name: 'images', label: 'الصور', type: 'upload', relationTo: 'media', hasMany: true },
    { name: 'price', label: 'السعر', type: 'number', required: true, min: 0 },
    {
      name: 'currency',
      label: 'العملة',
      type: 'select',
      defaultValue: 'YER',
      options: ['YER', 'SAR', 'USD'],
    },
    { name: 'stock', label: 'المخزون', type: 'number', defaultValue: 0, min: 0 },
    {
      name: 'status',
      label: 'الحالة',
      type: 'select',
      defaultValue: 'draft',
      options: [
        { label: 'مسودة', value: 'draft' },
        { label: 'منشور', value: 'published' },
        { label: 'موقوف', value: 'disabled' },
      ],
    },
  ],
}

const calculateCommission: FieldHook = ({ siblingData }) =>
  siblingData.status === 'completed' ? Number(siblingData.total || 0) * 0.03 : 0

export const Orders: CollectionConfig = {
  slug: 'orders',
  labels: { singular: 'طلب', plural: 'الطلبات' },
  admin: { group: 'الطلبات والمدفوعات', useAsTitle: 'orderNumber' },
  access: adminOnly,
  hooks: { afterChange: [audit('الطلبات')] },
  fields: [
    { name: 'orderNumber', label: 'رقم الطلب', type: 'text', required: true, unique: true },
    { name: 'customer', label: 'العميل', type: 'relationship', relationTo: 'users', required: true },
    { name: 'establishment', label: 'المنشأة', type: 'relationship', relationTo: 'establishments', required: true },
    {
      name: 'items',
      label: 'المنتجات',
      type: 'array',
      fields: [
        { name: 'product', label: 'المنتج', type: 'relationship', relationTo: 'products' },
        { name: 'quantity', label: 'الكمية', type: 'number', min: 1, defaultValue: 1 },
        { name: 'price', label: 'السعر', type: 'number', min: 0 },
      ],
    },
    { name: 'total', label: 'الإجمالي', type: 'number', required: true, min: 0 },
    { name: 'currency', label: 'العملة', type: 'select', defaultValue: 'YER', options: ['YER', 'SAR', 'USD'] },
    {
      name: 'status',
      label: 'حالة الطلب',
      type: 'select',
      defaultValue: 'new',
      options: ['new', 'processing', 'completed', 'cancelled', 'refunded'],
    },
    { name: 'paymentMethod', label: 'طريقة الدفع', type: 'select', options: ['cash', 'electronic'] },
    { name: 'paymentStatus', label: 'حالة الدفع', type: 'select', options: ['pending', 'paid', 'refunded'] },
    { name: 'commission', label: 'عمولة المنصة 3%', type: 'number', hooks: { beforeChange: [calculateCommission] }, admin: { readOnly: true } },
  ],
}

export const Payments: CollectionConfig = {
  slug: 'payments',
  labels: { singular: 'دفعة', plural: 'العمولات والمدفوعات' },
  admin: { group: 'الطلبات والمدفوعات', useAsTitle: 'receiptNumber' },
  access: adminOnly,
  hooks: { afterChange: [audit('المدفوعات')] },
  fields: [
    { name: 'receiptNumber', label: 'رقم الإيصال', type: 'text', required: true },
    { name: 'establishment', label: 'المنشأة', type: 'relationship', relationTo: 'establishments', required: true },
    { name: 'order', label: 'الطلب', type: 'relationship', relationTo: 'orders' },
    { name: 'amount', label: 'المبلغ', type: 'number', required: true, min: 0 },
    { name: 'currency', label: 'العملة', type: 'select', defaultValue: 'YER', options: ['YER', 'SAR', 'USD'] },
    { name: 'type', label: 'النوع', type: 'select', options: ['cash', 'electronic', 'commission'] },
    { name: 'status', label: 'الحالة', type: 'select', options: ['due', 'paid', 'late', 'refunded'] },
    { name: 'paidAt', label: 'تاريخ السداد', type: 'date' },
    { name: 'receipt', label: 'إيصال التحصيل', type: 'upload', relationTo: 'media' },
  ],
}

export const Advertisements: CollectionConfig = {
  slug: 'advertisements',
  labels: { singular: 'إعلان', plural: 'الإعلانات' },
  admin: { group: 'التسويق والمحتوى', useAsTitle: 'title' },
  access: { ...adminOnly, read: () => true },
  hooks: { afterChange: [audit('الإعلانات')] },
  fields: [
    { name: 'title', label: 'عنوان الإعلان', type: 'text', required: true },
    { name: 'image', label: 'الصورة', type: 'upload', relationTo: 'media', required: true },
    { name: 'establishment', label: 'المنشأة', type: 'relationship', relationTo: 'establishments' },
    { name: 'placement', label: 'مكان الظهور', type: 'select', options: ['home', 'category', 'store', 'carousel'] },
    { name: 'type', label: 'نوع الإعلان', type: 'select', options: ['standard', 'paid', '24hours', 'featured-store'] },
    { name: 'cost', label: 'التكلفة', type: 'number', min: 0 },
    { name: 'startsAt', label: 'تاريخ البدء', type: 'date' },
    { name: 'endsAt', label: 'تاريخ الانتهاء', type: 'date' },
    { name: 'active', label: 'نشط', type: 'checkbox', defaultValue: false },
    { name: 'order', label: 'الترتيب', type: 'number', defaultValue: 0 },
  ],
}

export const AppImages: CollectionConfig = {
  slug: 'app-images',
  labels: { singular: 'صورة تطبيق', plural: 'صور التطبيق والبنرات' },
  admin: { group: 'التسويق والمحتوى', useAsTitle: 'title' },
  access: { ...adminOnly, read: () => true },
  hooks: { afterChange: [audit('صور التطبيق')] },
  fields: [
    { name: 'title', label: 'العنوان', type: 'text', required: true },
    { name: 'image', label: 'الصورة', type: 'upload', relationTo: 'media', required: true },
    { name: 'placement', label: 'الموضع', type: 'select', options: ['logo', 'home', 'carousel', 'activity', 'store', 'category'] },
    { name: 'order', label: 'الترتيب', type: 'number', defaultValue: 0 },
    { name: 'active', label: 'منشورة', type: 'checkbox', defaultValue: true },
  ],
}

export const Promotions: CollectionConfig = {
  slug: 'promotions',
  labels: { singular: 'عرض أو كوبون', plural: 'العروض والبونصات' },
  admin: { group: 'التسويق والمحتوى', useAsTitle: 'title' },
  access: adminOnly,
  hooks: { afterChange: [audit('العروض والبونصات')] },
  fields: [
    { name: 'title', label: 'العنوان', type: 'text', required: true },
    { name: 'code', label: 'كود الخصم', type: 'text' },
    { name: 'kind', label: 'النوع', type: 'select', options: ['offer', 'bonus', 'coupon', 'referral'] },
    { name: 'value', label: 'القيمة', type: 'number', min: 0 },
    { name: 'valueType', label: 'نوع القيمة', type: 'select', options: ['fixed', 'percent'] },
    { name: 'startsAt', label: 'البداية', type: 'date' },
    { name: 'endsAt', label: 'النهاية', type: 'date' },
    { name: 'active', label: 'نشط', type: 'checkbox', defaultValue: true },
  ],
}

export const Referrals: CollectionConfig = {
  slug: 'referrals',
  labels: { singular: 'إحالة', plural: 'شارك واربح' },
  admin: { group: 'التسويق والمحتوى', useAsTitle: 'code' },
  access: adminOnly,
  hooks: { afterChange: [audit('الإحالات')] },
  fields: [
    { name: 'code', label: 'كود الإحالة', type: 'text', required: true, unique: true },
    { name: 'referrer', label: 'صاحب الإحالة', type: 'relationship', relationTo: 'users', required: true },
    { name: 'referred', label: 'المستخدم المُحال', type: 'relationship', relationTo: 'users' },
    { name: 'reward', label: 'المكافأة', type: 'number', min: 0 },
    { name: 'status', label: 'الحالة', type: 'select', options: ['pending', 'eligible', 'paid', 'rejected'] },
  ],
}

export const Notifications: CollectionConfig = {
  slug: 'notifications',
  labels: { singular: 'إشعار', plural: 'الإشعارات' },
  admin: { group: 'التواصل', useAsTitle: 'title' },
  access: adminOnly,
  hooks: { afterChange: [audit('الإشعارات')] },
  fields: [
    { name: 'title', label: 'العنوان', type: 'text', required: true },
    { name: 'message', label: 'الرسالة', type: 'textarea', required: true },
    { name: 'audience', label: 'المستلمون', type: 'select', options: ['all', 'visitors', 'owners', 'custom'] },
    { name: 'scheduledAt', label: 'موعد الإرسال', type: 'date' },
    { name: 'status', label: 'الحالة', type: 'select', defaultValue: 'draft', options: ['draft', 'scheduled', 'sent', 'failed'] },
    { name: 'sentAt', label: 'وقت الإرسال', type: 'date', admin: { readOnly: true } },
  ],
}

export const ExchangeRates: CollectionConfig = {
  slug: 'exchange-rates',
  labels: { singular: 'سعر صرف', plural: 'أسعار الصرف' },
  admin: { group: 'إعدادات النظام', useAsTitle: 'currency' },
  access: { ...adminOnly, read: () => true },
  hooks: { afterChange: [audit('أسعار الصرف')] },
  fields: [
    { name: 'currency', label: 'العملة', type: 'select', options: ['SAR', 'USD'], required: true, unique: true },
    { name: 'buy', label: 'سعر الشراء مقابل YER', type: 'number', required: true, min: 0 },
    { name: 'sell', label: 'سعر البيع مقابل YER', type: 'number', required: true, min: 0 },
    { name: 'source', label: 'المصدر', type: 'text' },
    { name: 'effectiveAt', label: 'وقت آخر تحديث', type: 'date', required: true },
  ],
}

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'سجل تدقيق', plural: 'سجل التدقيق' },
  admin: { group: 'الإدارة والأمان', useAsTitle: 'summary', defaultColumns: ['createdAt', 'actorEmail', 'area', 'action'] },
  access: {
    create: isCMSAdmin,
    delete: () => false,
    read: isCMSAdmin,
    update: () => false,
  },
  fields: [
    { name: 'action', label: 'الإجراء', type: 'text', required: true },
    { name: 'area', label: 'القسم', type: 'text', required: true },
    { name: 'actorEmail', label: 'المنفذ', type: 'email', required: true },
    { name: 'recordId', label: 'معرف السجل', type: 'text' },
    { name: 'summary', label: 'التفاصيل', type: 'textarea', required: true },
  ],
}

export const yafaCollections = [
  Roles,
  Users,
  Establishments,
  Categories,
  Products,
  Orders,
  Payments,
  Advertisements,
  AppImages,
  Promotions,
  Referrals,
  Notifications,
  ExchangeRates,
  AuditLogs,
]
