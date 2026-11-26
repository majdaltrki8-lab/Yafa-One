'use client'

export const dynamic = 'force-dynamic'

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
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2>حدث خطأ غير متوقع</h2>
          <button onClick={() => reset()} style={{ padding: '10px 20px', marginTop: 15, background: '#064b3d', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  )
}
