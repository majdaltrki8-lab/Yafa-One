'use client'

import React, { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react'
import { AlertTriangle, Home, KeyRound, RefreshCw, Store } from 'lucide-react'
import LegacyApp from './LegacyApp'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

class LegacyErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'تعذر الاتصال بمصادر البيانات أو معالجة واجهة التطبيق.',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('LegacyRoot caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="state-page" dir="rtl">
          <AlertTriangle style={{ width: 54, height: 54, color: '#c7942c', marginBottom: 12 }} />
          <h1>تعذر تحميل بيانات التطبيق</h1>
          <p style={{ maxWidth: 450, color: '#52605b', lineHeight: 1.7, margin: '8px auto 20px' }}>
            {this.state.errorMessage || 'حدث خطأ أثناء الاتصال بالنظام أو معالجة البيانات.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' })
                if (typeof window !== 'undefined') window.location.reload()
              }}
            >
              <RefreshCw style={{ width: 18, height: 18 }} /> إعادة المحاولة
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/visitor/home'
              }}
            >
              <Home style={{ width: 18, height: 18 }} /> بوابة الزائر
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

function LoadingFallback() {
  const [tookLong, setTookLong] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setTookLong(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <main className="state-page" dir="rtl">
      <span className="spinner dark" />
      <h1>يافع ون</h1>
      <p style={{ color: '#52605b' }}>جارٍ تحميل البيانات...</p>
      {tookLong && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 420 }}>
          <small style={{ color: '#88948f', fontSize: '12px', textAlign: 'center', lineHeight: 1.6 }}>
            استغرق الاتصال بقاعدة البيانات وقتاً أطول من المعتاد في بيئة المعاينة. يمكنك الانتقال المباشر للبوابات:
          </small>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/visitor/home'
              }}
              style={{ minHeight: 36, padding: '6px 12px', fontSize: '12px' }}
            >
              <Home style={{ width: 14, height: 14 }} /> بوابة الزائر
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/auth/owner-login'
              }}
              style={{ minHeight: 36, padding: '6px 12px', fontSize: '12px' }}
            >
              <Store style={{ width: 14, height: 14 }} /> صاحب المنشأة
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.href = '/management/dashboard'
              }}
              style={{ minHeight: 36, padding: '6px 12px', fontSize: '12px' }}
            >
              <KeyRound style={{ width: 14, height: 14 }} /> بوابة الإدارة
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload()
              }}
              style={{ minHeight: 36, padding: '6px 12px', fontSize: '12px' }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} /> إعادة تحميل
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default function LegacyRoot() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <LoadingFallback />
  }

  return (
    <LegacyErrorBoundary>
      <LegacyApp />
    </LegacyErrorBoundary>
  )
}

