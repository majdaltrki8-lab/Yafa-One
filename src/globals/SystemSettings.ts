import type { GlobalConfig } from 'payload'

export const SystemSettings: GlobalConfig = {
  slug: 'system-settings',
  label: 'إعدادات يافع ون',
  admin: { group: 'إعدادات النظام' },
  access: {
    read: ({ req }) => req.user?.collection === 'admins',
    update: ({ req }) => req.user?.collection === 'admins',
  },
  versions: true,
  fields: [
    { name: 'platformName', label: 'اسم المنصة', type: 'text', defaultValue: 'يافع ون' },
    { name: 'serviceArea', label: 'نطاق الخدمة', type: 'text', defaultValue: 'يافع', admin: { readOnly: true } },
    { name: 'commissionRate', label: 'نسبة العمولة', type: 'number', defaultValue: 3, min: 0, max: 100 },
    { name: 'supportEmail', label: 'بريد الدعم', type: 'email' },
    { name: 'maintenanceMode', label: 'وضع الصيانة', type: 'checkbox' },
    { name: 'allowRegistration', label: 'السماح بالتسجيل', type: 'checkbox', defaultValue: true },
    {
      name: 'enabledCurrencies',
      label: 'العملات المفعلة',
      type: 'select',
      hasMany: true,
      defaultValue: ['YER', 'SAR', 'USD'],
      options: ['YER', 'SAR', 'USD'],
    },
  ],
}
