import { NextResponse, type NextRequest } from 'next/server'
import {
  getClientIp,
  issueWhatsAppOtp,
  type OtpPurpose,
  type PhoneAuthRole,
} from '@/lib/phone-auth-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const phone = String(body?.phone || '')
    const role = body?.role as PhoneAuthRole
    const purpose = body?.purpose as OtpPurpose

    if (!['visitor', 'owner'].includes(role)) {
      return NextResponse.json({ success: false, error: 'نوع الحساب غير صالح' }, { status: 400 })
    }
    if (!['register', 'reset'].includes(purpose)) {
      return NextResponse.json({ success: false, error: 'غرض التحقق غير صالح' }, { status: 400 })
    }

    const result = await issueWhatsAppOtp({
      phoneRaw: phone,
      role,
      purpose,
      clientIp: getClientIp(req.headers),
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          code: result.code,
          missingEnv: result.missingEnv,
          retryAfterSeconds: result.retryAfterSeconds,
          error: result.error,
        },
        {
          status: result.status,
          headers: result.retryAfterSeconds
            ? { 'Retry-After': String(result.retryAfterSeconds) }
            : undefined,
        },
      )
    }

    return NextResponse.json({
      success: true,
      expiresInSeconds: result.expiresInSeconds,
      maskedPhone: result.maskedPhone,
      message: 'تم إرسال رمز التحقق بنجاح إلى رقمك على واتساب.',
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'تعذر إرسال رمز التحقق عبر واتساب.' },
      { status: 500 },
    )
  }
}
