'use client'

export const dynamic = 'force-dynamic'
export const dynamicParams = true
export const revalidate = 0

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
        <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}>
          <h2 style={{ color: '#064b3d', fontSize: '24px', marginBottom: '16px' }}>حدث خطأ في النظام</h2>
          <p style={{ color: '#555', marginBottom: '24px' }}>عذراً، حدث خطأ غير متوقع. يرجى إعادة المحاولة.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#064b3d',
              color: '#fff',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  )
}
