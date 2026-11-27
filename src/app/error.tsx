'use client'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif', direction: 'rtl', color: '#064b3d', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '12px' }}>حدث خطأ في النظام</h2>
      <p style={{ color: '#555', marginBottom: '24px' }}>عذراً، حدث خطأ غير متوقع. يرجى إعادة المحاولة أو العودة للرئيسية.</p>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{ background: '#064b3d', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          إعادة المحاولة
        </button>
        <a
          href="/visitor/home"
          style={{ background: '#c7942c', color: '#03372d', textDecoration: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', display: 'inline-block' }}
        >
          الرئيسية
        </a>
      </div>
    </div>
  )
}
