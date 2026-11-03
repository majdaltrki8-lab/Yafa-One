import Link from "next/link"
import { AlertTriangle, Home, Store, ShieldCheck } from "lucide-react"

export default function NotFound() {
  return (
    <main dir="rtl" className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 py-20 text-center font-sans">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#fdf5e6] text-[#c7942c]">
        <AlertTriangle className="h-10 w-10" />
      </div>
      <span className="text-xs font-bold tracking-widest text-[#064b3d] uppercase">يافع ون | خطأ 404</span>
      <h1 className="mt-2 text-2xl font-bold text-[#064b3d] sm:text-3xl">
        الصفحة غير موجودة
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        عذراً، المسار الذي تحاول الوصول إليه غير موجود أو تم نقله. يمكنك العودة إلى إحدى بوابات المنصة الرئيسية أدناه.
      </p>

      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/"
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#064b3d] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#086351]"
        >
          <Home className="h-4 w-4" /> العودة للرئيسية (بوابة الزائر)
        </Link>
        <Link
          href="/auth/owner-login"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#c7942c] bg-[#fffaf0] px-5 text-sm font-bold text-[#9e7018] transition hover:bg-[#fdf4e2]"
        >
          <Store className="h-4 w-4" /> بوابة صاحب المنشأة
        </Link>
        <Link
          href="/auth/admin-login"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
        >
          <ShieldCheck className="h-4 w-4" /> بوابة الإدارة العامة
        </Link>
      </div>
    </main>
  )
}
