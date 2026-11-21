'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f7f8f6',
          color: '#064b3d',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: '24px',
        }}
      >
        <main
          style={{
            maxWidth: '420px',
            width: '100%',
            backgroundColor: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #dbe4df',
            padding: '28px 24px',
            textAlign: 'center',
            boxShadow: '0 12px 30px rgba(6, 75, 61, 0.08)',
          }}
        >
          <h1 style={{ margin: '0 0 10px', fontSize: '22px', fontWeight: 800 }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: '14px', lineHeight: 1.7, color: '#4b5c56' }}>
            تعذر عرض الصفحة حالياً. يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                backgroundColor: '#064b3d',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              إعادة المحاولة
            </button>
            <a
              href="/visitor/home"
              style={{
                backgroundColor: '#c7942c',
                color: '#03372d',
                textDecoration: 'none',
                borderRadius: '12px',
                padding: '10px 18px',
                fontSize: '14px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              العودة للرئيسية
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
