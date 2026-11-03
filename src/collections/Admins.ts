import type { Access, CollectionConfig } from 'payload'

const isPayloadAdmin: Access = ({ req }) => req.user?.collection === 'admins'

export const Admins: CollectionConfig = {
  slug: 'admins',
  access: {
    create: () => false,
    delete: isPayloadAdmin,
    read: isPayloadAdmin,
    update: isPayloadAdmin,
  },
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [
    { name: 'name', label: 'الاسم', type: 'text' },
    {
      name: 'role',
      label: 'الدور الإداري',
      type: 'relationship',
      relationTo: 'roles',
    },
    {
      name: 'adminLevel',
      label: 'المستوى',
      type: 'select',
      defaultValue: 'super-admin',
      options: [
        { label: 'المدير الرئيسي', value: 'super-admin' },
        { label: 'مدير', value: 'admin' },
        { label: 'موظف', value: 'staff' },
      ],
    },
    {
      name: 'status',
      label: 'الحالة',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'نشط', value: 'active' },
        { label: 'موقوف', value: 'disabled' },
      ],
    },
  ],
}
