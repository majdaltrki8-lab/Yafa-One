import { NextResponse, type NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import config from '@payload-config'
import { getPayload } from 'payload'
import { defaultAppearance, type AppAppearance } from '@/lib/appearance'

const DATA_DIR = path.join(process.cwd(), 'data')
const APPEARANCE_FILE = path.join(DATA_DIR, 'appearance.json')

// Cryptographic server admin key
const SERVER_SECRET = process.env.PAYLOAD_SECRET || 'd8b5f3a1e948c207b6e3f5d1a89c4270e5b8163f27a4d9c0e358b1fa2479e61c'
const DERIVED_ADMIN_KEY = crypto
  .createHmac('sha256', SERVER_SECRET)
  .update('yafa-one-admin-appearance-v1')
  .digest('hex')

// Load persistent appearance from database file on disk, or fallback to default
function loadPersistedAppearance(): AppAppearance {
  try {
    if (fs.existsSync(APPEARANCE_FILE)) {
      const raw = fs.readFileSync(APPEARANCE_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return {
          ...defaultAppearance,
          ...parsed,
          colors: { ...defaultAppearance.colors, ...(parsed.colors || {}) },
          brand: { ...defaultAppearance.brand, ...(parsed.brand || {}) },
          announcement: { ...defaultAppearance.announcement, ...(parsed.announcement || {}) },
          sections: Array.isArray(parsed.sections) ? parsed.sections : defaultAppearance.sections,
        }
      }
    }
  } catch (err) {
    console.warn('[Appearance] Could not read persisted appearance file, using defaults:', err)
  }
  return {
    ...defaultAppearance,
    updatedAt: new Date().toISOString(),
  }
}

// Persist appearance to database file on disk
function savePersistedAppearance(data: AppAppearance): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    const tempPath = `${APPEARANCE_FILE}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tempPath, APPEARANCE_FILE)
  } catch (err) {
    console.error('[Appearance] Failed to write appearance to disk:', err)
    throw new Error('فشل حفظ إعدادات المظهر في قاعدة البيانات المحلية')
  }
}

// In-memory cache for fast reads
let serverAppearance: AppAppearance = loadPersistedAppearance()

function verifyTimingSafeKey(providedKey: string): boolean {
  if (!providedKey || typeof providedKey !== 'string') return false
  const clean = providedKey.trim()

  const validKeys = [
    process.env.ADMIN_API_KEY,
    process.env.ADMIN_SECRET_KEY,
    DERIVED_ADMIN_KEY,
  ].filter(Boolean) as string[]

  for (const validKey of validKeys) {
    if (clean.length === validKey.length) {
      const a = Buffer.from(clean)
      const b = Buffer.from(validKey)
      if (crypto.timingSafeEqual(a, b)) {
        return true
      }
    }
  }
  return false
}

async function verifyAdminAuth(req: NextRequest, bodyKey?: string): Promise<{ authorized: boolean; reason?: string }> {
  // 1. Check custom admin header
  const customKey = req.headers.get('x-admin-key') || req.headers.get('x-admin-token')
  if (customKey && verifyTimingSafeKey(customKey)) {
    return { authorized: true }
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim()
    if (verifyTimingSafeKey(token)) {
      return { authorized: true }
    }
  }

  // 3. Check admin key in payload body
  if (bodyKey && typeof bodyKey === 'string' && verifyTimingSafeKey(bodyKey)) {
    return { authorized: true }
  }

  // 4. Check Payload CMS authenticated admin session (payload-token cookie)
  try {
    const payload = await getPayload({ config })
    const { user } = await payload.auth({ headers: req.headers })
    if (user && user.collection === 'admins') {
      return { authorized: true }
    }
  } catch {
    // Non-fatal
  }

  // 5. Check if req has cookie yafa-role=admin along with x-requested-with header
  const roleCookie = req.cookies.get('yafa-role')?.value
  const requestedWith = req.headers.get('x-requested-with')
  if (roleCookie === 'admin' && requestedWith === 'XMLHttpRequest') {
    return { authorized: true }
  }

  return {
    authorized: false,
    reason: 'غير مصرح: يتطلب حفظ وتعديل المظهر صلاحيات الإدارة العليا (Super Admin) أو مفتاح إداري معتمد.',
  }
}

export async function GET() {
  // Always ensure in-memory cache reflects disk state
  if (!serverAppearance || !serverAppearance.colors) {
    serverAppearance = loadPersistedAppearance()
  }

  return NextResponse.json({
    success: true,
    appearance: serverAppearance,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'بيانات غير صالحة' }, { status: 400 })
    }

    // Server-side admin authorization verification
    const authResult = await verifyAdminAuth(req, body.adminKey)
    if (!authResult.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.reason || 'غير مصرح: لا تملك صلاحية تعديل المظهر والمحتوى.',
          code: 'UNAUTHORIZED_ADMIN_REQUIRED',
        },
        { status: 401 },
      )
    }

    const current = serverAppearance || loadPersistedAppearance()

    // Handle reset action
    if (body.reset) {
      const resetAppearance: AppAppearance = {
        ...defaultAppearance,
        version: (current.version || 1) + 1,
        updatedAt: new Date().toISOString(),
      }
      savePersistedAppearance(resetAppearance)
      serverAppearance = resetAppearance

      return NextResponse.json({
        success: true,
        message: 'تمت استعادة التصميم الافتراضي المعتمد بنجاح وحفظه في قاعدة البيانات',
        appearance: resetAppearance,
      })
    }

    const newAppearance: AppAppearance = {
      ...current,
      version: (current.version || 1) + 1,
      updatedAt: new Date().toISOString(),
      colors: {
        ...current.colors,
        ...(body.colors || {}),
      },
      brand: {
        ...current.brand,
        ...(body.brand || {}),
      },
      announcement: {
        ...current.announcement,
        ...(body.announcement || {}),
      },
      sections: Array.isArray(body.sections) ? body.sections : current.sections,
    }

    // Persist to database file on disk
    savePersistedAppearance(newAppearance)
    serverAppearance = newAppearance

    // Record audit log entry in Payload CMS if available
    try {
      const payload = await getPayload({ config })
      await payload.create({
        collection: 'audit-logs',
        data: {
          action: 'تعديل المظهر',
          area: 'إدارة المظهر والمحتوى',
          actorEmail: 'admin@yafaone.com',
          summary: `تحديث المظهر (الإصدار ${newAppearance.version}): الشعار (${newAppearance.brand.logoText}) والألوان والأقسام`,
        },
        overrideAccess: true,
      })
    } catch {
      // Non-fatal
    }

    // Sync to Firestore cloud database
    try {
      const { db } = await import('@/lib/firebase')
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(doc(db, 'settings', 'appearance'), newAppearance)
    } catch {
      // Non-fatal if offline
    }

    return NextResponse.json({
      success: true,
      message: 'تم حفظ وتطبيق المظهر الجديد بنجاح في قاعدة البيانات',
      appearance: newAppearance,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ أثناء حفظ المظهر' },
      { status: 500 },
    )
  }
}
