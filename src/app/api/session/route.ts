import { NextResponse, type NextRequest } from 'next/server'
import config from '@payload-config'
import { getPayload } from 'payload'
import firebaseConfig from '../../../../firebase-applet-config.json'
import { signSessionToken, verifySessionToken, type SessionRole } from '@/lib/session'

const AUTHORIZED_ADMIN_EMAILS = new Set([
  'majdaltrki8@gmail.com',
])

async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email: string; emailVerified: boolean } | null> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    )
    if (!res.ok) return null
    const data = await res.json()
    const user = data?.users?.[0]
    if (!user?.localId || !user?.email) return null
    return {
      uid: String(user.localId),
      email: String(user.email).toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
    }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('yafa-session')?.value
  const session = await verifySessionToken(token)
  if (!session) {
    return NextResponse.json({ authenticated: false, role: null, email: null, phone: null, name: null })
  }
  return NextResponse.json({
    authenticated: true,
    role: session.role,
    email: session.email,
    uid: session.uid || null,
    phone: session.phone || null,
    name: session.name || null,
    authMethod: session.authMethod || null,
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const role = body?.role as SessionRole
    const rawEmail = String(body?.email || '').trim().toLowerCase()
    const password = String(body?.password || '')
    const firebaseIdToken = typeof body?.firebaseIdToken === 'string' ? body.firebaseIdToken : ''

    if (!['visitor', 'owner', 'admin'].includes(role)) {
      return NextResponse.json({ success: false, error: 'نوع الحساب غير صالح' }, { status: 400 })
    }

    let verifiedEmail = rawEmail
    let verifiedUid: string | undefined
    let verifiedFbEmail = false

    if (firebaseIdToken) {
      const fbUser = await verifyFirebaseIdToken(firebaseIdToken)
      if (!fbUser) {
        return NextResponse.json({ success: false, error: 'تعذر التحقق من جلسة Firebase Auth' }, { status: 401 })
      }
      verifiedEmail = fbUser.email
      verifiedUid = fbUser.uid
      verifiedFbEmail = fbUser.emailVerified
    }

    if (role === 'admin') {
      let payloadAdminOk = false
      if (password && verifiedEmail) {
        try {
          const payload = await getPayload({ config })
          const res = await payload.login({
            collection: 'admins',
            data: { email: verifiedEmail, password },
          })
          if (res?.user) payloadAdminOk = true
        } catch {
          payloadAdminOk = false
        }
      }

      const hasVerifiedFirebaseAdmin =
        Boolean(verifiedUid) && verifiedFbEmail && AUTHORIZED_ADMIN_EMAILS.has(verifiedEmail)
      if (!hasVerifiedFirebaseAdmin && !payloadAdminOk) {
        return NextResponse.json(
          { success: false, error: 'غير مصرح: يتطلب الدخول الموثق عبر Firebase بحساب المدير المعتمد أو بيانات مدير Payload الصحيحة' },
          { status: 403 },
        )
      }
    } else {
      // Visitor & Owner sessions require a valid Firebase ID token OR must be issued via phone-login / phone-register
      if (!verifiedUid) {
        return NextResponse.json(
          { success: false, error: 'يرجى تسجيل الدخول برقم الجوال وكلمة المرور أو عبر جلسة موثقة.' },
          { status: 401 },
        )
      }
    }

    const sessionToken = await signSessionToken({
      role,
      email: verifiedEmail,
      uid: verifiedUid,
    })

    const response = NextResponse.json({
      success: true,
      role,
      email: verifiedEmail,
      uid: verifiedUid || null,
    })

    response.cookies.set('yafa-session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })

    if (role === 'admin' || role === 'owner') {
      response.cookies.set('yafa-role', role, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    }

    return response
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'حدث خطأ أثناء إنشاء الجلسة' },
      { status: 500 },
    )
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('yafa-session', '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'lax' })
  response.cookies.set('yafa-role', '', { path: '/', maxAge: 0, sameSite: 'lax' })
  response.cookies.set('payload-token', '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'lax' })
  return response
}
