'use client'

import React from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <main className="state-page">
          <h1>تعذر تحميل يافع ون</h1>
          <p>حدث خطأ غير متوقع. لم يتم تنفيذ أي إجراء أو حذف أي بيانات.</p>
          <button className="btn btn-primary" type="button" onClick={() => reset()}>
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  )
}

