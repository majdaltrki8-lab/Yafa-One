'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  FolderTree,
  Image as ImageIcon,
  Layers,
  LockKeyhole,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import {
  APP_IMAGE_GROUPS,
  APP_IMAGE_SLOTS,
  DEFAULT_HOME_ACTIVITIES,
  persistActivitiesConfig,
  persistAppImageSlot,
  resolveSlotImages,
  resolveSlotPrimaryImage,
  updateCategoryImageFirestore,
  updateEstablishmentImagesFirestore,
  updateProductImagesFirestore,
  uploadAdminEntityImageToStorage,
  uploadAppImageToStorage,
  useAppImages,
  useHomeActivities,
  verifyFirebaseAdminAuthority,
  type AppImageEntry,
  type AppImageGroupId,
  type AppImageSlotDef,
  type AspectPreset,
  type HomeActivityConfigItem,
} from '@/lib/appImages'
import ImageCropEnhanceModal from './ImageCropEnhanceModal'

interface AppImageManagerProps {
  onAudit?: (action: string, target: string) => void
  onNavigate?: (path: string) => void
}

type ManagerSectionTab = 'slots' | 'activities' | 'stores' | 'catalog'

type PendingEditor =
  | {
      target: 'slot'
      file: File
      slot: AppImageSlotDef
      mode: 'replace' | 'add'
      targetImageId?: string
      existingUrl?: string
      initialLabel?: string
    }
  | {
      target: 'store'
      file: File
      storeId: string
      storeName: string
      field: 'logo' | 'coverImage' | 'gallery_add' | 'gallery_replace'
      galleryIndex?: number
      existingUrl?: string
      aspect: AspectPreset
      placementLabel: string
    }
  | {
      target: 'category'
      file: File
      catId: string
      catName: string
      subIndex?: number
      existingUrl?: string
      placementLabel: string
    }
  | {
      target: 'product'
      file: File
      productId: string
      productName: string
      mode: 'add' | 'replace'
      imageIndex?: number
      existingUrl?: string
      placementLabel: string
    }

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never
type PendingPickConfig = DistributiveOmit<PendingEditor, 'file'>

type PreviewItem = {
  title: string
  subtitle: string
  url: string
  label?: string
  isPrimary?: boolean
}

type DeleteConfirmState =
  | {
      kind: 'slot'
      slot: AppImageSlotDef
      image: AppImageEntry
      isDefaultOnly: boolean
    }
  | {
      kind: 'store_image'
      storeId: string
      storeName: string
      field: 'logo' | 'coverImage' | 'gallery'
      galleryIndex?: number
      url: string
    }
  | {
      kind: 'category_image'
      catId: string
      catName: string
      subIndex?: number
      url: string
    }
  | {
      kind: 'product_image'
      productId: string
      productName: string
      imageIndex: number
      url: string
    }

type FirestoreStoreItem = {
  id: string
  name: string
  district?: string
  category?: string
  logo?: string
  logoUrl?: string
  coverImage?: string
  gallery?: string[]
  approved?: boolean
}

type FirestoreCategoryItem = {
  id: string
  title: string
  detail?: string
  imageUrl?: string
  subcategories?: Array<{ id: string; name: string; imageUrl?: string }>
}

type FirestoreProductItem = {
  id: string
  name: string
  establishmentId?: string
  price?: number
  currency?: string
  category?: string
  images?: string[]
}

function broadcastToast(msg: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('yafa-toast', { detail: msg }))
  }
}

const CAROUSEL_ROUTES = [
  { label: 'دليل المتاجر', path: '/visitor/stores' },
  { label: 'الغذاء والبقالة', path: '/visitor/groceries' },
  { label: 'مواد البناء', path: '/visitor/building' },
  { label: 'الألمنيوم والزجاج', path: '/visitor/aluminum' },
  { label: 'أصحاب المهن', path: '/visitor/professionals' },
  { label: 'الوقود والغاز', path: '/visitor/fuel' },
  { label: 'السيارات والعقارات', path: '/visitor/vehicles' },
  { label: 'السوق المستعمل', path: '/visitor/used' },
  { label: 'أسعار الصرف', path: '/visitor/exchange-rates' },
  { label: 'شارك واربح', path: '/visitor/share' },
]

export default function AppImageManager({ onAudit, onNavigate }: AppImageManagerProps) {
  const registry = useAppImages()
  const liveActivities = useHomeActivities()

  const [activeTab, setActiveTab] = useState<ManagerSectionTab>('slots')
  const [selectedGroup, setSelectedGroup] = useState<'all' | AppImageGroupId>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [onlyCustomFilter, setOnlyCustomFilter] = useState(false)

  // Real Firebase Admin verification state
  const [authChecking, setAuthChecking] = useState(true)
  const [authStatus, setAuthStatus] = useState<{
    isAdmin: boolean
    email: string | null
    uid: string | null
    reason?: string
  }>({ isAdmin: false, email: null, uid: null })

  // Live Firestore collections (stores, categories, products)
  const [stores, setStores] = useState<FirestoreStoreItem[]>([])
  const [categories, setCategories] = useState<FirestoreCategoryItem[]>([])
  const [products, setProducts] = useState<FirestoreProductItem[]>([])
  const [catalogMode, setCatalogMode] = useState<'categories' | 'products'>('categories')

  // Activities config draft state (name, order, visibility)
  const [activitiesDraft, setActivitiesDraft] = useState<HomeActivityConfigItem[]>(liveActivities)
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null)
  const [editingActivityName, setEditingActivityName] = useState('')
  const [newActName, setNewActName] = useState('')
  const [savingActivities, setSavingActivities] = useState(false)

  // Carousel link/meta editor
  const [editingSlideRoute, setEditingSlideRoute] = useState<{
    slotId: string
    imageId: string
    label: string
    route: string
  } | null>(null)

  // UI feedbacks
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  // Modals
  const [editorState, setEditorState] = useState<PendingEditor | null>(null)
  const [previewState, setPreviewState] = useState<PreviewItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)

  // Hidden file input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingPickRef = useRef<PendingPickConfig | null>(null)

  useEffect(() => {
    setActivitiesDraft(liveActivities)
  }, [liveActivities])

  useEffect(() => {
    let active = true
    const runCheck = async () => {
      setAuthChecking(true)
      const res = await verifyFirebaseAdminAuthority()
      if (!active) return
      setAuthStatus({
        isAdmin: res.isAdmin,
        email: res.email,
        uid: res.uid,
        reason: res.reason,
      })
      setAuthChecking(false)
    }

    runCheck()
    const unsub = onAuthStateChanged(auth, () => {
      runCheck()
    })
    return () => {
      active = false
      unsub()
    }
  }, [])

  // Subscribe to live Firestore Establishments, Categories & Products
  useEffect(() => {
    let unsubStores: (() => void) | null = null
    let unsubCats: (() => void) | null = null
    let unsubProds: (() => void) | null = null

    try {
      unsubStores = onSnapshot(
        collection(db, 'establishments'),
        (snap) => {
          setStores(
            snap.docs.map((d) => {
              const data = d.data() as any
              return {
                id: d.id,
                name: data.name || data.title || d.id,
                district: data.district || 'يافع',
                category: data.category || data.activity || 'متجر تجاري',
                logo: data.logo || data.logoUrl || '',
                logoUrl: data.logoUrl || data.logo || '',
                coverImage: data.coverImage || '',
                gallery: Array.isArray(data.gallery) ? data.gallery : [],
                approved: data.approved,
              }
            }),
          )
        },
        () => {},
      )
    } catch {
      getDocs(collection(db, 'establishments'))
        .then((snap) =>
          setStores(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
          ),
        )
        .catch(() => {})
    }

    try {
      unsubCats = onSnapshot(
        collection(db, 'categories'),
        (snap) => {
          setCategories(
            snap.docs.map((d) => {
              const data = d.data() as any
              return {
                id: d.id,
                title: data.title || data.name || d.id,
                detail: data.detail || '',
                imageUrl: data.imageUrl || data.image || '',
                subcategories: Array.isArray(data.subcategories) ? data.subcategories : [],
              }
            }),
          )
        },
        () => {},
      )
    } catch {}

    try {
      unsubProds = onSnapshot(
        collection(db, 'products'),
        (snap) => {
          setProducts(
            snap.docs.map((d) => {
              const data = d.data() as any
              return {
                id: d.id,
                name: data.name || data.title || d.id,
                establishmentId: data.establishmentId || '',
                price: Number(data.price) || 0,
                currency: data.currency || 'YER',
                category: data.mainCategory || data.category || '',
                images: Array.isArray(data.images) ? data.images : [],
              }
            }),
          )
        },
        () => {},
      )
    } catch {}

    return () => {
      if (unsubStores) unsubStores()
      if (unsubCats) unsubCats()
      if (unsubProds) unsubProds()
    }
  }, [])

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setStatusBanner({ type, text })
    broadcastToast(text)
  }

  const allSlotDefs = useMemo(() => {
    const existingIds = new Set(APP_IMAGE_SLOTS.map((s) => s.id))
    const customActivitySlots: AppImageSlotDef[] = activitiesDraft
      .filter((a) => !existingIds.has(`activity_card_${a.id}`))
      .flatMap((a) => [
        {
          id: `activity_card_${a.id}`,
          group: 'activities' as const,
          pageName: `الصفحة الرئيسية — بطاقة «${a.name}»`,
          placementLabel: `صورة بطاقة نشاط «${a.name}»`,
          recommendedAspect: '4:3' as const,
          recommendedDimensions: '800 × 600',
          allowMultiple: false,
          defaultImages: [
            {
              id: `def-card-${a.id}`,
              url: a.defaultImage || '/assets/market.jpg',
              label: `بطاقة ${a.name}`,
              isPrimary: true,
              order: 1,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
        {
          id: `activity_banner_${a.id}`,
          group: 'activities' as const,
          pageName: `صفحة قسم «${a.name}»`,
          placementLabel: `البنر العلوي لقسم «${a.name}»`,
          recommendedAspect: '16:9' as const,
          recommendedDimensions: '1280 × 720',
          allowMultiple: true,
          defaultImages: [
            {
              id: `def-banner-${a.id}`,
              url: a.defaultBanner || '/assets/yafa-mountains.jpg',
              label: `بنر ${a.name}`,
              isPrimary: true,
              order: 1,
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ])
    return [...APP_IMAGE_SLOTS, ...customActivitySlots]
  }, [activitiesDraft])

  const filteredSlots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return allSlotDefs.filter((slot) => {
      if (selectedGroup !== 'all' && slot.group !== selectedGroup) return false
      const hasOverride = Boolean(registry[slot.id]?.images?.length)
      if (onlyCustomFilter && !hasOverride) return false
      if (!q) return true
      return (
        slot.pageName.toLowerCase().includes(q) ||
        slot.placementLabel.toLowerCase().includes(q) ||
        slot.id.toLowerCase().includes(q)
      )
    })
  }, [allSlotDefs, selectedGroup, searchQuery, onlyCustomFilter, registry])

  const filteredStores = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return stores
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.district || '').toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    )
  }, [stores, searchQuery])

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    )
  }, [categories, searchQuery])

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    )
  }, [products, searchQuery])

  const customModifiedCount = useMemo(
    () => allSlotDefs.filter((s) => Boolean(registry[s.id]?.images?.length)).length,
    [allSlotDefs, registry],
  )

  const openFilePicker = (config: PendingPickConfig) => {
    if (!authStatus.isAdmin) {
      showFeedback('error', authStatus.reason || 'يجب تسجيل الدخول بحساب المدير في Firebase أولاً.')
      return
    }
    pendingPickRef.current = config
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const pending = pendingPickRef.current
    if (!file || !pending) return

    if (!file.type.startsWith('image/')) {
      showFeedback('error', 'فشل الاختيار: يرجى اختيار ملف صورة صالح (JPG, PNG, WebP).')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      showFeedback('error', 'حجم الصورة يتجاوز الحد الأقصى المسموح (15MB).')
      return
    }

    setEditorState({ ...pending, file } as PendingEditor)
  }

  const handlePublishEditedImage = async ({
    blob,
    label,
  }: {
    blob: Blob
    previewUrl: string
    label: string
    width: number
    height: number
  }) => {
    if (!editorState) return
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp'

    if (editorState.target === 'slot') {
      const { slot, mode, targetImageId } = editorState
      setBusyKey(slot.id)
      try {
        const { url, storagePath } = await uploadAppImageToStorage(blob, slot.id, ext)
        const currentImages = resolveSlotImages(registry, slot.id)
        const nowIso = new Date().toISOString()

        let nextImages: AppImageEntry[]
        if (mode === 'replace' && targetImageId) {
          nextImages = currentImages.map((img) =>
            img.id === targetImageId
              ? {
                  ...img,
                  url,
                  storagePath,
                  label: label || img.label,
                  updatedAt: nowIso,
                }
              : img,
          )
        } else {
          const newEntry: AppImageEntry = {
            id: `img-${Date.now()}`,
            url,
            storagePath,
            label: label || slot.pageName,
            isPrimary: currentImages.length === 0,
            order: currentImages.length + 1,
            updatedAt: nowIso,
            route: slot.id === 'home_carousel' ? '/visitor/stores' : undefined,
            active: true,
          }
          nextImages = [...currentImages, newEntry]
        }

        await persistAppImageSlot(slot.id, nextImages, currentImages)
        onAudit?.(mode === 'replace' ? 'تغيير صورة تطبيق' : 'إضافة صورة تطبيق', `${slot.pageName} (${slot.id})`)
        showFeedback(
          'success',
          mode === 'replace'
            ? `تم تغيير ونشر صورة «${slot.pageName}» في Firebase Storage و Firestore بنجاح.`
            : `تمت إضافة ونشر الصورة الجديدة في «${slot.pageName}» بنجاح.`,
        )
        setEditorState(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'حدث خطأ أثناء رفع الصورة إلى Firebase.')
        throw err
      } finally {
        setBusyKey(null)
      }
      return
    }

    if (editorState.target === 'store') {
      const { storeId, storeName, field, galleryIndex } = editorState
      setBusyKey(`store-${storeId}`)
      try {
        const { url } = await uploadAdminEntityImageToStorage(blob, 'establishments', storeId, ext)
        const targetStore = stores.find((s) => s.id === storeId)
        const existingGallery = Array.isArray(targetStore?.gallery) ? [...targetStore.gallery] : []

        if (field === 'logo') {
          await updateEstablishmentImagesFirestore(storeId, { logo: url }, storeName)
        } else if (field === 'coverImage') {
          await updateEstablishmentImagesFirestore(storeId, { coverImage: url }, storeName)
        } else if (field === 'gallery_add') {
          await updateEstablishmentImagesFirestore(storeId, { gallery: [...existingGallery, url] }, storeName)
        } else if (field === 'gallery_replace' && typeof galleryIndex === 'number') {
          existingGallery[galleryIndex] = url
          await updateEstablishmentImagesFirestore(storeId, { gallery: existingGallery }, storeName)
        }

        onAudit?.('تحديث صور متجر', `${storeName} (${field})`)
        showFeedback('success', `تم حفظ ونشر الصورة الجديدة لمتجر «${storeName}» في Firebase بنجاح.`)
        setEditorState(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'تعذر حفظ صورة المتجر.')
        throw err
      } finally {
        setBusyKey(null)
      }
      return
    }

    if (editorState.target === 'category') {
      const { catId, catName, subIndex } = editorState
      setBusyKey(`cat-${catId}`)
      try {
        const { url } = await uploadAdminEntityImageToStorage(blob, 'categories', catId, ext)
        const targetCat = categories.find((c) => c.id === catId)
        if (typeof subIndex === 'number' && targetCat?.subcategories) {
          const nextSubs = targetCat.subcategories.map((sub, i) =>
            i === subIndex ? { ...sub, imageUrl: url } : sub,
          )
          await updateCategoryImageFirestore(catId, targetCat.imageUrl || url, catName, nextSubs)
        } else {
          await updateCategoryImageFirestore(catId, url, catName, targetCat?.subcategories)
        }
        onAudit?.('تحديث صورة قسم', `${catName}`)
        showFeedback('success', `تم حفظ ونشر صورة قسم «${catName}» بنجاح.`)
        setEditorState(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'تعذر حفظ صورة القسم.')
        throw err
      } finally {
        setBusyKey(null)
      }
      return
    }

    if (editorState.target === 'product') {
      const { productId, productName, mode, imageIndex } = editorState
      setBusyKey(`prod-${productId}`)
      try {
        const { url } = await uploadAdminEntityImageToStorage(blob, 'products', productId, ext)
        const targetProd = products.find((p) => p.id === productId)
        const currentImgs = Array.isArray(targetProd?.images) ? [...targetProd.images] : []
        if (mode === 'replace' && typeof imageIndex === 'number') {
          currentImgs[imageIndex] = url
        } else {
          currentImgs.push(url)
        }
        await updateProductImagesFirestore(productId, currentImgs, productName)
        onAudit?.('تحديث صور منتج', `${productName} (مع الحفاظ على السعر)`)
        showFeedback('success', `تم تحديث صور منتج «${productName}» مع الحفاظ الكامل على السعر والتفاصيل.`)
        setEditorState(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'تعذر حفظ صورة المنتج.')
        throw err
      } finally {
        setBusyKey(null)
      }
    }
  }

  const handleSetPrimary = async (slot: AppImageSlotDef, imageId: string) => {
    if (!authStatus.isAdmin) {
      showFeedback('error', authStatus.reason || 'غير مصرح بهذا الإجراء.')
      return
    }
    setBusyKey(slot.id)
    try {
      const currentImages = resolveSlotImages(registry, slot.id)
      const nextImages = currentImages.map((img) => ({
        ...img,
        isPrimary: img.id === imageId,
      }))
      await persistAppImageSlot(slot.id, nextImages, currentImages)
      onAudit?.('تعيين صورة رئيسية', `${slot.pageName} -> ${imageId}`)
      showFeedback('success', `تم تعيين الصورة الرئيسية لقسم «${slot.pageName}» وتحديثها فوراً.`)
    } catch (err: any) {
      showFeedback('error', err?.message || 'تعذر تعيين الصورة الرئيسية.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleReorder = async (slot: AppImageSlotDef, index: number, direction: -1 | 1) => {
    if (!authStatus.isAdmin) {
      showFeedback('error', authStatus.reason || 'غير مصرح بهذا الإجراء.')
      return
    }
    const currentImages = resolveSlotImages(registry, slot.id)
    const targetIdx = index + direction
    if (targetIdx < 0 || targetIdx >= currentImages.length) return

    setBusyKey(slot.id)
    try {
      const reordered = [...currentImages]
      const temp = reordered[index]
      reordered[index] = reordered[targetIdx]
      reordered[targetIdx] = temp
      const normalized = reordered.map((img, i) => ({ ...img, order: i + 1 }))
      await persistAppImageSlot(slot.id, normalized, currentImages)
      onAudit?.('ترتيب صور التطبيق', `${slot.pageName}`)
      showFeedback('success', `تم تحديث ترتيب الصور في «${slot.pageName}» ونشره مباشرة.`)
    } catch (err: any) {
      showFeedback('error', err?.message || 'تعذر حفظ ترتيب الصور.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleSaveSlideRouteMeta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSlideRoute) return
    const slot = allSlotDefs.find((s) => s.id === editingSlideRoute.slotId)
    if (!slot) return
    setBusyKey(slot.id)
    try {
      const currentImages = resolveSlotImages(registry, slot.id)
      const nextImages = currentImages.map((img) =>
        img.id === editingSlideRoute.imageId
          ? {
              ...img,
              label: editingSlideRoute.label.trim() || img.label,
              route: editingSlideRoute.route,
              updatedAt: new Date().toISOString(),
            }
          : img,
      )
      await persistAppImageSlot(slot.id, nextImages, currentImages)
      onAudit?.('تعديل رابط ووصف بنر', `${slot.pageName} -> ${editingSlideRoute.route}`)
      showFeedback('success', 'تم حفظ عنوان ورابط البنر ونشره للزوار فوراً.')
      setEditingSlideRoute(null)
    } catch (err: any) {
      showFeedback('error', err?.message || 'تعذر حفظ بيانات البنر.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return
    if (!authStatus.isAdmin) {
      showFeedback('error', authStatus.reason || 'غير مصرح بالحذف.')
      setDeleteConfirm(null)
      return
    }

    if (deleteConfirm.kind === 'slot') {
      const { slot, image } = deleteConfirm
      setBusyKey(slot.id)
      try {
        const currentImages = resolveSlotImages(registry, slot.id)
        const remaining = currentImages.filter((i) => i.id !== image.id)
        const nextImages = remaining.length > 0 ? remaining : [...slot.defaultImages]

        await persistAppImageSlot(slot.id, nextImages, currentImages)
        onAudit?.('حذف صورة من التطبيق', `${slot.pageName} (${image.id})`)
        showFeedback(
          'success',
          remaining.length > 0
            ? `تم حذف الصورة من «${slot.pageName}» وحفظ النسخة السابقة للاستعادة عند الحاجة.`
            : `تم حذف الصورة المخصصة وإرجاع الصورة الافتراضية الآمنة في «${slot.pageName}».`,
        )
        setDeleteConfirm(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'تعذر حذف الصورة.')
      } finally {
        setBusyKey(null)
      }
      return
    }

    if (deleteConfirm.kind === 'store_image') {
      const { storeId, storeName, field, galleryIndex } = deleteConfirm
      setBusyKey(`store-${storeId}`)
      try {
        const targetStore = stores.find((s) => s.id === storeId)
        if (field === 'logo') {
          await updateEstablishmentImagesFirestore(storeId, { logo: '' }, storeName)
        } else if (field === 'coverImage') {
          await updateEstablishmentImagesFirestore(storeId, { coverImage: '' }, storeName)
        } else if (field === 'gallery' && typeof galleryIndex === 'number') {
          const nextGallery = (targetStore?.gallery || []).filter((_, i) => i !== galleryIndex)
          await updateEstablishmentImagesFirestore(storeId, { gallery: nextGallery }, storeName)
        }
        onAudit?.('حذف صورة متجر', `${storeName} (${field})`)
        showFeedback('success', `تم حذف الصورة من متجر «${storeName}» بنجاح.`)
        setDeleteConfirm(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'تعذر حذف صورة المتجر.')
      } finally {
        setBusyKey(null)
      }
      return
    }

    if (deleteConfirm.kind === 'category_image') {
      const { catId, catName, subIndex } = deleteConfirm
      setBusyKey(`cat-${catId}`)
      try {
        const targetCat = categories.find((c) => c.id === catId)
        if (typeof subIndex === 'number' && targetCat?.subcategories) {
          const nextSubs = targetCat.subcategories.map((sub, i) =>
            i === subIndex ? { ...sub, imageUrl: '' } : sub,
          )
          await updateCategoryImageFirestore(catId, targetCat.imageUrl || '', catName, nextSubs)
        } else {
          await updateCategoryImageFirestore(catId, '', catName, targetCat?.subcategories)
        }
        onAudit?.('حذف صورة قسم', catName)
        showFeedback('success', `تمت إزالة صورة قسم «${catName}».`)
        setDeleteConfirm(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'تعذر حذف صورة القسم.')
      } finally {
        setBusyKey(null)
      }
      return
    }

    if (deleteConfirm.kind === 'product_image') {
      const { productId, productName, imageIndex } = deleteConfirm
      setBusyKey(`prod-${productId}`)
      try {
        const targetProd = products.find((p) => p.id === productId)
        const nextImgs = (targetProd?.images || []).filter((_, i) => i !== imageIndex)
        await updateProductImagesFirestore(productId, nextImgs, productName)
        onAudit?.('حذف صورة منتج', productName)
        showFeedback('success', `تم حذف الصورة من منتج «${productName}».`)
        setDeleteConfirm(null)
      } catch (err: any) {
        showFeedback('error', err?.message || 'تعذر حذف صورة المنتج.')
      } finally {
        setBusyKey(null)
      }
    }
  }

  const handleRestorePrevious = async (slot: AppImageSlotDef) => {
    if (!authStatus.isAdmin) {
      showFeedback('error', authStatus.reason || 'غير مصرح بالاستعادة.')
      return
    }
    const prevImages = registry[slot.id]?.previousImages
    if (!prevImages || prevImages.length === 0) {
      showFeedback('error', 'لا توجد صورة سابقة محفوظة لهذا الموضع.')
      return
    }
    setBusyKey(slot.id)
    try {
      const currentImages = resolveSlotImages(registry, slot.id)
      await persistAppImageSlot(slot.id, prevImages, currentImages)
      onAudit?.('استعادة الصورة السابقة', `${slot.pageName}`)
      showFeedback('success', `تمت استعادة الصورة السابقة لقسم «${slot.pageName}» بنجاح.`)
    } catch (err: any) {
      showFeedback('error', err?.message || 'تعذرت استعادة الصورة السابقة.')
    } finally {
      setBusyKey(null)
    }
  }

  const handleRestoreDefault = async (slot: AppImageSlotDef) => {
    if (!authStatus.isAdmin) {
      showFeedback('error', authStatus.reason || 'غير مصرح.')
      return
    }
    setBusyKey(slot.id)
    try {
      const currentImages = resolveSlotImages(registry, slot.id)
      await persistAppImageSlot(slot.id, [...slot.defaultImages], currentImages)
      onAudit?.('استعادة الصور الافتراضية', `${slot.pageName}`)
      showFeedback('success', `تمت استعادة الصور الافتراضية الأصلية في «${slot.pageName}».`)
    } catch (err: any) {
      showFeedback('error', err?.message || 'تعذرت استعادة الافتراضي.')
    } finally {
      setBusyKey(null)
    }
  }

  // Activity ordering, rename & visibility handlers
  const handleMoveActivity = (index: number, dir: -1 | 1) => {
    const dest = index + dir
    if (dest < 0 || dest >= activitiesDraft.length) return
    const next = [...activitiesDraft]
    ;[next[index], next[dest]] = [next[dest], next[index]]
    setActivitiesDraft(next.map((a, i) => ({ ...a, order: i + 1 })))
  }

  const handleToggleActivityVisibility = (id: string) => {
    setActivitiesDraft((prev) => prev.map((a) => (a.id === id ? { ...a, visible: !a.visible } : a)))
  }

  const handleCommitActivityName = (id: string) => {
    if (!editingActivityName.trim()) return
    setActivitiesDraft((prev) =>
      prev.map((a) => (a.id === id ? { ...a, name: editingActivityName.trim() } : a)),
    )
    setEditingActivityId(null)
    setEditingActivityName('')
  }

  const handleAddCustomActivity = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newActName.trim()) return
    const slug = `custom_${Date.now().toString(36)}`
    const added: HomeActivityConfigItem = {
      id: slug,
      name: newActName.trim(),
      path: `/visitor/stores?category=${encodeURIComponent(newActName.trim())}`,
      iconKey: 'Store',
      defaultImage: '/assets/market.jpg',
      defaultBanner: '/assets/yafa-mountains.jpg',
      order: activitiesDraft.length + 1,
      visible: true,
    }
    setActivitiesDraft((prev) => [...prev, added])
    setNewActName('')
    showFeedback('success', `تمت إضافة «${added.name}» للمسودة. اضغط «حفظ ونشر ترتيب وأسماء الأنشطة» لاعتمادها.`)
  }

  const handleSaveActivitiesConfig = async () => {
    if (!authStatus.isAdmin) {
      showFeedback('error', authStatus.reason || 'غير مصرح بحفظ الأنشطة.')
      return
    }
    setSavingActivities(true)
    try {
      await persistActivitiesConfig(activitiesDraft)
      onAudit?.('تحديث أسماء وترتيب الأنشطة', `نشر ${activitiesDraft.length} نشاطاً`)
      showFeedback('success', 'تم حفظ ونشر أسماء وترتيب الأنشطة التجارية لجميع الزوار فوراً.')
    } catch (err: any) {
      showFeedback('error', err?.message || 'تعذر حفظ إعدادات الأنشطة.')
    } finally {
      setSavingActivities(false)
    }
  }

  const makeActivitySlotDef = (act: HomeActivityConfigItem, kind: 'card' | 'banner'): AppImageSlotDef => {
    const existing = allSlotDefs.find((s) => s.id === `activity_${kind}_${act.id}`)
    if (existing) return existing
    return {
      id: `activity_${kind}_${act.id}`,
      group: 'activities',
      pageName: kind === 'card' ? `بطاقة نشاط «${act.name}»` : `بنر قسم «${act.name}»`,
      placementLabel: kind === 'card' ? `صورة بطاقة نشاط «${act.name}»` : `البنر العلوي لقسم «${act.name}»`,
      recommendedAspect: kind === 'card' ? '4:3' : '16:9',
      recommendedDimensions: kind === 'card' ? '800 × 600' : '1280 × 720',
      allowMultiple: kind === 'banner',
      defaultImages: [
        makeDefaultEntry(
          `def-${kind}-${act.id}`,
          kind === 'card' ? act.defaultImage : act.defaultBanner,
          act.name,
        ),
      ],
    }
  }

  const defaultStoreCover = resolveSlotPrimaryImage(registry, 'store_default_cover', '/assets/market.jpg')

  return (
    <div className="space-y-4 text-right" dir="rtl">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Firebase Admin Security Verification Status */}
      {authChecking ? (
        <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-3 text-xs font-bold text-slate-700">
          <RefreshCw className="w-4 h-4 animate-spin text-[#064b3d]" />
          <span>جارٍ التحقق من صلاحية المدير في Firebase Authentication...</span>
        </div>
      ) : !authStatus.isAdmin ? (
        <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-2.5 shadow-sm">
          <div className="flex items-start gap-2.5">
            <LockKeyhole className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-black text-rose-900">صلاحية المدير مطلوبة من Firebase</h3>
              <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                {authStatus.reason || 'تم منع التعديل لأن الجلسة الحالية ليست مصادق عليها كمدير نظام في Firebase Auth.'}
              </p>
              {authStatus.email && (
                <p className="text-[11px] font-mono text-rose-700 mt-1">
                  الحساب الحالي: {authStatus.email}
                </p>
              )}
            </div>
          </div>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('/auth/admin-login?return=/admin/app-images')}
              className="px-4 py-2 rounded-xl bg-[#064b3d] text-white text-xs font-extrabold hover:bg-[#03372d]"
            >
              تسجيل الدخول بحساب المدير المعتمد
            </button>
          )}
        </div>
      ) : (
        <div className="p-3.5 rounded-2xl bg-[#edf6f2] border border-[#cde3d7] text-[#064b3d] flex flex-wrap items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#064b3d] text-[#eedab0] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xs font-black">نظام إدارة صور التطبيق المتكامل — تحكم حصري للمدير</h2>
              <p className="text-[11px] text-emerald-800 font-medium">
                موثق عبر Firebase ({authStatus.email || authStatus.uid}) · تُرفع الصور مضغوطة وتُحفظ في Storage و Firestore وتظهر فوراً دون تحديث المتجر.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold">
            <span className="bg-white px-2.5 py-1 rounded-xl border border-[#cde3d7]">
              {allSlotDefs.length} موضع صفحة
            </span>
            <span className="bg-[#faf3e0] text-[#7a540e] px-2.5 py-1 rounded-xl border border-[#e7cf96]">
              {customModifiedCount} مخصصة
            </span>
          </div>
        </div>
      )}

      {/* Primary Section Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('slots')}
          className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'slots' ? 'bg-[#064b3d] text-white' : 'bg-[#f6f8f6] text-slate-700 hover:bg-slate-100'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>الصفحات والبنرات ({allSlotDefs.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activities')}
          className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'activities' ? 'bg-[#064b3d] text-white' : 'bg-[#f6f8f6] text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>الأنشطة والأسماء ({activitiesDraft.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stores')}
          className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'stores' ? 'bg-[#064b3d] text-white' : 'bg-[#f6f8f6] text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>صور المتاجر ({stores.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'catalog' ? 'bg-[#064b3d] text-white' : 'bg-[#f6f8f6] text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>الأقسام والمنتجات</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {statusBanner && (
        <div
          className={`p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs font-bold shadow-xs ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search Toolbar */}
      {activeTab !== 'activities' && (
        <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'stores'
                    ? 'ابحث باسم المتجر أو المديرية...'
                    : activeTab === 'catalog'
                      ? 'ابحث باسم القسم أو المنتج...'
                      : 'ابحث باسم الصفحة أو موضع الصورة (رئيسية، أصحاب المهن، محطات، حوالات، طلبات)...'
                }
                className="w-full text-xs pr-9 pl-3 py-2 rounded-xl border border-slate-200 bg-[#f8faf8] focus:bg-white focus:border-[#064b3d] outline-none"
              />
            </div>
            {activeTab === 'slots' && (
              <button
                type="button"
                onClick={() => setOnlyCustomFilter((v) => !v)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                  onlyCustomFilter
                    ? 'bg-[#c7942c] text-[#03372d] border-[#c7942c]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 inline ml-1" />
                المعدّلة فقط ({customModifiedCount})
              </button>
            )}
          </div>

          {activeTab === 'slots' && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedGroup('all')}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 border transition-colors ${
                  selectedGroup === 'all'
                    ? 'bg-[#064b3d] text-white border-[#064b3d]'
                    : 'bg-[#f6f8f6] text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                جميع الصفحات ({allSlotDefs.length})
              </button>
              {APP_IMAGE_GROUPS.map((grp) => {
                const count = allSlotDefs.filter((s) => s.group === grp.id).length
                return (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => setSelectedGroup(grp.id)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 border transition-colors ${
                      selectedGroup === grp.id
                        ? 'bg-[#064b3d] text-white border-[#064b3d]'
                        : 'bg-[#f6f8f6] text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {grp.label} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: APP SLOTS & BANNERS */}
      {activeTab === 'slots' && (
        <div className="space-y-3">
          {filteredSlots.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2">
              <ImageIcon className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">لا توجد مواضع صور مطابقة لبحثك</h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedGroup('all')
                  setSearchQuery('')
                  setOnlyCustomFilter(false)
                }}
                className="px-4 py-1.5 rounded-xl bg-[#064b3d] text-white text-xs font-bold"
              >
                عرض جميع صور التطبيق
              </button>
            </div>
          ) : (
            filteredSlots.map((slot) => {
              const images = resolveSlotImages(registry, slot.id)
              const override = registry[slot.id]
              const isCustom = Boolean(override?.images?.length)
              const hasPrevious = Boolean(override?.previousImages && override.previousImages.length > 0)
              const isBusy = busyKey === slot.id
              const groupLabel = APP_IMAGE_GROUPS.find((g) => g.id === slot.group)?.label || ''

              return (
                <article key={slot.id} className="bg-white rounded-2xl border border-[#e0e8e2] shadow-xs overflow-hidden">
                  <div className="p-3.5 bg-[#f7faf8] border-b border-[#e8efe9] flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-[#e3efe8] text-[#064b3d]">
                          {groupLabel}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isCustom
                              ? 'bg-[#faf3e0] text-[#8a5d0c] border border-[#ead4a1]'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isCustom ? 'صورة مخصصة منشورة' : 'افتراضية أصلية'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {slot.recommendedDimensions} ({slot.recommendedAspect})
                        </span>
                      </div>
                      <h3 className="text-[13.5px] font-black text-[#064b3d]">{slot.pageName}</h3>
                      <p className="text-[11.5px] text-slate-600 font-medium flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-[#c7942c] shrink-0" />
                        <span>مكان الظهور: {slot.placementLabel}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!authStatus.isAdmin || isBusy}
                        onClick={() =>
                          openFilePicker({
                            target: 'slot',
                            slot,
                            mode: 'add',
                            existingUrl: images[0]?.url,
                            initialLabel: slot.pageName,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-[#064b3d] text-white text-[11px] font-extrabold flex items-center gap-1 hover:bg-[#03372d] disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" /> إضافة صورة
                      </button>
                      {hasPrevious && (
                        <button
                          type="button"
                          disabled={!authStatus.isAdmin || isBusy}
                          onClick={() => handleRestorePrevious(slot)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold flex items-center gap-1 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> استعادة السابقة
                        </button>
                      )}
                      {isCustom && (
                        <button
                          type="button"
                          disabled={!authStatus.isAdmin || isBusy}
                          onClick={() => handleRestoreDefault(slot)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-[11px] font-bold hover:bg-slate-200 disabled:opacity-50"
                        >
                          الافتراضي
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3 space-y-2.5">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        className={`p-2.5 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${
                          img.isPrimary ? 'bg-[#fcfaf3] border-[#e7cf96]' : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative w-24 h-16 sm:w-28 sm:h-18 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                            <img
                              src={img.url}
                              alt={img.label || slot.pageName}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            {img.isPrimary && (
                              <span className="absolute top-1 right-1 bg-[#c7942c] text-[#03372d] text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
                                <Crown className="w-2.5 h-2.5" /> رئيسية
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                ترتيب #{idx + 1}
                              </span>
                              <strong className="text-xs text-slate-900 truncate block">
                                {img.label || slot.pageName}
                              </strong>
                            </div>
                            {img.route && (
                              <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded inline-block">
                                الوجهة: {img.route}
                              </span>
                            )}
                            <p className="text-[10px] text-slate-500 font-mono truncate max-w-[230px]">
                              {img.storagePath ? `Firebase Storage: ${img.storagePath}` : img.url}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={!authStatus.isAdmin || isBusy}
                            onClick={() =>
                              openFilePicker({
                                target: 'slot',
                                slot,
                                mode: 'replace',
                                targetImageId: img.id,
                                existingUrl: img.url,
                                initialLabel: img.label || slot.pageName,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-[#edf6f0] text-[#064b3d] border border-[#cde3d7] text-[11px] font-extrabold flex items-center gap-1 hover:bg-[#dff0e6] disabled:opacity-50"
                          >
                            <Upload className="w-3.5 h-3.5" /> تغيير الصورة
                          </button>

                          {slot.id === 'home_carousel' && (
                            <button
                              type="button"
                              disabled={!authStatus.isAdmin || isBusy}
                              onClick={() =>
                                setEditingSlideRoute({
                                  slotId: slot.id,
                                  imageId: img.id,
                                  label: img.label || '',
                                  route: img.route || '/visitor/stores',
                                })
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 text-[11px] font-bold flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" /> الرابط والعنوان
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setPreviewState({
                                title: slot.pageName,
                                subtitle: slot.placementLabel,
                                url: img.url,
                                label: img.label,
                                isPrimary: img.isPrimary,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-[#eaf3f8] text-sky-900 border border-sky-200 text-[11px] font-bold flex items-center gap-1 hover:bg-sky-100"
                          >
                            <Eye className="w-3.5 h-3.5" /> معاينة
                          </button>

                          {!img.isPrimary && (
                            <button
                              type="button"
                              disabled={!authStatus.isAdmin || isBusy}
                              onClick={() => handleSetPrimary(slot, img.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-[#faf3e0] text-[#7a540e] border border-[#e7cf96] text-[11px] font-bold flex items-center gap-1 hover:bg-[#f4e7c3] disabled:opacity-50"
                            >
                              <Crown className="w-3.5 h-3.5" /> رئيسية
                            </button>
                          )}

                          {images.length > 1 && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={!authStatus.isAdmin || isBusy || idx === 0}
                                onClick={() => handleReorder(slot, idx, -1)}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                title="تقديم للأعلى"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={!authStatus.isAdmin || isBusy || idx === images.length - 1}
                                onClick={() => handleReorder(slot, idx, 1)}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                                title="تأخير للأسفل"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          <button
                            type="button"
                            disabled={!authStatus.isAdmin || isBusy}
                            onClick={() =>
                              setDeleteConfirm({
                                kind: 'slot',
                                slot,
                                image: img,
                                isDefaultOnly: !isCustom && images.length <= 1,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-xl bg-[#fdeeed] text-rose-800 border border-rose-200 text-[11px] font-bold flex items-center gap-1 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )
            })
          )}
        </div>
      )}

      {/* TAB 2: ACTIVITIES MANAGEMENT (IMAGES + NAMES + REORDER + VISIBILITY) */}
      {activeTab === 'activities' && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl p-3.5 border border-[#e0e8e2] shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-[#064b3d]">إدارة الأنشطة التجارية (الصور، الأسماء، والترتيب)</h3>
                <p className="text-[11px] text-slate-600">
                  رتّب ظهور الأنشطة في الصفحة الرئيسية أو عدّل أسماءها وصور البطاقات والبنرات مباشرة في Firebase.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!authStatus.isAdmin || savingActivities}
                  onClick={() => setActivitiesDraft(DEFAULT_HOME_ACTIVITIES)}
                  className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  استعادة الافتراضي
                </button>
                <button
                  type="button"
                  disabled={!authStatus.isAdmin || savingActivities}
                  onClick={handleSaveActivitiesConfig}
                  className="px-4 py-2 rounded-xl bg-[#064b3d] text-white text-xs font-extrabold flex items-center gap-1.5 hover:bg-[#03372d] disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {savingActivities ? 'جارٍ الحفظ...' : 'حفظ ونشر ترتيب وأسماء الأنشطة'}
                </button>
              </div>
            </div>

            <form onSubmit={handleAddCustomActivity} className="flex gap-2">
              <input
                type="text"
                value={newActName}
                onChange={(e) => setNewActName(e.target.value)}
                placeholder="أضف نشاطاً أو خدمة جديدة لشبكة الرئيسية..."
                className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 bg-[#f8faf8] outline-none focus:border-[#064b3d]"
              />
              <button
                type="submit"
                disabled={!authStatus.isAdmin}
                className="px-3.5 py-2 rounded-xl bg-[#c7942c] text-[#03372d] text-xs font-black flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> إضافة نشاط
              </button>
            </form>
          </div>

          <div className="space-y-2.5">
            {activitiesDraft.map((act, idx) => {
              const cardSlot = makeActivitySlotDef(act, 'card')
              const bannerSlot = makeActivitySlotDef(act, 'banner')
              const cardImg = resolveSlotImages(registry, cardSlot.id)[0]
              const bannerImg = resolveSlotImages(registry, bannerSlot.id)[0]
              const isEditingName = editingActivityId === act.id

              return (
                <article
                  key={act.id}
                  className={`bg-white rounded-2xl border p-3 shadow-xs space-y-3 ${
                    act.visible ? 'border-[#e0e8e2]' : 'border-rose-200 opacity-80 bg-rose-50/30'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black bg-[#064b3d] text-white w-7 h-7 rounded-lg flex items-center justify-center">
                        {idx + 1}
                      </span>
                      {isEditingName ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingActivityName}
                            onChange={(e) => setEditingActivityName(e.target.value)}
                            className="text-xs px-2.5 py-1 rounded-lg border border-[#064b3d] outline-none font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => handleCommitActivityName(act.id)}
                            className="px-2.5 py-1 rounded-lg bg-[#064b3d] text-white text-[11px] font-bold"
                          >
                            اعتماد
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-black text-[#064b3d]">{act.name}</h4>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingActivityId(act.id)
                                setEditingActivityName(act.name)
                              }}
                              className="p-1 rounded-md text-slate-500 hover:bg-slate-100"
                              title="تعديل اسم النشاط"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <code className="text-[10px] text-slate-400">{act.path}</code>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveActivity(idx, -1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        title="تقديم للأعلى"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === activitiesDraft.length - 1}
                        onClick={() => handleMoveActivity(idx, 1)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        title="تأخير للأسفل"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActivityVisibility(act.id)}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 border ${
                          act.visible
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                      >
                        {act.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {act.visible ? 'ظاهر' : 'مخفي'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Card Image */}
                    <div className="p-2.5 rounded-xl bg-[#f8faf9] border border-slate-200 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={cardImg?.url || act.defaultImage}
                          alt={`بطاقة ${act.name}`}
                          className="w-16 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <b className="text-[11px] text-slate-800 block">صورة البطاقة (4:3)</b>
                          <small className="text-[10px] text-slate-500">تظهر في الرئيسية</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!authStatus.isAdmin || busyKey === cardSlot.id}
                        onClick={() =>
                          openFilePicker({
                            target: 'slot',
                            slot: cardSlot,
                            mode: 'replace',
                            targetImageId: cardImg?.id,
                            existingUrl: cardImg?.url,
                            initialLabel: `بطاقة ${act.name}`,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-[#edf6f0] text-[#064b3d] border border-[#cde3d7] text-[11px] font-bold shrink-0"
                      >
                        تغيير
                      </button>
                    </div>

                    {/* Banner Image */}
                    <div className="p-2.5 rounded-xl bg-[#f8faf9] border border-slate-200 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={bannerImg?.url || act.defaultBanner}
                          alt={`بنر ${act.name}`}
                          className="w-20 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <b className="text-[11px] text-slate-800 block">بنر القسم (16:9)</b>
                          <small className="text-[10px] text-slate-500">يظهر عند دخول القسم</small>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={!authStatus.isAdmin || busyKey === bannerSlot.id}
                        onClick={() =>
                          openFilePicker({
                            target: 'slot',
                            slot: bannerSlot,
                            mode: 'replace',
                            targetImageId: bannerImg?.id,
                            existingUrl: bannerImg?.url,
                            initialLabel: `بنر ${act.name}`,
                          })
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-[#faf3e0] text-[#7a540e] border border-[#e7cf96] text-[11px] font-bold shrink-0"
                      >
                        تغيير البنر
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 3: ACTUAL FIRESTORE STORES (LOGO, COVER, INTERNAL GALLERY) */}
      {activeTab === 'stores' && (
        <div className="space-y-3">
          {filteredStores.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2">
              <Store className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">لا توجد متاجر مسجلة في Firestore مطابقة لبحثك</h3>
              <p className="text-xs text-slate-500">
                تُعرض هنا جميع المتاجر والمنشآت المسجلة لتتمكن الإدارة من تغيير الشعار والأغلفة والصور الداخلية.
              </p>
            </div>
          ) : (
            filteredStores.map((st) => {
              const logoUrl = st.logo || st.logoUrl || defaultStoreCover
              const coverUrl = st.coverImage || logoUrl
              const gallery = Array.isArray(st.gallery) ? st.gallery : []
              const isBusy = busyKey === `store-${st.id}`

              return (
                <article key={st.id} className="bg-white rounded-2xl border border-[#e0e8e2] shadow-xs overflow-hidden">
                  <div className="p-3.5 bg-[#f7faf8] border-b border-[#e8efe9] flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-[#064b3d]">{st.name}</h3>
                      <p className="text-[11px] text-slate-600">
                        {st.district || 'يافع'} · {st.category || 'متجر تجاري'} · {st.approved ? 'معتمدة' : 'قيد المراجعة'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!authStatus.isAdmin || isBusy}
                      onClick={() =>
                        openFilePicker({
                          target: 'store',
                          storeId: st.id,
                          storeName: st.name,
                          field: 'gallery_add',
                          aspect: '4:3',
                          placementLabel: `إضافة صورة للمعرض الداخلي لمتجر ${st.name}`,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-[#064b3d] text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" /> إضافة صورة داخلية
                    </button>
                  </div>

                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Store Logo */}
                    <div className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={logoUrl}
                          alt={`شعار ${st.name}`}
                          className="w-14 h-14 rounded-xl object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <b className="text-xs text-slate-900 block">شعار المتجر (1:1)</b>
                          <small className="text-[10px] text-slate-500">يظهر في بطاقة وهوية المتجر</small>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={!authStatus.isAdmin || isBusy}
                          onClick={() =>
                            openFilePicker({
                              target: 'store',
                              storeId: st.id,
                              storeName: st.name,
                              field: 'logo',
                              existingUrl: logoUrl,
                              aspect: '1:1',
                              placementLabel: `شعار متجر ${st.name}`,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-[#edf6f0] text-[#064b3d] text-[11px] font-bold"
                        >
                          تغيير
                        </button>
                        {(st.logo || st.logoUrl) && (
                          <button
                            type="button"
                            disabled={!authStatus.isAdmin || isBusy}
                            onClick={() =>
                              setDeleteConfirm({
                                kind: 'store_image',
                                storeId: st.id,
                                storeName: st.name,
                                field: 'logo',
                                url: logoUrl,
                              })
                            }
                            className="p-1.5 rounded-xl bg-[#fdeeed] text-rose-700"
                            title="حذف الشعار"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Store Cover */}
                    <div className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={coverUrl}
                          alt={`غلاف ${st.name}`}
                          className="w-20 h-14 rounded-xl object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <b className="text-xs text-slate-900 block">غلاف المتجر (16:9)</b>
                          <small className="text-[10px] text-slate-500">الصورة الكبيرة أعلى صفحة المتجر</small>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={!authStatus.isAdmin || isBusy}
                          onClick={() =>
                            openFilePicker({
                              target: 'store',
                              storeId: st.id,
                              storeName: st.name,
                              field: 'coverImage',
                              existingUrl: coverUrl,
                              aspect: '16:9',
                              placementLabel: `صورة غلاف متجر ${st.name}`,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-[#faf3e0] text-[#7a540e] text-[11px] font-bold"
                        >
                          تغيير
                        </button>
                        {st.coverImage && (
                          <button
                            type="button"
                            disabled={!authStatus.isAdmin || isBusy}
                            onClick={() =>
                              setDeleteConfirm({
                                kind: 'store_image',
                                storeId: st.id,
                                storeName: st.name,
                                field: 'coverImage',
                                url: coverUrl,
                              })
                            }
                            className="p-1.5 rounded-xl bg-[#fdeeed] text-rose-700"
                            title="حذف الغلاف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Store Internal Gallery */}
                  {gallery.length > 0 && (
                    <div className="px-3 pb-3 space-y-1.5">
                      <b className="text-[11px] text-slate-700 block">الصور الداخلية للمتجر ({gallery.length}):</b>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {gallery.map((gUrl, idx) => (
                          <div key={`${gUrl.slice(-16)}-${idx}`} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                            <img src={gUrl} alt={`${st.name} ${idx + 1}`} className="w-full h-24 object-cover" referrerPolicy="no-referrer" />
                            <div className="p-1 flex justify-between gap-1 bg-white">
                              <button
                                type="button"
                                onClick={() =>
                                  openFilePicker({
                                    target: 'store',
                                    storeId: st.id,
                                    storeName: st.name,
                                    field: 'gallery_replace',
                                    galleryIndex: idx,
                                    existingUrl: gUrl,
                                    aspect: '4:3',
                                    placementLabel: `استبدال صورة داخلية #${idx + 1} لمتجر ${st.name}`,
                                  })
                                }
                                className="text-[10px] font-bold text-[#064b3d] px-1.5 py-0.5 rounded bg-[#edf6f0]"
                              >
                                استبدال
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirm({
                                    kind: 'store_image',
                                    storeId: st.id,
                                    storeName: st.name,
                                    field: 'gallery',
                                    galleryIndex: idx,
                                    url: gUrl,
                                  })
                                }
                                className="text-[10px] font-bold text-rose-700 px-1.5 py-0.5 rounded bg-[#fdeeed]"
                              >
                                حذف
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>
      )}

      {/* TAB 4: LIVE FIRESTORE CATEGORIES & PRODUCTS (PRICES PRESERVED) */}
      {activeTab === 'catalog' && (
        <div className="space-y-3">
          <div className="flex gap-2 bg-white p-2 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setCatalogMode('categories')}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 ${
                catalogMode === 'categories' ? 'bg-[#064b3d] text-white' : 'bg-slate-50 text-slate-700'
              }`}
            >
              <FolderTree className="w-4 h-4" /> الأقسام والأقسام الفرعية ({filteredCategories.length})
            </button>
            <button
              type="button"
              onClick={() => setCatalogMode('products')}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 ${
                catalogMode === 'products' ? 'bg-[#064b3d] text-white' : 'bg-slate-50 text-slate-700'
              }`}
            >
              <Package className="w-4 h-4" /> المنتجات والخدمات ({filteredProducts.length})
            </button>
          </div>

          {catalogMode === 'categories' ? (
            filteredCategories.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2">
                <FolderTree className="w-10 h-10 text-slate-300 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">لا توجد أقسام مخصصة في Firestore بعد</h3>
                <p className="text-xs text-slate-500">
                  يمكنك إضافة الأقسام من «إدارة الأقسام» في لوحة الإدارة أو استخدام تبويب «الأنشطة والأسماء» أعلاه للتحكم الفوري بالأنشطة الرئيسية.
                </p>
              </div>
            ) : (
              filteredCategories.map((cat) => (
                <article key={cat.id} className="bg-white rounded-2xl border border-[#e0e8e2] p-3 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <img
                        src={cat.imageUrl || '/assets/market.jpg'}
                        alt={cat.title}
                        className="w-14 h-14 rounded-xl object-cover border border-slate-200"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <h3 className="text-sm font-black text-[#064b3d]">{cat.title}</h3>
                        <p className="text-[11px] text-slate-500">{cat.detail || 'قسم رئيسي في المنصة'}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={!authStatus.isAdmin || busyKey === `cat-${cat.id}`}
                        onClick={() =>
                          openFilePicker({
                            target: 'category',
                            catId: cat.id,
                            catName: cat.title,
                            existingUrl: cat.imageUrl,
                            placementLabel: `صورة قسم ${cat.title}`,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-[#edf6f0] text-[#064b3d] text-[11px] font-bold"
                      >
                        تغيير الصورة
                      </button>
                      {cat.imageUrl && (
                        <button
                          type="button"
                          disabled={!authStatus.isAdmin}
                          onClick={() =>
                            setDeleteConfirm({
                              kind: 'category_image',
                              catId: cat.id,
                              catName: cat.title,
                              url: cat.imageUrl || '/assets/market.jpg',
                            })
                          }
                          className="p-1.5 rounded-xl bg-[#fdeeed] text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )
          ) : (
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900">
                حماية البيانات: يتم هنا تعديل أو استبدال أو حذف صور المنتجات فقط مع الحفاظ التام على الأسعار والمخزون وتفاصيل المنتج.
              </div>
              {filteredProducts.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-2">
                  <Package className="w-10 h-10 text-slate-300 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-800">لا توجد منتجات مسجلة في Firestore مطابقة لبحثك</h3>
                </div>
              ) : (
                filteredProducts.map((prod) => {
                  const imgs = Array.isArray(prod.images) ? prod.images : []
                  const isBusy = busyKey === `prod-${prod.id}`
                  return (
                    <article key={prod.id} className="bg-white rounded-2xl border border-[#e0e8e2] p-3 space-y-2.5 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-black text-[#064b3d]">{prod.name}</h3>
                          <p className="text-[11px] text-slate-600">
                            السعر المحمي: <b>{Number(prod.price || 0).toLocaleString()} {prod.currency || 'YER'}</b> · {prod.category || 'منتج'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!authStatus.isAdmin || isBusy}
                          onClick={() =>
                            openFilePicker({
                              target: 'product',
                              productId: prod.id,
                              productName: prod.name,
                              mode: 'add',
                              existingUrl: imgs[0],
                              placementLabel: `إضافة صورة جديدة لمنتج ${prod.name}`,
                            })
                          }
                          className="px-3 py-1.5 rounded-xl bg-[#064b3d] text-white text-[11px] font-bold flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> إضافة صورة
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {imgs.map((pUrl, idx) => (
                          <div key={`${pUrl.slice(-16)}-${idx}`} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                            <img src={pUrl} alt={prod.name} className="w-full h-24 object-cover" referrerPolicy="no-referrer" />
                            <div className="p-1.5 flex justify-between gap-1 bg-white">
                              <button
                                type="button"
                                disabled={!authStatus.isAdmin || isBusy}
                                onClick={() =>
                                  openFilePicker({
                                    target: 'product',
                                    productId: prod.id,
                                    productName: prod.name,
                                    mode: 'replace',
                                    imageIndex: idx,
                                    existingUrl: pUrl,
                                    placementLabel: `استبدال صورة #${idx + 1} للمنتج ${prod.name}`,
                                  })
                                }
                                className="text-[10px] font-bold text-[#064b3d] px-2 py-0.5 rounded bg-[#edf6f0]"
                              >
                                استبدال
                              </button>
                              <button
                                type="button"
                                disabled={!authStatus.isAdmin || isBusy}
                                onClick={() =>
                                  setDeleteConfirm({
                                    kind: 'product_image',
                                    productId: prod.id,
                                    productName: prod.name,
                                    imageIndex: idx,
                                    url: pUrl,
                                  })
                                }
                                className="text-[10px] font-bold text-rose-700 px-2 py-0.5 rounded bg-[#fdeeed]"
                              >
                                حذف
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Carousel Route / Label Editor */}
      {editingSlideRoute && (
        <div
          className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => setEditingSlideRoute(null)}
        >
          <form
            onSubmit={handleSaveSlideRouteMeta}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200"
          >
            <header className="bg-[#064b3d] text-white px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-extrabold">تعديل عنوان ورابط البنر</h3>
              <button type="button" onClick={() => setEditingSlideRoute(null)}>
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-4 space-y-3 text-xs">
              <label className="block space-y-1">
                <b className="text-slate-700">عنوان البنر:</b>
                <input
                  type="text"
                  value={editingSlideRoute.label}
                  onChange={(e) => setEditingSlideRoute({ ...editingSlideRoute, label: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:border-[#064b3d]"
                />
              </label>
              <label className="block space-y-1">
                <b className="text-slate-700">القسم المرتبط عند الضغط على البنر:</b>
                <select
                  value={editingSlideRoute.route}
                  onChange={(e) => setEditingSlideRoute({ ...editingSlideRoute, route: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:border-[#064b3d]"
                >
                  {CAROUSEL_ROUTES.map((r) => (
                    <option key={r.path} value={r.path}>
                      {r.label} — {r.path}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#064b3d] text-white font-extrabold"
                >
                  حفظ ونشر
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSlideRoute(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal 1: Crop, Aspect, Clarity Enhancer & Pre-Publish Preview */}
      {editorState && (
        <ImageCropEnhanceModal
          file={editorState.file}
          slotTitle={
            editorState.target === 'slot'
              ? editorState.slot.pageName
              : editorState.target === 'store'
                ? editorState.storeName
                : editorState.target === 'category'
                  ? editorState.catName
                  : editorState.productName
          }
          placementLabel={
            editorState.target === 'slot'
              ? editorState.slot.placementLabel
              : editorState.placementLabel
          }
          defaultAspect={
            editorState.target === 'slot'
              ? editorState.slot.recommendedAspect
              : editorState.target === 'store'
                ? editorState.aspect
                : '4:3'
          }
          existingImageUrl={editorState.existingUrl}
          modeLabel={
            editorState.target === 'slot'
              ? editorState.mode === 'replace'
                ? 'تغيير الصورة'
                : 'إضافة صورة جديدة'
              : 'تجهيز ونشر الصورة'
          }
          initialLabel={
            editorState.target === 'slot'
              ? editorState.initialLabel || editorState.slot.pageName
              : editorState.placementLabel
          }
          onClose={() => setEditorState(null)}
          onPublish={handlePublishEditedImage}
        />
      )}

      {/* Modal 2: Full Image Preview */}
      {previewState && (
        <div
          className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => setPreviewState(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="bg-[#064b3d] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold">معاينة الصورة — {previewState.title}</h3>
                <p className="text-[11px] text-[#f5ead0]">{previewState.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewState(null)}
                className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-4 space-y-3 bg-[#f7faf8]">
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white max-h-[340px] flex items-center justify-center">
                <img
                  src={previewState.url}
                  alt={previewState.label || previewState.title}
                  className="w-full max-h-[340px] object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewState(null)}
                  className="px-4 py-2 rounded-xl bg-[#064b3d] text-white text-xs font-bold"
                >
                  إغلاق المعاينة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Safe Delete Confirmation */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl border border-rose-200"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="bg-rose-700 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-sm font-extrabold">تأكيد حذف الصورة</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                هل أنت متأكد من حذف هذه الصورة؟
                {deleteConfirm.kind === 'slot' && deleteConfirm.isDefaultOnly
                  ? ' سيتم الإبقاء على الصورة الافتراضية الأساسية لحماية الصفحة من الظهور بدون صورة.'
                  : ' لن يظهر أي رابط مكسور للمستخدمين بعد الحذف.'}
              </p>
              <div className="h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img
                  src={
                    deleteConfirm.kind === 'slot'
                      ? deleteConfirm.image.url
                      : deleteConfirm.url
                  }
                  alt="معاينة الصورة المحددة للحذف"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={busyKey !== null}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-extrabold hover:bg-rose-700"
                >
                  {busyKey !== null ? 'جارٍ الحذف...' : 'نعم، احذف الصورة'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function makeDefaultEntry(
  id: string,
  url: string,
  label: string,
  order = 1,
  isPrimary = true,
  route?: string,
): AppImageEntry {
  return {
    id,
    url,
    label,
    route,
    active: true,
    isPrimary,
    order,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
