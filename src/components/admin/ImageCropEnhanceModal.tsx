'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Crop,
  Eye,
  Image as ImageIcon,
  Maximize2,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { AspectPreset } from '@/lib/appImages'

interface ImageCropEnhanceModalProps {
  file: File
  slotTitle: string
  placementLabel: string
  defaultAspect: AspectPreset
  existingImageUrl?: string
  modeLabel: string // e.g. 'تغيير الصورة' or 'إضافة صورة'
  initialLabel?: string
  onClose: () => void
  onPublish: (result: {
    blob: Blob
    previewUrl: string
    label: string
    width: number
    height: number
  }) => Promise<void>
}

const ASPECT_OPTIONS: Array<{ id: AspectPreset; label: string; ratio: number | null }> = [
  { id: '16:9', label: '16:9 بنر', ratio: 16 / 9 },
  { id: '4:3', label: '4:3 بطاقة', ratio: 4 / 3 },
  { id: '1:1', label: '1:1 مربع', ratio: 1 },
  { id: 'free', label: 'حُر (أصلي)', ratio: null },
]

function applySharpenConvolution(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount: number, // 0..100
) {
  if (amount <= 0 || width <= 2 || height <= 2) return
  const strength = Math.min(1, Math.max(0, amount / 100)) * 0.85
  const imgData = ctx.getImageData(0, 0, width, height)
  const src = imgData.data
  const dst = new Uint8ClampedArray(src.length)

  // Copy borders
  dst.set(src)

  const kernelCenter = 1 + 4 * strength
  const kernelSide = -strength

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width
    for (let x = 1; x < width - 1; x++) {
      const idx = (rowOffset + x) * 4
      const top = idx - width * 4
      const bottom = idx + width * 4
      const left = idx - 4
      const right = idx + 4

      for (let c = 0; c < 3; c++) {
        const val =
          src[idx + c] * kernelCenter +
          (src[top + c] + src[bottom + c] + src[left + c] + src[right + c]) * kernelSide
        dst[idx + c] = val < 0 ? 0 : val > 255 ? 255 : val
      }
      dst[idx + 3] = src[idx + 3]
    }
  }

  imgData.data.set(dst)
  ctx.putImageData(imgData, 0, 0)
}

export default function ImageCropEnhanceModal({
  file,
  slotTitle,
  placementLabel,
  defaultAspect,
  existingImageUrl,
  modeLabel,
  initialLabel = '',
  onClose,
  onPublish,
}: ImageCropEnhanceModalProps) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [origObjectUrl, setOrigObjectUrl] = useState<string>('')
  const [aspect, setAspect] = useState<AspectPreset>(defaultAspect || '16:9')
  const [maxDimension, setMaxDimension] = useState<number>(1400)
  const [zoom, setZoom] = useState<number>(1)
  const [panX, setPanX] = useState<number>(0) // -1..1
  const [panY, setPanY] = useState<number>(0) // -1..1
  const [rotation, setRotation] = useState<number>(0) // 0, 90, 180, 270
  const [brightness, setBrightness] = useState<number>(100)
  const [contrast, setContrast] = useState<number>(100)
  const [saturation, setSaturation] = useState<number>(100)
  const [sharpen, setSharpen] = useState<number>(15)
  const [label, setLabel] = useState<string>(initialLabel)

  const [step, setStep] = useState<'edit' | 'preview'>('edit')
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string>('')
  const [stagedDimensions, setStagedDimensions] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [errorMsg, setErrorMsg] = useState<string>('')

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; origPanX: number; origPanY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origPanX: 0,
    origPanY: 0,
  })

  // Load selected file into Image object
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setOrigObjectUrl(url)
    const img = new window.Image()
    img.onload = () => {
      setImgEl(img)
    }
    img.onerror = () => {
      setErrorMsg('تعذرت قراءة ملف الصورة. تأكد من أن الملف صورة صالحة.')
    }
    img.src = url

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  const getOutputSize = useCallback(
    (img: HTMLImageElement, targetMax: number): { width: number; height: number } => {
      const isRotated90 = rotation === 90 || rotation === 270
      const naturalW = isRotated90 ? img.naturalHeight : img.naturalWidth
      const naturalH = isRotated90 ? img.naturalWidth : img.naturalHeight

      const selectedOpt = ASPECT_OPTIONS.find((o) => o.id === aspect)
      const ratio = selectedOpt?.ratio ?? naturalW / Math.max(1, naturalH)

      if (ratio >= 1) {
        const width = targetMax
        const height = Math.max(120, Math.round(targetMax / ratio))
        return { width, height }
      }
      const height = targetMax
      const width = Math.max(120, Math.round(targetMax * ratio))
      return { width, height }
    },
    [aspect, rotation],
  )

  const renderToCanvas = useCallback(
    (canvas: HTMLCanvasElement, targetMax: number, applySharpen: boolean) => {
      if (!imgEl) return { width: 0, height: 0 }
      const { width, height } = getOutputSize(imgEl, targetMax)
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return { width, height }

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      const isRotated90 = rotation === 90 || rotation === 270
      const srcW = isRotated90 ? imgEl.naturalHeight : imgEl.naturalWidth
      const srcH = isRotated90 ? imgEl.naturalWidth : imgEl.naturalHeight

      // Cover scale
      const baseScale = Math.max(width / srcW, height / srcH)
      const effectiveScale = baseScale * zoom

      const drawnW = imgEl.naturalWidth * effectiveScale
      const drawnH = imgEl.naturalHeight * effectiveScale

      const effBoxW = isRotated90 ? drawnH : drawnW
      const effBoxH = isRotated90 ? drawnW : drawnH

      const maxOffsetX = Math.max(0, (effBoxW - width) / 2) + width * 0.2
      const maxOffsetY = Math.max(0, (effBoxH - height) / 2) + height * 0.2

      ctx.save()
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
      ctx.translate(width / 2 + panX * maxOffsetX, height / 2 + panY * maxOffsetY)
      ctx.rotate((rotation * Math.PI) / 180)
      ctx.drawImage(imgEl, -drawnW / 2, -drawnH / 2, drawnW, drawnH)
      ctx.restore()

      if (applySharpen && sharpen > 0) {
        applySharpenConvolution(ctx, width, height, sharpen)
      }

      return { width, height }
    },
    [imgEl, getOutputSize, zoom, rotation, brightness, contrast, saturation, panX, panY, sharpen],
  )

  // Live preview render on edit canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas || !imgEl || step !== 'edit') return
    renderToCanvas(canvas, 640, sharpen > 0)
  }, [imgEl, step, renderToCanvas, sharpen])

  const handleAutoEnhance = () => {
    setBrightness(104)
    setContrast(112)
    setSaturation(108)
    setSharpen(40)
  }

  const handleResetEdits = () => {
    setAspect(defaultAspect || '16:9')
    setZoom(1)
    setPanX(0)
    setPanY(0)
    setRotation(0)
    setBrightness(100)
    setContrast(100)
    setSaturation(100)
    setSharpen(15)
  }

  const buildFinalBlob = async (): Promise<{ blob: Blob; previewUrl: string; width: number; height: number }> => {
    if (!imgEl) throw new Error('الصورة غير جاهزة بعد.')
    const offscreen = document.createElement('canvas')
    const { width, height } = renderToCanvas(offscreen, maxDimension, true)

    const blob = await new Promise<Blob>((resolve, reject) => {
      offscreen.toBlob(
        (b) => {
          if (b) return resolve(b)
          offscreen.toBlob(
            (jpgBlob) => (jpgBlob ? resolve(jpgBlob) : reject(new Error('تعذر توليد ملف الصورة النهائي'))),
            'image/jpeg',
            0.9,
          )
        },
        'image/webp',
        0.9,
      )
    })

    const previewUrl = offscreen.toDataURL('image/webp', 0.88)
    return { blob, previewUrl, width, height }
  }

  const handlePreparePreview = async () => {
    setErrorMsg('')
    try {
      const res = await buildFinalBlob()
      setStagedPreviewUrl(res.previewUrl)
      setStagedDimensions({ w: res.width, h: res.height })
      setStep('preview')
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر تجهيز المعاينة')
    }
  }

  const handleConfirmPublish = async () => {
    setErrorMsg('')
    setSubmitting(true)
    try {
      const { blob, previewUrl, width, height } = await buildFinalBlob()
      await onPublish({
        blob,
        previewUrl,
        label: label.trim() || slotTitle,
        width,
        height,
      })
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل رفع ونشر الصورة. يرجى المحاولة مرة أخرى.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-[#e3e9e4] overflow-hidden my-auto max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="bg-[#064b3d] text-white px-4 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#c7942c] text-[#03372d] flex items-center justify-center shrink-0">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold leading-tight">
                {modeLabel} — {slotTitle}
              </h2>
              <p className="text-[11px] text-[#f5ead0] mt-0.5 line-clamp-1">{placementLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"
            aria-label="إغلاق المحرر"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 bg-[#f7faf7]">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
              {errorMsg}
            </div>
          )}

          {step === 'edit' ? (
            <>
              {/* Interactive Canvas Crop Box */}
              <div className="bg-[#0d1f1a] rounded-2xl p-3 flex flex-col items-center justify-center border border-emerald-950/30 relative">
                <div className="text-[10.5px] text-[#f5ead0] mb-2 flex items-center gap-2">
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>اسحب الصورة لضبط القص، واستخدم شريط التكبير والأبعاد أدناه</span>
                </div>
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full max-h-[260px] rounded-xl shadow-lg border border-white/20 cursor-grab active:cursor-grabbing touch-none bg-white"
                  onPointerDown={(e) => {
                    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
                    dragState.current = {
                      dragging: true,
                      startX: e.clientX,
                      startY: e.clientY,
                      origPanX: panX,
                      origPanY: panY,
                    }
                  }}
                  onPointerMove={(e) => {
                    if (!dragState.current.dragging) return
                    const dx = (e.clientX - dragState.current.startX) / 140
                    const dy = (e.clientY - dragState.current.startY) / 140
                    setPanX(Math.max(-1, Math.min(1, dragState.current.origPanX + dx)))
                    setPanY(Math.max(-1, Math.min(1, dragState.current.origPanY + dy)))
                  }}
                  onPointerUp={() => {
                    dragState.current.dragging = false
                  }}
                  onPointerCancel={() => {
                    dragState.current.dragging = false
                  }}
                />
              </div>

              {/* Aspect Ratio & Dimension Controls */}
              <div className="bg-white rounded-2xl p-3 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#064b3d] flex items-center gap-1.5">
                    <Crop className="w-4 h-4 text-[#c7942c]" />
                    <span>نسبة القص والأبعاد</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ASPECT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAspect(opt.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                          aspect === opt.id
                            ? 'bg-[#064b3d] text-white border-[#064b3d]'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Zoom & Rotate & Quality */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                      <span className="flex items-center gap-1">
                        <ZoomIn className="w-3.5 h-3.5 text-[#064b3d]" />
                        التكبير: {Math.round(zoom * 100)}%
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setZoom((z) => Math.max(1, Number((z - 0.1).toFixed(2))))}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200"
                          aria-label="تصغير"
                        >
                          <ZoomOut className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoom((z) => Math.min(3, Number((z + 0.1).toFixed(2))))}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200"
                          aria-label="تكبير"
                        >
                          <ZoomIn className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-[#064b3d]"
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        دقة الأبعاد النهائية
                      </label>
                      <select
                        value={maxDimension}
                        onChange={(e) => setMaxDimension(Number(e.target.value))}
                        className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white font-semibold"
                      >
                        <option value={1600}>فائقة الدقة (1600px)</option>
                        <option value={1400}>جودة عالية (1400px)</option>
                        <option value={1080}>قياسية سريعة (1080px)</option>
                        <option value={800}>خفيفة (800px)</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      className="px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> تدوير
                    </button>
                  </div>
                </div>
              </div>

              {/* Clarity & Quality Enhancement */}
              <div className="bg-white rounded-2xl p-3 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#064b3d] flex items-center gap-1.5">
                    <SlidersHorizontal className="w-4 h-4 text-[#c7942c]" />
                    <span>تحسين الوضوح والألوان</span>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleAutoEnhance}
                      className="px-2.5 py-1 rounded-lg bg-[#faf3e0] border border-[#e7cf96] text-[#7a540e] text-[11px] font-bold flex items-center gap-1 hover:bg-[#f4e7c3]"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> تحسين تلقائي
                    </button>
                    <button
                      type="button"
                      onClick={handleResetEdits}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200"
                    >
                      إعادة ضبط
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] font-bold text-slate-700">
                  <label className="block">
                    <span>الحدة والوضوح: {sharpen}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sharpen}
                      onChange={(e) => setSharpen(Number(e.target.value))}
                      className="w-full accent-[#c7942c] mt-1"
                    />
                  </label>
                  <label className="block">
                    <span>التباين: {contrast}%</span>
                    <input
                      type="range"
                      min="80"
                      max="150"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full accent-[#064b3d] mt-1"
                    />
                  </label>
                  <label className="block">
                    <span>السطوع: {brightness}%</span>
                    <input
                      type="range"
                      min="80"
                      max="140"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full accent-[#064b3d] mt-1"
                    />
                  </label>
                  <label className="block">
                    <span>التشبع: {saturation}%</span>
                    <input
                      type="range"
                      min="70"
                      max="150"
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="w-full accent-[#064b3d] mt-1"
                    />
                  </label>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    وصف / تسمية الصورة (اختياري)
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="مثال: بنر العروض الصيفية الجديد"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>
            </>
          ) : (
            /* Step 2: Side-by-side Preview Before Publish */
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 flex items-center gap-2 font-semibold">
                <Eye className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  معاينة قبل النشر — تأكد من وضوح الصورة وأبعادها ({stagedDimensions.w} × {stagedDimensions.h} بكسل) قبل رفعها ونشرها لجميع المستخدمين.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white rounded-2xl p-3 border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{existingImageUrl ? 'الصورة الحالية في التطبيق' : 'الصورة الأصلية المرفوعة'}</span>
                  </div>
                  <div className="h-44 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                    <img
                      src={existingImageUrl || origObjectUrl}
                      alt="الصورة السابقة"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-3 border-2 border-[#c7942c]">
                  <div className="text-[11px] font-extrabold text-[#064b3d] mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#c7942c]" />
                    <span>الصورة الجديدة بعد القص والتحسين</span>
                  </div>
                  <div className="h-44 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                    <img
                      src={stagedPreviewUrl}
                      alt="معاينة الصورة الجديدة"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {step === 'edit' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
              >
                إلغاء
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePreparePreview}
                  disabled={!imgEl}
                  className="px-4 py-2.5 rounded-xl bg-[#faf3e0] border border-[#c7942c] text-[#064b3d] text-xs font-extrabold flex items-center gap-1.5 hover:bg-[#f4e7c3]"
                >
                  <Eye className="w-4 h-4" /> معاينة قبل النشر
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPublish}
                  disabled={!imgEl || submitting}
                  className="px-4 py-2.5 rounded-xl bg-[#064b3d] text-white text-xs font-extrabold flex items-center gap-1.5 hover:bg-[#04372c] disabled:opacity-60"
                >
                  <Upload className="w-4 h-4" /> {submitting ? 'جارٍ الرفع والنشر...' : 'حفظ ونشر فوراً'}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('edit')}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
              >
                العودة للتعديل والقص
              </button>
              <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-[#064b3d] text-white text-xs font-extrabold flex items-center gap-1.5 hover:bg-[#04372c] disabled:opacity-60"
              >
                <Check className="w-4 h-4" /> {submitting ? 'جارٍ الحفظ في Firebase...' : 'اعتماد ونشر لجميع المستخدمين'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
