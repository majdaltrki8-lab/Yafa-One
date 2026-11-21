import { NextResponse, type NextRequest } from 'next/server'
import { resetPhonePasswordWithOtp, type PhoneAuthRole } from '@/lib/phone-auth-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const role = body?.role as PhoneAuthRole
    if (!['visitor', 'owner'].includes(role)) {
      return NextResponse.json({ success: false, error: 'نوع الحساب غير صالح' }, { status: 400 })
    }

    const res = resetPhonePasswordWithOtp({
      phoneRaw: String(body?.phone || ''),
      otpCode: String(body?.otpCode || body?.otp || ''),
      newPassword: String(body?.newPassword || ''),
      role,
    })

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.error || 'تعذر تغيير كلمة المرور.' },
        { status: res.status },
      )
    }

    return NextResponse.json({
      success: true,
      phone: res.phone,
      message: 'تم تحديث كلمة المرور بنجاح بعد التحقق عبر واتساب. يمكنك تسجيل الدخول الآن.',
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'حدث خطأ أثناء إعادة تعيين كلمة المرور.' },
      { status: 500 },
    )
  }
}
