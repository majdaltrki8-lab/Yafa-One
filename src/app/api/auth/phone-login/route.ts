import { NextResponse, type NextRequest } from 'next/server'
import { getClientIp, loginPhoneAccount, type PhoneAuthRole } from '@/lib/phone-auth-server'
import { signSessionToken } from '@/lib/session'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const role = body?.role as PhoneAuthRole
    if (!['visitor', 'owner'].includes(role)) {
      return NextResponse.json({ success: false, error: 'نوع الحساب غير صالح' }, { status: 400 })
    }

    const res = loginPhoneAccount({
      phoneRaw: String(body?.phone || ''),
      password: String(body?.password || ''),
      role,
      clientIp: getClientIp(req.headers),
    })

    if (!res.ok || !res.user) {
      return NextResponse.json(
        {
          success: false,
          retryAfterSeconds: res.retryAfterSeconds,
          error: res.error || 'فشل تسجيل الدخول.',
        },
        {
          status: res.status,
          headers: res.retryAfterSeconds
            ? { 'Retry-After': String(res.retryAfterSeconds) }
            : undefined,
        },
      )
    }

    const sessionToken = await signSessionToken({
      role,
      email: res.user.fbBridgeEmail,
      uid: res.user.id,
      phone: res.user.phone,
      name: res.user.name,
      authMethod: 'phone',
    })

    const response = NextResponse.json({
      success: true,
      role,
      user: {
        id: res.user.id,
        name: res.user.name,
        phone: res.user.phone,
        phoneLocal: res.user.phoneLocal,
        establishmentId: res.user.establishmentId || null,
        establishmentName: res.user.establishmentName || null,
        district: res.user.district || 'لبعوس',
        activity: res.user.activity || 'متجر تجاري',
      },
      fbBridgeEmail: res.user.fbBridgeEmail,
      fbBridgeSecret: res.fbBridgeSecret || null,
    })

    response.cookies.set('yafa-session', sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })

    if (role === 'owner') {
      response.cookies.set('yafa-role', 'owner', {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
    }

    return response
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'حدث خطأ أثناء تسجيل الدخول.' },
      { status: 500 },
    )
  }
}
