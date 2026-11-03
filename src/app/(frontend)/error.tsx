'use client'

export default function FrontendError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="state-page" dir="rtl">
      <h1>تعذر تحميل الصفحة</h1>
      <p>حاول مرة أخرى، أو ارجع إلى الصفحة الرئيسية.</p>
      <button className="btn btn-primary" type="button" onClick={reset}>إعادة المحاولة</button>
    </main>
  )
}
