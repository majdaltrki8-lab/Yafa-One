'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BadgePercent, BarChart3, Bell, Boxes, Building2, ChevronLeft, CircleDollarSign,
  ClipboardList, Crown, Download, FileSpreadsheet, FileText, Gift, Home, Image, KeyRound, LayoutGrid,
  MapPin, Menu, Package, Palette, Plus, Search, Settings, ShieldCheck, ShoppingCart, Store, UserRound, UsersRound, X,
} from 'lucide-react'
import type { AdminSnapshot } from '@/lib/admin-data'
import AppearanceManager from './AppearanceManager'

const navigation = [
  ['الرئيسية', 'dashboard', Home],
  ['إدارة المستخدمين', 'users', UsersRound],
  ['إدارة المنشآت', 'establishments', Store],
  ['إدارة المنتجات والأقسام', 'products', Package],
  ['إدارة الطلبات', 'orders', ShoppingCart],
  ['الإحصائيات الإدارية', 'analytics', BarChart3],
  ['الأدوار والصلاحيات', 'roles', ShieldCheck],
  ['إدارة المظهر والمحتوى', 'appearance', Palette],
  ['صور التطبيق والإعلانات', 'media', Image],
  ['إدارة الإعلانات', 'ads', Bell],
  ['العروض والبونصات', 'promotions', Gift],
  ['التقارير والإحصائيات', 'reports', FileText],
  ['العمولات والمدفوعات', 'payments', CircleDollarSign],
  ['إدارة الإشعارات', 'notifications', Bell],
  ['إعدادات النظام', 'settings', Settings],
  ['سجل التدقيق', 'audit', ClipboardList],
] as const

const pageInfo: Record<string, { title: string; subtitle: string; collection?: string; add?: string }> = {
  dashboard: { title: 'لوحة التحكم الإدارية', subtitle: 'نظرة شاملة وآمنة على بيانات منصة يافع ون' },
  users: { title: 'إدارة المستخدمين', subtitle: 'البحث والتصفية وإدارة حالات حسابات العملاء وأصحاب المنشآت', collection: 'users', add: 'إضافة مستخدم' },
  establishments: { title: 'إدارة المتاجر والأقسام', subtitle: 'مراجعة المنشآت والموافقة عليها وإدارة بياناتها', collection: 'establishments', add: 'إضافة منشأة' },
  products: { title: 'إدارة المنتجات والتصنيفات', subtitle: 'إدارة المنتجات والصور والمخزون والأقسام وترتيبها', collection: 'products', add: 'إضافة منتج' },
  orders: { title: 'إدارة الطلبات', subtitle: 'متابعة الطلبات والدفع والإلغاء والاسترجاع حسب الصلاحية', collection: 'orders', add: 'إضافة طلب' },
  analytics: { title: 'الإحصائيات الإدارية', subtitle: 'مؤشرات الأداء الحالية المستخرجة من البيانات الفعلية' },
  roles: { title: 'الأدوار والصلاحيات', subtitle: 'تحديد صلاحيات العرض والإضافة والتعديل والحذف والموافقة والتصدير', collection: 'roles', add: 'إنشاء دور' },
  media: { title: 'إدارة صور التطبيق والإعلانات', subtitle: 'رفع الصور والبنرات وترتيبها ونشرها وإيقافها', collection: 'app-images', add: 'إضافة صورة' },
  ads: { title: 'إدارة الإعلانات', subtitle: 'الإعلانات المدفوعة وإعلانات 24 ساعة وتثبيت المتاجر', collection: 'advertisements', add: 'إضافة إعلان' },
  promotions: { title: 'إدارة العروض والبونصات', subtitle: 'العروض والمكافآت والكوبونات وبرنامج شارك واربح', collection: 'promotions', add: 'إضافة عرض' },
  reports: { title: 'التقارير والإحصائيات', subtitle: 'تقارير قابلة للتصفية والتصدير دون أرقام تجريبية' },
  payments: { title: 'إدارة العمولات والمدفوعات', subtitle: 'عمولة 3% للطلبات المكتملة فقط وإيصالات التحصيل', collection: 'payments', add: 'إضافة إيصال' },
  notifications: { title: 'إدارة الإشعارات', subtitle: 'إنشاء الإشعارات وجدولتها ومراجعة سجل الإرسال', collection: 'notifications', add: 'إنشاء إشعار' },
  settings: { title: 'إعدادات النظام', subtitle: 'العملات وأسعار الصرف والمحتوى والإعدادات العامة' },
  appearance: { title: 'إدارة المظهر والمحتوى والتصميم', subtitle: 'تخصيص الألوان والشعارات والبنرات وإظهار وترتيب أقسام التطبيق حياً دون تحديث التطبيق' },
  backup: { title: 'النسخ الاحتياطي والأمان', subtitle: 'إدارة وتصدير النسخ الاحتياطية لقواعد البيانات وسجلات التدقيق وملفات الوسائط' },
  audit: { title: 'سجل التدقيق', subtitle: 'سجل خادمي غير قابل للتعديل للإجراءات الإدارية الحساسة', collection: 'audit-logs' },
}

const collectionBySection: Record<string, string> = {
  users: 'users', establishments: 'establishments', products: 'products', orders: 'orders',
  roles: 'roles', media: 'app-images', ads: 'advertisements', promotions: 'promotions',
  payments: 'payments', notifications: 'notifications', audit: 'audit-logs',
}

function Brand() {
  return (
    <div className="admin-brand">
      <div className="admin-brand-mark"><span>▲</span><span>▲</span><i /></div>
      <div><strong>يافع <em>ون</em></strong><small>من الجبل إلى بيتك</small></div>
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: typeof UsersRound; tone: string }) {
  return (
    <article className={`admin-kpi ${tone}`}>
      <span><Icon /></span>
      <div><small>{label}</small><strong>{value}</strong><em>بيانات فعلية حالية</em></div>
    </article>
  )
}

function EmptyState({ section }: { section: string }) {
  const config = pageInfo[section] || pageInfo.dashboard || { title: 'لوحة الإدارة', subtitle: 'إدارة المنصة', add: 'إضافة جديد', countKey: 'orders' }
  return (
    <div className="admin-empty">
      <Boxes />
      <h3>لا توجد سجلات بعد</h3>
      <p>لن تعرض يافع ون بيانات تجريبية باعتبارها حقيقية.</p>
      {config.collection && <Link className="admin-button gold" href={`/admin/collections/${config.collection}/create`}><Plus /> {config.add || 'إضافة سجل'}</Link>}
    </div>
  )
}

function exportCSV(snapshot: AdminSnapshot) {
  const rows = [['المعرف', 'العنوان', 'التفاصيل', 'الحالة', 'التاريخ'], ...snapshot.rows.map((row) => [row.id, row.title, row.detail, row.status, row.date])]
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `yafa-one-${snapshot.section}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function AdminPortal({ snapshot }: { snapshot: AdminSnapshot }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const config = pageInfo[snapshot.section] || pageInfo.dashboard || { title: 'لوحة الإدارة', subtitle: 'إدارة المنصة', add: 'إضافة جديد', countKey: 'orders' }
  const collection = collectionBySection[snapshot.section]
  const rows = useMemo(
    () => snapshot.rows.filter((row) => `${row.title} ${row.detail} ${row.status}`.toLowerCase().includes(query.toLowerCase())),
    [query, snapshot.rows],
  )
  const totalSales = snapshot.section === 'payments' ? 'حسب السجلات' : snapshot.counts.payments

  return (
    <main className="yafa-admin" dir="rtl">
      <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="admin-side-head"><Brand /><button type="button" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)}><X /></button></div>
        <nav>
          {navigation.map(([label, section, Icon]) => (
            <Link className={snapshot.section === section ? 'active' : ''} href={`/admin/${section}`} key={section} onClick={() => setMenuOpen(false)}>
              <Icon /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-side-footer">
          <Link href="/admin"><KeyRound /> لوحة Payload الآمنة</Link>
          <span>نطاق الخدمة: يافع فقط</span>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <button className="admin-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="فتح القائمة"><Menu /></button>
          <Brand />
          <div className="admin-profile"><span>{snapshot.adminEmail}</span><small>جلسة إدارية موثقة</small></div>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div><span>الرئيسية / {config.title}</span><h1>{config.title}</h1><p>{config.subtitle}</p></div>
            <div className="admin-heading-actions">
              {collection && <Link className="admin-button outline" href={`/admin/collections/${collection}`}><LayoutGrid /> فتح الإدارة الكاملة</Link>}
              {config.collection && <Link className="admin-button gold" href={`/admin/collections/${config.collection}/create`}><Plus /> {config.add}</Link>}
            </div>
          </div>

          {snapshot.dbError && (
            <div className="alert error" style={{ margin: '14px 0', padding: '14px', borderRadius: '12px' }}>
              <AlertTriangle style={{ width: 22, height: 22, flexShrink: 0 }} />
              <div>
                <strong>خطأ في الاتصال بقاعدة البيانات</strong>
                <p style={{ margin: '3px 0 0', fontSize: '11px' }}>{snapshot.dbError}</p>
              </div>
            </div>
          )}

          {/* Manager & Status Cards matching reference UI */}
          <div style={{ display: 'grid', gap: '12px', marginBottom: '18px' }}>
            <div style={{ background: '#0e3b2b', color: 'white', borderRadius: '18px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 16px rgba(14,59,43,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#f6ebd4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0e3b2b', flexShrink: 0 }}>
                  <UserRound style={{ width: '24px', height: '24px' }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'white' }}>المدير: ماجد التركي</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#eedab0', fontWeight: 500 }}>الصلاحية: مدير عام النظام · موثق بالخادم</p>
                </div>
              </div>
              <div style={{ background: '#eedab0', color: '#0e3b2b', fontSize: '11px', fontWeight: 800, padding: '6px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #cfa45b' }}>
                <Crown style={{ width: '14px', height: '14px', color: '#92400e' }} />
                <span>Super Admin</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: '#fbf4e5', border: '1px solid #f1dfba', borderRadius: '14px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fae8c6', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CircleDollarSign style={{ width: '20px', height: '20px' }} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '12.5px', color: '#1e293b' }}>العمولة: 0 ريال (0%)</strong>
                  <small style={{ color: '#64748b', fontSize: '10px' }}>لا يتم استقطاع أي عمولة على الطلبات</small>
                </div>
              </div>

              <div style={{ background: '#f2f7f4', border: '1px solid #d9e7df', borderRadius: '14px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#e0eee6', color: '#064b3d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin style={{ width: '20px', height: '20px' }} />
                </div>
                <div>
                  <strong style={{ display: 'block', fontSize: '12.5px', color: '#064b3d' }}>المدينة الحالية: يافع</strong>
                  <small style={{ color: '#64748b', fontSize: '10px' }}>نظام مرن قابل للتوسع لمدن ومحافظات أخرى</small>
                </div>
              </div>
            </div>
          </div>

          <div className="admin-kpis">
            <KpiCard label="إجمالي المستخدمين" value={snapshot.counts.users} icon={UsersRound} tone="green" />
            <KpiCard label="المنشآت" value={snapshot.counts.establishments} icon={Store} tone="blue" />
            <KpiCard label="الطلبات" value={snapshot.counts.orders} icon={ShoppingCart} tone="gold" />
            <KpiCard label="المنتجات" value={snapshot.counts.products} icon={Package} tone="purple" />
            <KpiCard label="الإعلانات" value={snapshot.counts.advertisements} icon={Bell} tone="red" />
            <KpiCard label="المدفوعات" value={totalSales} icon={CircleDollarSign} tone="teal" />
          </div>

          {(snapshot.section === 'dashboard' || snapshot.section === 'analytics' || snapshot.section === 'reports') && (
            <div className="admin-chart-grid">
              <article className="admin-panel admin-chart">
                <div className="admin-panel-title"><div><Activity /><h2>مؤشرات المنصة الحالية</h2></div><span>بيانات مباشرة</span></div>
                <div className="admin-bars">
                  {[
                    ['المستخدمون', snapshot.counts.users],
                    ['المنشآت', snapshot.counts.establishments],
                    ['الطلبات', snapshot.counts.orders],
                    ['المنتجات', snapshot.counts.products],
                    ['الإعلانات', snapshot.counts.advertisements],
                  ].map(([label, value]) => {
                    const max = Math.max(1, ...Object.values(snapshot.counts))
                    return <div key={label}><span>{label}</span><i style={{ '--bar': `${Math.max(4, Number(value) / max * 100)}%` } as React.CSSProperties} /><b>{value}</b></div>
                  })}
                </div>
              </article>
              <article className="admin-panel admin-actions-panel">
                <div className="admin-panel-title"><div><LayoutGrid /><h2>إجراءات سريعة</h2></div></div>
                <div className="admin-quick-actions">
                  <Link href="/admin/collections/users/create"><UsersRound /> مستخدم جديد</Link>
                  <Link href="/admin/collections/establishments/create"><Building2 /> مراجعة منشأة</Link>
                  <Link href="/admin/collections/advertisements/create"><Bell /> إعلان جديد</Link>
                  <Link href="/admin/collections/app-images/create"><Image /> رفع صورة</Link>
                </div>
              </article>
            </div>
          )}

          {snapshot.section === 'media' && (
            <div className="admin-media-shortcuts">
              <Link href="/admin/collections/media"><Image /><b>مكتبة الملفات</b><span>رفع متعدد ومعاينة وحذف</span><ChevronLeft /></Link>
              <Link href="/admin/collections/app-images"><LayoutGrid /><b>مواضع الصور</b><span>الشعار والبنرات والأنشطة والمتاجر</span><ChevronLeft /></Link>
              <Link href="/admin/collections/advertisements"><Bell /><b>بنرات الإعلانات</b><span>الترتيب والنشر والإيقاف</span><ChevronLeft /></Link>
            </div>
          )}

          {snapshot.section === 'settings' && (
            <div className="admin-media-shortcuts">
              <Link href="/admin/globals/system-settings"><Settings /><b>الإعدادات العامة</b><span>العمولة والعملات والتسجيل والصيانة</span><ChevronLeft /></Link>
              <Link href="/admin/collections/exchange-rates"><CircleDollarSign /><b>أسعار الصرف</b><span>{snapshot.lastExchangeUpdate ? `آخر تحديث ${new Date(snapshot.lastExchangeUpdate).toLocaleString('ar-YE')}` : 'لم تُسجل أسعار بعد'}</span><ChevronLeft /></Link>
              <Link href="/admin/collections/categories"><Boxes /><b>الأقسام والتصنيفات</b><span>الترتيب والتفعيل والصور</span><ChevronLeft /></Link>
              <Link href="/admin/audit"><ShieldCheck /><b>سجل التدقيق</b><span>تتبّع الإجراءات الحساسة</span><ChevronLeft /></Link>
            </div>
          )}

          {snapshot.section === 'promotions' && (
            <div className="admin-media-shortcuts">
              <Link href="/admin/collections/promotions"><BadgePercent /><b>العروض والكوبونات</b><span>القيمة والمدة والحالة</span><ChevronLeft /></Link>
              <Link href="/admin/collections/referrals"><Gift /><b>شارك واربح</b><span>الإحالات والأهلية وصرف المكافآت</span><ChevronLeft /></Link>
            </div>
          )}

          {snapshot.section === 'appearance' ? (
            <AppearanceManager />
          ) : (
            <article className="admin-panel admin-data-panel">
              <div className="admin-panel-title">
                <div><ClipboardList /><h2>{snapshot.section === 'dashboard' ? 'أحدث الأنشطة' : 'السجلات'}</h2></div>
                <div className="admin-export-actions">
                  <button type="button" onClick={() => exportCSV(snapshot)}><FileSpreadsheet /> Excel / CSV</button>
                  <button type="button" onClick={() => window.print()}><Download /> تصدير PDF</button>
                </div>
              </div>
              <div className="admin-table-tools">
                <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="البحث في النتائج الحالية…" /></label>
                <span>{rows.length} سجل</span>
              </div>
              {rows.length ? (
                <div className="admin-table-scroll">
                  <table>
                    <thead><tr><th>#</th><th>العنوان</th><th>التفاصيل</th><th>الحالة</th><th>آخر تحديث</th><th>الإجراء</th></tr></thead>
                    <tbody>{rows.map((row, index) => <tr key={row.id}><td>{String(index + 1).padStart(2, '0')}</td><td><b>{row.title}</b><small>{row.id}</small></td><td>{row.detail}</td><td><span className="admin-status">{row.status}</span></td><td>{row.date}</td><td>{collection ? <Link href={`/admin/collections/${collection}/${row.id}`}>عرض وتعديل</Link> : '—'}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <EmptyState section={snapshot.section} />}
            </article>
          )}

          <div className="admin-security-note"><ShieldCheck /><div><b>الحماية والصلاحيات</b><p>جميع عمليات الإدارة الفعلية تمر عبر جلسة Payload والخادم. الإجراءات الحساسة تستفيد من تأكيد لوحة Payload وتُسجل في سجل التدقيق.</p></div></div>
          {snapshot.section === 'settings' && <div className="admin-warning"><ShieldCheck /><p>النسخ الاحتياطي والاستعادة الكاملة لقاعدة Figma Cloud غير مكشوفين كواجهة تطبيق حاليًا؛ لم نعرض زر استعادة وهميًا أو غير آمن.</p></div>}
          {snapshot.section === 'notifications' && <div className="admin-warning"><Bell /><p>يمكن إنشاء الإشعارات وجدولتها وحفظ سجلها. الإرسال الفعلي يحتاج موفر Push أو بريد وربطًا سريًا منفصلًا.</p></div>}
        </div>
      </section>
      {menuOpen && <button className="admin-overlay" aria-label="إغلاق القائمة" type="button" onClick={() => setMenuOpen(false)} />}
    </main>
  )
}
