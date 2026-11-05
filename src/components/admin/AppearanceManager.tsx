'use client'

import React, { useEffect, useState } from 'react'
import {
  Palette,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  CheckCircle2,
  Sparkles,
  Layout,
  Image as ImageIcon,
  Megaphone,
  Smartphone,
  ExternalLink,
} from 'lucide-react'
import {
  defaultAppearance,
  colorPresets,
  getLocalAppearance,
  setLocalAppearance,
  type AppAppearance,
  type HomeSection,
} from '@/lib/appearance'

export default function AppearanceManager() {
  const [appearance, setAppearance] = useState<AppAppearance>(defaultAppearance)
  const [activeTab, setActiveTab] = useState<'colors' | 'brand' | 'sections' | 'announcement' | 'preview'>('colors')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Load from local storage and backend on mount
  useEffect(() => {
    const local = getLocalAppearance()
    setAppearance(local)

    fetch('/api/appearance')
      .then((res) => {
        if (!res.ok) return null
        const ct = res.headers.get('content-type')
        if (ct && ct.includes('application/json')) return res.json()
        return null
      })
      .then((data) => {
        if (data?.success && data?.appearance) {
          setAppearance(data.appearance)
          setLocalAppearance(data.appearance)
        }
      })
      .catch(() => {
        // fallback to local
      })
  }, [])

  const handleColorChange = (key: keyof typeof appearance.colors, value: string) => {
    setAppearance((prev) => ({
      ...prev,
      colors: {
        ...prev.colors,
        [key]: value,
      },
    }))
  }

  const applyPreset = (presetColors: typeof appearance.colors) => {
    setAppearance((prev) => ({
      ...prev,
      colors: { ...presetColors },
    }))
  }

  const handleBrandChange = (key: keyof typeof appearance.brand, value: string) => {
    setAppearance((prev) => ({
      ...prev,
      brand: {
        ...prev.brand,
        [key]: value,
      },
    }))
  }

  const handleAnnouncementChange = (key: keyof typeof appearance.announcement, value: any) => {
    setAppearance((prev) => ({
      ...prev,
      announcement: {
        ...prev.announcement,
        [key]: value,
      },
    }))
  }

  const toggleSectionVisibility = (index: number) => {
    setAppearance((prev) => {
      const nextSections = [...prev.sections]
      nextSections[index] = {
        ...nextSections[index],
        visible: !nextSections[index].visible,
      }
      return { ...prev, sections: nextSections }
    })
  }

  const moveSection = (index: number, direction: 'up' | 'down') => {
    setAppearance((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.sections.length) return prev

      const nextSections = [...prev.sections]
      const temp = nextSections[index]
      nextSections[index] = nextSections[targetIndex]
      nextSections[targetIndex] = temp

      // update orders
      return {
        ...prev,
        sections: nextSections.map((sec, idx) => ({ ...sec, order: idx + 1 })),
      }
    })
  }

  const resetToDefault = async () => {
    if (confirm('هل أنت متأكد من استعادة التصميم الافتراضي المعتمد لمنصة يافع ون؟')) {
      try {
        setSaving(true)
        setAppearance(defaultAppearance)
        setLocalAppearance(defaultAppearance)
        const res = await fetch('/api/appearance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-requested-with': 'XMLHttpRequest',
          },
          credentials: 'include',
          body: JSON.stringify({ reset: true }),
        })
        const ct = res.headers.get('content-type')
        const data = ct && ct.includes('application/json') ? await res.json() : null
        if (data?.success) {
          setSaveSuccess(true)
          setTimeout(() => setSaveSuccess(false), 3000)
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'فشلت استعادة الإعدادات')
      } finally {
        setSaving(false)
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMsg('')
    setSaveSuccess(false)

    try {
      // 1. Save to local storage and update DOM directly
      setLocalAppearance(appearance)

      // 2. Persist to API with admin credentials
      const res = await fetch('/api/appearance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(appearance),
      })

      const ct = res.headers.get('content-type')
      const data = ct && ct.includes('application/json') ? await res.json() : null
      if (res.ok && data?.success) {
        setSaveSuccess(true)
        if (data.appearance) {
          setAppearance(data.appearance)
          setLocalAppearance(data.appearance)
        }
        setTimeout(() => setSaveSuccess(false), 4000)
      } else {
        throw new Error(data?.error || 'فشل الحفظ على الخادم: غير مصرح')
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-appearance-panel" style={{ display: 'grid', gap: '20px' }}>
      {/* Top Banner Notice */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064b3d, #0e5b4b)',
          color: 'white',
          padding: '20px',
          borderRadius: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 8px 24px rgba(6,75,61,0.18)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <Sparkles style={{ color: '#eedab0', width: 22, height: 22 }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'white' }}>
              نظام إدارة المظهر والمحتوى الحي (Live Appearance Engine)
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: '#eedab0', lineHeight: 1.6 }}>
            فصل تام بين طبقة التصميم ومنطق التطبيق وقاعدة البيانات. التعديلات المطبقة هنا تنعكس فورياً
            على واجهات الزوار والمتاجر دون الحاجة لتحديث التطبيق أو المساس ببيانات المستخدمين والطلبات.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={resetToDefault}
            className="btn btn-outline"
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              minHeight: '40px',
              fontSize: '12px',
              borderRadius: '10px',
            }}
          >
            <RotateCcw style={{ width: 15 }} />
            استعادة الافتراضي
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-gold"
            style={{
              background: 'linear-gradient(135deg, #c7942c, #e0b04c)',
              color: '#064b3d',
              fontWeight: 800,
              minHeight: '40px',
              fontSize: '12px',
              borderRadius: '10px',
              border: 0,
            }}
          >
            <Save style={{ width: 16 }} />
            {saving ? 'جارِ الحفظ والنشر...' : 'حفظ ونشر التعديلات فوراً'}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div
          className="alert success"
          style={{
            margin: 0,
            padding: '14px',
            borderRadius: '12px',
            background: '#e8f8f0',
            border: '1px solid #a3e2c3',
            color: '#065f46',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 style={{ width: 20, height: 20 }} />
          <strong>تم حفظ المظهر وتطبيقه مباشرة على المنصة بنجاح تام!</strong>
        </div>
      )}

      {errorMsg && (
        <div className="alert error" style={{ margin: 0, padding: '14px', borderRadius: '12px' }}>
          <strong>خطأ: </strong> {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '8px',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('colors')}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 0,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: activeTab === 'colors' ? '#064b3d' : '#f1f5f9',
            color: activeTab === 'colors' ? 'white' : '#475569',
            transition: 'all 0.2s',
          }}
        >
          <Palette style={{ width: 16 }} />
          الألوان والسمات
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('brand')}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 0,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: activeTab === 'brand' ? '#064b3d' : '#f1f5f9',
            color: activeTab === 'brand' ? 'white' : '#475569',
            transition: 'all 0.2s',
          }}
        >
          <ImageIcon style={{ width: 16 }} />
          الشعارات والوسائط
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sections')}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 0,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: activeTab === 'sections' ? '#064b3d' : '#f1f5f9',
            color: activeTab === 'sections' ? 'white' : '#475569',
            transition: 'all 0.2s',
          }}
        >
          <Layout style={{ width: 16 }} />
          ترتيب وإظهار الأقسام
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('announcement')}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 0,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: activeTab === 'announcement' ? '#064b3d' : '#f1f5f9',
            color: activeTab === 'announcement' ? 'white' : '#475569',
            transition: 'all 0.2s',
          }}
        >
          <Megaphone style={{ width: 16 }} />
          شريط التنبيهات العاجلة
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: 0,
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: activeTab === 'preview' ? '#064b3d' : '#f1f5f9',
            color: activeTab === 'preview' ? 'white' : '#475569',
            transition: 'all 0.2s',
          }}
        >
          <Smartphone style={{ width: 16 }} />
          معاينة المظهر الحي
        </button>
      </div>

      {/* TAB 1: COLORS */}
      {activeTab === 'colors' && (
        <div style={{ display: 'grid', gap: '24px' }}>
          {/* Preset Palettes */}
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: '#1e293b' }}>
              السمات والأنماط اللونية الجاهزة:
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {colorPresets.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => applyPreset(preset.colors)}
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '14px',
                    padding: '14px',
                    cursor: 'pointer',
                    background: 'white',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    transition: 'transform 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#c7942c'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#cbd5e1'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <strong style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#0f172a' }}>
                    {preset.name}
                  </strong>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '6px', background: preset.colors.forest }} title="الأخضر الأساسي" />
                    <div style={{ width: 26, height: 26, borderRadius: '6px', background: preset.colors.forestDark }} title="الأخضر الداكن" />
                    <div style={{ width: 26, height: 26, borderRadius: '6px', background: preset.colors.gold }} title="الذهبي" />
                    <div style={{ width: 26, height: 26, borderRadius: '6px', background: preset.colors.goldPale }} title="الذهبي الفاتح" />
                    <div style={{ width: 26, height: 26, borderRadius: '6px', background: preset.colors.bgLight, border: '1px solid #e2e8f0' }} title="الخلفية" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Color Pickers */}
          <div style={{ background: 'white', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: '#1e293b' }}>
              تخصيص الألوان بدقة:
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  اللون الأساسي (Primary Forest):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    value={appearance.colors.forest}
                    onChange={(e) => handleColorChange('forest', e.target.value)}
                    style={{ width: '48px', height: '42px', padding: 0, borderRadius: '8px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={appearance.colors.forest}
                    onChange={(e) => handleColorChange('forest', e.target.value)}
                    style={{ minHeight: '42px', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  اللون الأساسي الداكن (Forest Dark):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    value={appearance.colors.forestDark}
                    onChange={(e) => handleColorChange('forestDark', e.target.value)}
                    style={{ width: '48px', height: '42px', padding: 0, borderRadius: '8px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={appearance.colors.forestDark}
                    onChange={(e) => handleColorChange('forestDark', e.target.value)}
                    style={{ minHeight: '42px', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  اللون الذهبي اليافعي (Accent Gold):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    value={appearance.colors.gold}
                    onChange={(e) => handleColorChange('gold', e.target.value)}
                    style={{ width: '48px', height: '42px', padding: 0, borderRadius: '8px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={appearance.colors.gold}
                    onChange={(e) => handleColorChange('gold', e.target.value)}
                    style={{ minHeight: '42px', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  لون خلفية التطبيق (Background):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="color"
                    value={appearance.colors.bgLight}
                    onChange={(e) => handleColorChange('bgLight', e.target.value)}
                    style={{ width: '48px', height: '42px', padding: 0, borderRadius: '8px', cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={appearance.colors.bgLight}
                    onChange={(e) => handleColorChange('bgLight', e.target.value)}
                    style={{ minHeight: '42px', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BRAND & ASSETS */}
      {activeTab === 'brand' && (
        <div style={{ background: 'white', padding: '22px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'grid', gap: '18px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#1e293b' }}>
            تخصيص الهوية والروابط البصرية:
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                اسم المنصة الرئيسي:
              </label>
              <input
                type="text"
                value={appearance.brand.platformName}
                onChange={(e) => handleBrandChange('platformName', e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                شعار المنصة اللفظي (Slogan / Tagline):
              </label>
              <input
                type="text"
                value={appearance.brand.platformTagline}
                onChange={(e) => handleBrandChange('platformTagline', e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                مسار / رابط أيقونة التطبيق (App Icon):
              </label>
              <input
                type="text"
                value={appearance.brand.appIconUrl}
                onChange={(e) => handleBrandChange('appIconUrl', e.target.value)}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                رابط صورة البانر الترحيبي (Welcome Banner):
              </label>
              <input
                type="text"
                value={appearance.brand.welcomeBannerUrl}
                onChange={(e) => handleBrandChange('welcomeBannerUrl', e.target.value)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                رابط خلفية المناظر الجبلية الطبيعية (Scenic Mountains Background):
              </label>
              <input
                type="text"
                value={appearance.brand.scenicLandscapeUrl}
                onChange={(e) => handleBrandChange('scenicLandscapeUrl', e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SECTIONS ORDER & VISIBILITY */}
      {activeTab === 'sections' && (
        <div style={{ background: 'white', padding: '22px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px 0', color: '#1e293b' }}>
              التحكم في ظهور وترتيب أقسام الصفحة الرئيسية:
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
              يمكنك بسهولة إعادة ترتيب أقسام الصفحة الرئيسية أو إخفاء أي قسم مؤقتاً دون التأثير على بياناته
            </p>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {appearance.sections.map((section, idx) => (
              <div
                key={section.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: section.visible ? '#f8fafc' : '#f1f5f9',
                  opacity: section.visible ? 1 : 0.65,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: section.visible ? '#064b3d' : '#94a3b8',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 800,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <strong style={{ fontSize: '14px', color: '#1e293b', display: 'block' }}>
                      {section.title}
                    </strong>
                    <small style={{ color: '#64748b', fontSize: '11px' }}>{section.subtitle}</small>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Order Controls */}
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveSection(idx, 'up')}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: 'white',
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                      opacity: idx === 0 ? 0.4 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="تحريك لأعلى"
                  >
                    <ArrowUp style={{ width: 14 }} />
                  </button>

                  <button
                    type="button"
                    disabled={idx === appearance.sections.length - 1}
                    onClick={() => moveSection(idx, 'down')}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: 'white',
                      cursor: idx === appearance.sections.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: idx === appearance.sections.length - 1 ? 0.4 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="تحريك لأسفل"
                  >
                    <ArrowDown style={{ width: 14 }} />
                  </button>

                  {/* Toggle Visibility */}
                  <button
                    type="button"
                    onClick={() => toggleSectionVisibility(idx)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 0,
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: section.visible ? '#dcfce7' : '#fee2e2',
                      color: section.visible ? '#166534' : '#991b1b',
                    }}
                  >
                    {section.visible ? (
                      <>
                        <Eye style={{ width: 14 }} />
                        ظاهر
                      </>
                    ) : (
                      <>
                        <EyeOff style={{ width: 14 }} />
                        مخفي
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: ANNOUNCEMENT BAR */}
      {activeTab === 'announcement' && (
        <div style={{ background: 'white', padding: '22px', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'grid', gap: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: '#1e293b' }}>
            شريط الإعلانات والتنبيهات أعلى التطبيق:
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              id="ann-enabled"
              checked={appearance.announcement.enabled}
              onChange={(e) => handleAnnouncementChange('enabled', e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            <label htmlFor="ann-enabled" style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              تفعيل شريط التنبيهات في واجهة المستخدم
            </label>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              نص الإعلان أو التنبيه:
            </label>
            <input
              type="text"
              value={appearance.announcement.text}
              onChange={(e) => handleAnnouncementChange('text', e.target.value)}
              placeholder="اكتب التنبيه هنا..."
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              رابط الانتقال عند النقر (مسار اختياري):
            </label>
            <input
              type="text"
              value={appearance.announcement.link}
              onChange={(e) => handleAnnouncementChange('link', e.target.value)}
              placeholder="/visitor/promotions"
            />
          </div>
        </div>
      )}

      {/* TAB 5: LIVE MOBILE PREVIEW */}
      {activeTab === 'preview' && (
        <div style={{ background: 'white', padding: '22px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: '#1e293b' }}>
            المعاينة الحية للمظهر الجديد:
          </h3>

          <div
            style={{
              maxWidth: '380px',
              margin: '0 auto',
              border: '10px solid #1e293b',
              borderRadius: '36px',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              background: appearance.colors.bgLight,
            }}
          >
            {/* Mobile Header Bar */}
            <div
              style={{
                background: appearance.colors.forest,
                color: 'white',
                padding: '16px',
                textAlign: 'center',
                position: 'relative',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: 800 }}>
                {appearance.brand.logoText}{' '}
                <span style={{ color: appearance.colors.gold }}>ONE</span>
              </div>
              <small style={{ color: appearance.colors.goldPale, fontSize: '10px', display: 'block', marginTop: '2px' }}>
                {appearance.brand.platformTagline}
              </small>
            </div>

            {/* Announcement if active */}
            {appearance.announcement.enabled && (
              <div
                style={{
                  background: appearance.colors.gold,
                  color: appearance.colors.forestDark,
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '6px 10px',
                  textAlign: 'center',
                }}
              >
                {appearance.announcement.text}
              </div>
            )}

            {/* Preview Body with Configured Sections */}
            <div style={{ padding: '14px', display: 'grid', gap: '10px', maxHeight: '420px', overflowY: 'auto' }}>
              {appearance.sections
                .filter((s) => s.visible)
                .map((sec, idx) => (
                  <div
                    key={sec.id}
                    style={{
                      background: 'white',
                      borderRadius: '12px',
                      padding: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: appearance.colors.gold,
                          color: '#064b3d',
                          fontSize: '10px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <strong style={{ fontSize: '12px', color: appearance.colors.forest }}>{sec.title}</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '10px', color: '#64748b' }}>{sec.subtitle}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
