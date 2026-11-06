export type ThemeColors = {
  forest: string
  forestDark: string
  gold: string
  goldPale: string
  cream: string
  bgLight: string
}

export type BrandAssets = {
  platformName: string
  platformTagline: string
  logoText: string
  appIconUrl: string
  welcomeBannerUrl: string
  scenicLandscapeUrl: string
}

export type HomeSectionId =
  | 'heroCarousel'
  | 'quickActivities'
  | 'exchangeRemittance'
  | 'featuredStores'
  | 'promotions'
  | 'vehiclesRealEstate'
  | 'shareAndEarn'

export type HomeSection = {
  id: HomeSectionId
  title: string
  subtitle: string
  visible: boolean
  order: number
}

export type AnnouncementBanner = {
  enabled: boolean
  text: string
  link: string
  tone: 'gold' | 'green' | 'amber'
}

export type AppAppearance = {
  version: number
  updatedAt: string
  colors: ThemeColors
  brand: BrandAssets
  sections: HomeSection[]
  announcement: AnnouncementBanner
}

export const defaultAppearance: AppAppearance = {
  version: 1,
  updatedAt: new Date().toISOString(),
  colors: {
    forest: '#064b3d',
    forestDark: '#03372d',
    gold: '#c7942c',
    goldPale: '#f5ead0',
    cream: '#faf8f0',
    bgLight: '#f5f7f4',
  },
  brand: {
    platformName: 'يافع ون | Yafa One',
    platformTagline: 'من الجبل إلى بيتك',
    logoText: 'يافع ون',
    appIconUrl: '/icons/icon-512.png',
    welcomeBannerUrl: '/assets/carousel/welcome.jpg',
    scenicLandscapeUrl: '/assets/yafa-mountains.jpg',
  },
  sections: [
    {
      id: 'heroCarousel',
      title: 'شريط البانرات الإعلانية المتحرك',
      subtitle: 'البنرات الرئيسية والعروض الدورية أعلى الصفحة',
      visible: true,
      order: 1,
    },
    {
      id: 'quickActivities',
      title: 'دليل الأنشطة والخدمات التجارية',
      subtitle: 'المطاعم، التموينات، مواد البناء، الصيدليات، والمزيد',
      visible: true,
      order: 2,
    },
    {
      id: 'exchangeRemittance',
      title: 'خدمات الصرافة والشبكة الموحدة',
      subtitle: 'أسعار الصرف المعتمدة والاستعلام عن الحوالات',
      visible: true,
      order: 3,
    },
    {
      id: 'featuredStores',
      title: 'المتاجر والمنشآت المعتمدة في يافع',
      subtitle: 'استعراض المنشآت النشطة حسب المديرية',
      visible: false,
      order: 4,
    },
    {
      id: 'promotions',
      title: 'العروض والخصومات الخاصة',
      subtitle: 'أحدث عروض المتاجر والمنتجات المخفضة',
      visible: false,
      order: 5,
    },
    {
      id: 'vehiclesRealEstate',
      title: 'السيارات والعقارات وحراج المستعمل',
      subtitle: 'سوق البيع والشراء المباشر بين أهالي يافع',
      visible: false,
      order: 6,
    },
    {
      id: 'shareAndEarn',
      title: 'برنامج شارك واربح (الإحالات)',
      subtitle: 'مكافآت دعوة المنشآت والمستخدمين',
      visible: true,
      order: 7,
    },
  ],
  announcement: {
    enabled: false,
    text: 'أهلاً بكم في يافع ون - أول منصة تجارية متكاملة لخدمة أبناء يافع',
    link: '/visitor/stores',
    tone: 'gold',
  },
}

export const colorPresets: { id: string; name: string; colors: ThemeColors }[] = [
  {
    id: 'default',
    name: 'أصلي يافع ون (أخضر داكن وذهبي)',
    colors: {
      forest: '#064b3d',
      forestDark: '#03372d',
      gold: '#c7942c',
      goldPale: '#f5ead0',
      cream: '#faf8f0',
      bgLight: '#f5f7f4',
    },
  },
  {
    id: 'emerald',
    name: 'الزمرد الملكي اليافعي',
    colors: {
      forest: '#085a4a',
      forestDark: '#043b30',
      gold: '#d4af37',
      goldPale: '#fef7e0',
      cream: '#fdfbf7',
      bgLight: '#f4f8f6',
    },
  },
  {
    id: 'olive',
    name: 'الزيتوني العتيق الأصيل',
    colors: {
      forest: '#1b4d3e',
      forestDark: '#12372c',
      gold: '#d99b26',
      goldPale: '#f9f0d8',
      cream: '#fcfaf5',
      bgLight: '#f5f6f3',
    },
  },
  {
    id: 'modern',
    name: 'العصري الأنيق (جبلي نيلي)',
    colors: {
      forest: '#0b474e',
      forestDark: '#063237',
      gold: '#c4892e',
      goldPale: '#faecd4',
      cream: '#f8faf9',
      bgLight: '#f0f5f5',
    },
  },
]

export const APPEARANCE_STORAGE_KEY = 'yafa-app-appearance-v1'
export const APPEARANCE_EVENT_NAME = 'yafa-appearance-updated'

/**
 * Apply the appearance colors directly to CSS Custom Properties on document root
 */
export function applyAppearanceToDOM(appearance: AppAppearance) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const c = appearance.colors

  if (c.forest) root.style.setProperty('--forest', c.forest)
  if (c.forestDark) root.style.setProperty('--forest-dark', c.forestDark)
  if (c.gold) root.style.setProperty('--gold', c.gold)
  if (c.goldPale) root.style.setProperty('--gold-pale', c.goldPale)
  if (c.cream) root.style.setProperty('--cream', c.cream)
  if (c.bgLight) {
    root.style.setProperty('--bg-light', c.bgLight)
    document.body.style.backgroundColor = c.bgLight
  }

  // Also set custom tailwind compatible props if used
  root.style.setProperty('--color-forest', c.forest)
  root.style.setProperty('--color-forest-dark', c.forestDark)
  root.style.setProperty('--color-gold', c.gold)
  root.style.setProperty('--color-cream', c.cream)
}

/**
 * Get the currently cached appearance from localStorage or fallback to default
 */
export function getLocalAppearance(): AppAppearance {
  if (typeof window === 'undefined') return defaultAppearance
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...defaultAppearance,
        ...parsed,
        colors: { ...defaultAppearance.colors, ...parsed.colors },
        brand: { ...defaultAppearance.brand, ...parsed.brand },
        announcement: { ...defaultAppearance.announcement, ...parsed.announcement },
        sections: Array.isArray(parsed.sections) ? parsed.sections : defaultAppearance.sections,
      }
    }
  } catch {
    // fallback
  }
  return defaultAppearance
}

/**
 * Save appearance locally and broadcast change to all components
 */
export function setLocalAppearance(appearance: AppAppearance) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance))
    applyAppearanceToDOM(appearance)
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT_NAME, { detail: appearance }))
  } catch (e) {
    console.error('Failed to set local appearance:', e)
  }
}
