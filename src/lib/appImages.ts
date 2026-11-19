'use client'

import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage, logFirestoreError, OperationType } from '@/lib/firebase'

export type AppImageGroupId =
  | 'home'
  | 'banners'
  | 'activities'
  | 'stores'
  | 'products'
  | 'fuel_gas'
  | 'finance'
  | 'used_vehicles'
  | 'pages'

export type AspectPreset = 'free' | '16:9' | '4:3' | '1:1'

export type AppImageEntry = {
  id: string
  url: string
  storagePath?: string
  label?: string
  route?: string
  startsAt?: string
  endsAt?: string
  active?: boolean
  isPrimary: boolean
  order: number
  updatedAt: string
}

export type AppImageSlotDef = {
  id: string
  group: AppImageGroupId
  pageName: string
  placementLabel: string
  recommendedAspect: AspectPreset
  recommendedDimensions: string
  allowMultiple: boolean
  defaultImages: AppImageEntry[]
}

export type AppImageSlotOverride = {
  slotId: string
  images: AppImageEntry[]
  previousImages?: AppImageEntry[]
  updatedAt: string
  updatedBy?: string
}

export type AppImagesRegistry = Record<string, AppImageSlotOverride>

export type HomeActivityConfigItem = {
  id: string
  name: string
  path: string
  iconKey: string
  defaultImage: string
  defaultBanner: string
  order: number
  visible: boolean
}

export const APP_IMAGE_GROUPS: Array<{ id: AppImageGroupId; label: string }> = [
  { id: 'home', label: 'الصفحة الرئيسية والشعار' },
  { id: 'banners', label: 'البنرات والإعلانات' },
  { id: 'activities', label: 'الأنشطة التجارية' },
  { id: 'stores', label: 'المتاجر والمنشآت' },
  { id: 'products', label: 'المنتجات والسلع' },
  { id: 'fuel_gas', label: 'محطات الوقود والغاز' },
  { id: 'finance', label: 'الصرافة والحوالات' },
  { id: 'used_vehicles', label: 'المستعمل والسيارات والعقارات' },
  { id: 'pages', label: 'بقية الصفحات والبوابات' },
]

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

export const ACTIVITY_DEFS: Array<{
  id: string
  name: string
  path: string
  iconKey: string
  cardUrl: string
  bannerUrl: string
}> = [
  { id: 'restaurants', name: 'المطاعم والمقاهي', path: '/visitor/restaurants', iconKey: 'Utensils', cardUrl: '/assets/activities/restaurants.jpg', bannerUrl: '/assets/activity-banners/restaurants.jpg' },
  { id: 'groceries', name: 'التموينات والمواد الغذائية', path: '/visitor/groceries', iconKey: 'ShoppingCart', cardUrl: '/assets/activities/groceries.jpg', bannerUrl: '/assets/activity-banners/groceries.jpg' },
  { id: 'fashion', name: 'الملابس والأحذية', path: '/visitor/fashion', iconKey: 'ShoppingBag', cardUrl: '/assets/activities/fashion.jpg', bannerUrl: '/assets/activity-banners/fashion.jpg' },
  { id: 'electronics', name: 'الجوالات والإلكترونيات', path: '/visitor/electronics', iconKey: 'Box', cardUrl: '/assets/activities/electronics.jpg', bannerUrl: '/assets/activity-banners/electronics.jpg' },
  { id: 'building', name: 'مواد البناء', path: '/visitor/building', iconKey: 'Building2', cardUrl: '/assets/activities/building.jpg', bannerUrl: '/assets/activity-banners/building.jpg' },
  { id: 'aluminum', name: 'الألمنيوم والزجاج', path: '/visitor/aluminum', iconKey: 'GlassWater', cardUrl: '/assets/activities/aluminum-glass.jpg', bannerUrl: '/assets/activity-banners/aluminum.jpg' },
  { id: 'furniture', name: 'الأثاث والمفروشات', path: '/visitor/furniture', iconKey: 'Home', cardUrl: '/assets/activities/furniture.jpg', bannerUrl: '/assets/activity-banners/furniture.jpg' },
  { id: 'cars', name: 'السيارات', path: '/visitor/dealers', iconKey: 'Car', cardUrl: '/assets/activities/cars.jpg', bannerUrl: '/assets/activity-banners/cars.jpg' },
  { id: 'property', name: 'العقارات', path: '/visitor/property', iconKey: 'Building2', cardUrl: '/assets/activities/property.jpg', bannerUrl: '/assets/activity-banners/property.jpg' },
  { id: 'health', name: 'المستشفيات والمراكز الصحية', path: '/visitor/health', iconKey: 'Stethoscope', cardUrl: '/assets/activities/health.jpg', bannerUrl: '/assets/activity-banners/health.jpg' },
  { id: 'pharmacies', name: 'الصيدليات', path: '/visitor/pharmacies', iconKey: 'Pill', cardUrl: '/assets/activities/pharmacy.jpg', bannerUrl: '/assets/activity-banners/pharmacies.jpg' },
  { id: 'fuel', name: 'محطات الوقود والغاز', path: '/visitor/fuel', iconKey: 'Fuel', cardUrl: '/assets/activities/fuel.jpg', bannerUrl: '/assets/activity-banners/fuel.jpg' },
  { id: 'offices', name: 'مكاتب الخدمات', path: '/visitor/offices', iconKey: 'FileText', cardUrl: '/assets/activities/offices.jpg', bannerUrl: '/assets/activity-banners/offices.jpg' },
  { id: 'maintenance', name: 'الورش والصيانة', path: '/visitor/maintenance', iconKey: 'Wrench', cardUrl: '/assets/activities/maintenance.jpg', bannerUrl: '/assets/activity-banners/maintenance.jpg' },
  { id: 'used', name: 'حراج المستعمل', path: '/visitor/used', iconKey: 'Package', cardUrl: '/assets/activities/used.jpg', bannerUrl: '/assets/activity-banners/used.jpg' },
  { id: 'exchange', name: 'الصرافة والتحويلات', path: '/visitor/exchange', iconKey: 'Landmark', cardUrl: '/assets/activities/exchange.jpg', bannerUrl: '/assets/activity-banners/exchange.jpg' },
  { id: 'professionals', name: 'أصحاب المهن', path: '/visitor/professionals', iconKey: 'Wrench', cardUrl: '/assets/activities/maintenance.jpg', bannerUrl: '/assets/activity-banners/maintenance.jpg' },
]

export const DEFAULT_HOME_ACTIVITIES: HomeActivityConfigItem[] = ACTIVITY_DEFS.map((a, idx) => ({
  id: a.id,
  name: a.name,
  path: a.path,
  iconKey: a.iconKey,
  defaultImage: a.cardUrl,
  defaultBanner: a.bannerUrl,
  order: idx + 1,
  visible: true,
}))

export const APP_IMAGE_SLOTS: AppImageSlotDef[] = [
  // --- الصفحة الرئيسية والشعار ---
  {
    id: 'splash_icon',
    group: 'home',
    pageName: 'شاشة البداية وشعار التطبيق',
    placementLabel: 'شعار شاشة التشغيل الأولية وأيقونة الهوية في شريط التطبيق',
    recommendedAspect: '1:1',
    recommendedDimensions: '512 × 512',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-splash', '/icons/icon-512.png', 'شعار يافع ون الرسمي')],
  },
  {
    id: 'brand_logo',
    group: 'home',
    pageName: 'شعار الهوية العلوي للتطبيق',
    placementLabel: 'الشعار الظاهر في الشريط العلوي لجميع الصفحات',
    recommendedAspect: '1:1',
    recommendedDimensions: '512 × 512',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-brand-logo', '/icons/icon-512.png', 'شعار الهوية الرسمي')],
  },
  {
    id: 'entry_welcome_icon',
    group: 'home',
    pageName: 'مدخل البوابات (/entry)',
    placementLabel: 'أيقونة الترحيب أعلى صفحة اختيار البوابة',
    recommendedAspect: '1:1',
    recommendedDimensions: '512 × 512',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-entry-icon', '/icons/icon-512.png', 'أيقونة مدخل البوابات')],
  },
  {
    id: 'scenic_default_hero',
    group: 'home',
    pageName: 'الواجهة العامة للتطبيق',
    placementLabel: 'الخلفية الجبلية الافتراضية لرؤوس الصفحات العامة',
    recommendedAspect: '16:9',
    recommendedDimensions: '1600 × 900',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-hero', '/assets/yafa-mountains.jpg', 'جبال يافع الشامخة')],
  },
  {
    id: 'home_exchange_card',
    group: 'home',
    pageName: 'الصفحة الرئيسية للزائر (/visitor/home)',
    placementLabel: 'صورة بطاقة «أسعار الصرف – جنوب اليمن» في قسم الخدمات المالية',
    recommendedAspect: '4:3',
    recommendedDimensions: '800 × 600',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-home-exchange', '/assets/activities/exchange.jpg', 'بطاقة أسعار الصرف')],
  },
  {
    id: 'home_remittance_card',
    group: 'home',
    pageName: 'الصفحة الرئيسية للزائر (/visitor/home)',
    placementLabel: 'صورة بطاقة «الاستعلام عن الحوالات» في قسم الخدمات المالية',
    recommendedAspect: '4:3',
    recommendedDimensions: '800 × 600',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-home-remittance', '/assets/activities/remittance.jpg', 'بطاقة الاستعلام عن الحوالات')],
  },

  // --- البنرات والإعلانات ---
  {
    id: 'home_carousel',
    group: 'banners',
    pageName: 'البنرات المتحركة بالصفحة الرئيسية',
    placementLabel: 'شريط البنرات الإعلانية المتحرك أعلى الصفحة الرئيسية (يدعم الترتيب والصور المتعددة)',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [
      makeDefaultEntry('carousel-1', '/assets/carousel/welcome.jpg', 'مرحبًا بكم في يافع ون', 1, true, '/visitor/stores'),
      makeDefaultEntry('carousel-2', '/assets/carousel/marketplace.jpg', 'عروض المواد الغذائية والسوبرماركت', 2, false, '/visitor/groceries'),
      makeDefaultEntry('carousel-3', '/assets/carousel/services.jpg', 'محلات مواد البناء والألمنيوم', 3, false, '/visitor/building'),
      makeDefaultEntry('carousel-4', '/assets/carousel/cars-property.jpg', 'السيارات والعقارات وحراج المستعمل', 4, false, '/visitor/vehicles'),
      makeDefaultEntry('carousel-5', '/assets/carousel/share-rewards.jpg', 'شارك واربح', 5, false, '/visitor/share'),
      makeDefaultEntry('carousel-6', '/assets/carousel/fuel-services.jpg', 'محطات الوقود والخدمات', 6, false, '/visitor/fuel'),
    ],
  },
  {
    id: 'ads_page_banner',
    group: 'banners',
    pageName: 'صفحة الإعلانات والمواضع (/visitor/ads)',
    placementLabel: 'البنر العلوي لصفحة الإعلانات',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-ads-banner', '/assets/carousel/marketplace.jpg', 'بنر الإعلانات')],
  },
  {
    id: 'promotions_page_banner',
    group: 'banners',
    pageName: 'صفحة العروض والتخفيضات (/visitor/offers & /visitor/promotions)',
    placementLabel: 'البنر العلوي لصفحة العروض والخصومات',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-promo-banner', '/assets/carousel/services.jpg', 'بنر العروض والخصومات')],
  },

  // --- الأنشطة التجارية (بطاقة + بنر لكل نشاط) ---
  ...ACTIVITY_DEFS.flatMap((act): AppImageSlotDef[] => [
    {
      id: `activity_card_${act.id}`,
      group: 'activities',
      pageName: 'الصفحة الرئيسية — شبكة الأنشطة التجارية',
      placementLabel: `صورة بطاقة نشاط «${act.name}»`,
      recommendedAspect: '4:3',
      recommendedDimensions: '800 × 600',
      allowMultiple: false,
      defaultImages: [makeDefaultEntry(`def-card-${act.id}`, act.cardUrl, `بطاقة ${act.name}`)],
    },
    {
      id: `activity_banner_${act.id}`,
      group: 'activities',
      pageName: `صفحة قسم «${act.name}»`,
      placementLabel: `البنر العلوي العريض عند دخول قسم «${act.name}»`,
      recommendedAspect: '16:9',
      recommendedDimensions: '1280 × 720',
      allowMultiple: true,
      defaultImages: [makeDefaultEntry(`def-banner-${act.id}`, act.bannerUrl, `بنر ${act.name}`)],
    },
  ]),

  // --- المتاجر والمنشآت ---
  {
    id: 'stores_page_banner',
    group: 'stores',
    pageName: 'صفحة دليل المتاجر (/visitor/stores)',
    placementLabel: 'الصورة الافتراضية وبنر صفحة دليل المتاجر',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-stores-banner', '/assets/market.jpg', 'بنر دليل المتاجر')],
  },
  {
    id: 'store_default_cover',
    group: 'stores',
    pageName: 'بطاقات وصفحات المتاجر (/visitor/store/[id])',
    placementLabel: 'الصورة الافتراضية الرئيسية للمتاجر والمنشآت التجارية',
    recommendedAspect: '4:3',
    recommendedDimensions: '1000 × 750',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-store-cover', '/assets/market.jpg', 'غلاف متجر افتراضي')],
  },
  {
    id: 'store_alt_cover',
    group: 'stores',
    pageName: 'بطاقات المتاجر والخدمات المميزة',
    placementLabel: 'الصورة الافتراضية البديلة للمتاجر التقنية والخدمية',
    recommendedAspect: '4:3',
    recommendedDimensions: '1000 × 750',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-store-alt', '/assets/store.jpg', 'غلاف متجر خدمي وتقني')],
  },

  // --- المنتجات ---
  {
    id: 'product_default_image',
    group: 'products',
    pageName: 'صفحات المنتجات (/visitor/product/[id])',
    placementLabel: 'الصورة الافتراضية لأي منتج بدون صورة مرفوعة',
    recommendedAspect: '1:1',
    recommendedDimensions: '800 × 800',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-product-img', '/assets/market.jpg', 'صورة منتج افتراضية')],
  },
  {
    id: 'product_sample_1',
    group: 'products',
    pageName: 'عروض المنتجات المحلية',
    placementLabel: 'صورة منتج «عسل يافع السدر الطبيعي» والمنتجات الغذائية',
    recommendedAspect: '4:3',
    recommendedDimensions: '800 × 600',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-prod-1', '/assets/market.jpg', 'منتج عسل يافع')],
  },
  {
    id: 'product_sample_2',
    group: 'products',
    pageName: 'عروض المنتجات المحلية',
    placementLabel: 'صورة منتج «قهوة بن يافع الأصيلة»',
    recommendedAspect: '4:3',
    recommendedDimensions: '800 × 600',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-prod-2', '/assets/store.jpg', 'منتج قهوة يافع')],
  },
  {
    id: 'product_sample_3',
    group: 'products',
    pageName: 'عروض الإلكترونيات والتقنية',
    placementLabel: 'صورة منتج «الجوالات والتقنية الحديثة»',
    recommendedAspect: '4:3',
    recommendedDimensions: '800 × 600',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-prod-3', '/assets/car.jpg', 'منتج التقنية')],
  },

  // --- محطات الوقود والغاز المنزلي ---
  {
    id: 'fuel_page_banner',
    group: 'fuel_gas',
    pageName: 'صفحة الوقود والغاز المنزلي (/visitor/fuel)',
    placementLabel: 'البنر الرئيسي أعلى صفحة محطات الوقود وموزعي الغاز',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-fuel-banner', '/assets/activity-banners/fuel.jpg', 'بنر الوقود والغاز المنزلي')],
  },
  {
    id: 'fuel_station_1',
    group: 'fuel_gas',
    pageName: 'صفحة محطات الوقود (/visitor/fuel)',
    placementLabel: 'صورة بطاقة «محطة يافع المركزية — لبعوس»',
    recommendedAspect: '16:9',
    recommendedDimensions: '1000 × 560',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-fuel-st1', '/assets/activity-banners/fuel.jpg', 'محطة يافع المركزية')],
  },
  {
    id: 'fuel_station_2',
    group: 'fuel_gas',
    pageName: 'صفحة محطات الوقود (/visitor/fuel)',
    placementLabel: 'صورة بطاقة «محطة لبعوس الحديثة»',
    recommendedAspect: '16:9',
    recommendedDimensions: '1000 × 560',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-fuel-st2', '/assets/activities/fuel.jpg', 'محطة لبعوس الحديثة')],
  },
  {
    id: 'fuel_station_3',
    group: 'fuel_gas',
    pageName: 'صفحة محطات الوقود (/visitor/fuel)',
    placementLabel: 'صورة بطاقة «محطة رصد النموذجية»',
    recommendedAspect: '16:9',
    recommendedDimensions: '1000 × 560',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-fuel-st3', '/assets/activity-banners/fuel.jpg', 'محطة رصد النموذجية')],
  },
  {
    id: 'gas_distributor_1',
    group: 'fuel_gas',
    pageName: 'صفحة الغاز المنزلي (/visitor/fuel)',
    placementLabel: 'صورة بطاقة «موزع غاز يافع المركزي — لبعوس»',
    recommendedAspect: '16:9',
    recommendedDimensions: '1000 × 560',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-gas-1', '/assets/activities/fuel.jpg', 'موزع غاز يافع المركزي')],
  },
  {
    id: 'gas_distributor_2',
    group: 'fuel_gas',
    pageName: 'صفحة الغاز المنزلي (/visitor/fuel)',
    placementLabel: 'صورة بطاقة «مركز توزيع غاز رصد»',
    recommendedAspect: '16:9',
    recommendedDimensions: '1000 × 560',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-gas-2', '/assets/activity-banners/fuel.jpg', 'مركز توزيع غاز رصد')],
  },
  {
    id: 'gas_distributor_3',
    group: 'fuel_gas',
    pageName: 'صفحة الغاز المنزلي (/visitor/fuel)',
    placementLabel: 'صورة بطاقة «موزع غاز الحد»',
    recommendedAspect: '16:9',
    recommendedDimensions: '1000 × 560',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-gas-3', '/assets/activities/fuel.jpg', 'موزع غاز الحد')],
  },

  // --- الصرافة والحوالات ---
  {
    id: 'exchange_rates_banner',
    group: 'finance',
    pageName: 'صفحة أسعار الصرف – جنوب اليمن (/visitor/exchange-rates)',
    placementLabel: 'صورة الخلفية الرئيسية لصفحة أسعار الصرف',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-exchange-rates-hero', '/assets/activity-banners/exchange.jpg', 'خلفية أسعار الصرف')],
  },
  {
    id: 'remittance_hero',
    group: 'finance',
    pageName: 'صفحة الاستعلام عن الحوالات (/visitor/remittance)',
    placementLabel: 'الصورة الرئيسية لصفحة تتبع الحوالات (الشبكة الموحدة)',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-remittance-hero', '/assets/activity-banners/exchange.jpg', 'الصورة الرئيسية للحوالات')],
  },

  // --- السوق المستعمل والسيارات والعقارات ---
  {
    id: 'used_market_banner',
    group: 'used_vehicles',
    pageName: 'صفحة السوق المستعمل (/visitor/used & /visitor/used/new)',
    placementLabel: 'البنر الرئيسي لصفحة حراج السوق المستعمل وصفحة إضافة إعلان',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-used-banner', '/assets/activity-banners/used.jpg', 'بنر السوق المستعمل')],
  },
  {
    id: 'used_default_item',
    group: 'used_vehicles',
    pageName: 'بطاقات السوق المستعمل (/visitor/used)',
    placementLabel: 'الصورة الافتراضية لإعلانات المستعمل التي لا تحتوي على صورة',
    recommendedAspect: '4:3',
    recommendedDimensions: '800 × 600',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-used-item', '/assets/market.jpg', 'صورة افتراضية للمستعمل')],
  },
  {
    id: 'vehicles_default_card',
    group: 'used_vehicles',
    pageName: 'صفحة السيارات والعقارات (/visitor/vehicles & /visitor/dealers)',
    placementLabel: 'الصورة الافتراضية لبطاقات السيارات والمعارض',
    recommendedAspect: '4:3',
    recommendedDimensions: '800 × 600',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-vehicles-card', '/assets/car.jpg', 'صورة السيارات')],
  },
  {
    id: 'property_page_banner',
    group: 'used_vehicles',
    pageName: 'صفحة العقارات والأراضي (/visitor/property)',
    placementLabel: 'البنر الرئيسي لصفحة العقارات والأراضي في يافع',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-property-banner', '/assets/activity-banners/property.jpg', 'بنر العقارات والأراضي')],
  },

  // --- بقية الصفحات والبوابات ---
  {
    id: 'professionals_default_avatar',
    group: 'pages',
    pageName: 'صفحة أصحاب المهن (/visitor/professionals)',
    placementLabel: 'الصورة الافتراضية لبطاقات أصحاب المهن والحرفيين',
    recommendedAspect: '1:1',
    recommendedDimensions: '600 × 600',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-prof-avatar', '/assets/activities/maintenance.jpg', 'صورة افتراضية لأصحاب المهن')],
  },
  {
    id: 'orders_page_banner',
    group: 'pages',
    pageName: 'صفحة الطلبات والسلة (/visitor/orders & /visitor/cart)',
    placementLabel: 'صورة الترويسة في صفحات الطلبات وسلة التسوق',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-orders-banner', '/assets/yafa-mountains.jpg', 'بنر الطلبات والسلة')],
  },
  {
    id: 'notifications_banner',
    group: 'pages',
    pageName: 'صفحة الإشعارات والتنبيهات (/visitor/notifications)',
    placementLabel: 'صورة الترويسة في صفحة الإشعارات',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-notif-banner', '/assets/yafa-mountains.jpg', 'بنر الإشعارات')],
  },
  {
    id: 'auth_login_banner',
    group: 'pages',
    pageName: 'صفحة تسجيل الدخول والحسابات (/auth/*)',
    placementLabel: 'الصورة الترحيبية أعلى صفحات تسجيل الدخول',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: false,
    defaultImages: [makeDefaultEntry('default-auth-banner', '/assets/yafa-mountains.jpg', 'صورة صفحات تسجيل الدخول')],
  },
  {
    id: 'share_earn_hero',
    group: 'pages',
    pageName: 'صفحة شارك واربح (/visitor/share)',
    placementLabel: 'الصورة الترويجية الرئيسية لبرنامج الإحالات والمكافآت',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-share-hero', '/assets/carousel/share-rewards.jpg', 'بنر شارك واربح')],
  },
  {
    id: 'owner_dashboard_banner',
    group: 'pages',
    pageName: 'بوابة صاحب المنشأة (/owner/*)',
    placementLabel: 'خلفية الترويسة في لوحة تحكم صاحب المنشأة وبقية صفحات المالك',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-owner-banner', '/assets/yafa-mountains.jpg', 'ترويسة لوحة صاحب المنشأة')],
  },
  {
    id: 'admin_header_banner',
    group: 'pages',
    pageName: 'بوابة الإدارة العامة (/admin/*)',
    placementLabel: 'خلفية الترويسة العلوية في لوحة الإدارة العامة',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-admin-banner', '/assets/yafa-mountains.jpg', 'خلفية ترويسة الإدارة')],
  },
  {
    id: 'visitor_utility_banner',
    group: 'pages',
    pageName: 'صفحات الزائر المساعدة (المفضلة، المحادثات، البحث)',
    placementLabel: 'الخلفية الموحدة لصفحات المفضلة والمحادثات والبحث',
    recommendedAspect: '16:9',
    recommendedDimensions: '1280 × 720',
    allowMultiple: true,
    defaultImages: [makeDefaultEntry('default-utility-banner', '/assets/yafa-mountains.jpg', 'بنر صفحات الزائر المساعدة')],
  },
]

export const APP_IMAGES_CACHE_KEY = 'yafa-app-images-registry-v1'
export const APP_IMAGES_EVENT = 'yafa-app-images-updated'

export const ACTIVITIES_CONFIG_CACHE_KEY = 'yafa-home-activities-config-v1'
export const ACTIVITIES_CONFIG_EVENT = 'yafa-home-activities-updated'

const AUTHORIZED_ADMIN_EMAILS = new Set([
  'majdaltrki8@gmail.com',
])

export function getLocalAppImagesRegistry(): AppImagesRegistry {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(APP_IMAGES_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as AppImagesRegistry) : {}
  } catch {
    return {}
  }
}

export function setLocalAppImagesRegistry(registry: AppImagesRegistry): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APP_IMAGES_CACHE_KEY, JSON.stringify(registry))
    window.dispatchEvent(new CustomEvent(APP_IMAGES_EVENT, { detail: registry }))
  } catch {
    // non-fatal
  }
}

export function getSlotDef(slotId: string): AppImageSlotDef | undefined {
  return APP_IMAGE_SLOTS.find((s) => s.id === slotId)
}

export function resolveSlotImages(
  registry: AppImagesRegistry,
  slotId: string,
): AppImageEntry[] {
  const override = registry[slotId]
  if (override && Array.isArray(override.images) && override.images.length > 0) {
    return [...override.images].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }
  const def = getSlotDef(slotId)
  return def ? [...def.defaultImages] : []
}

export function resolveSlotPrimaryImage(
  registry: AppImagesRegistry,
  slotId: string,
  fallbackUrl?: string,
): string {
  const imgs = resolveSlotImages(registry, slotId)
  const primary = imgs.find((i) => i.isPrimary) || imgs[0]
  return primary?.url || fallbackUrl || '/assets/yafa-mountains.jpg'
}

/**
 * Compress & resize image client-side cleanly before Firebase Storage upload
 */
export async function compressImageFileToBlob(
  file: File,
  maxDimension = 1600,
  quality = 0.84,
): Promise<{ blob: Blob; ext: string; dataUrlFallback?: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة صالح (JPG, PNG, WebP).')
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('حجم الصورة يتجاوز الحد الأقصى المسموح (15MB).')
  }

  if (typeof document === 'undefined') {
    return { blob: file, ext: 'jpg' }
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return { blob: file, ext: 'jpg' }
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const usePng = file.type === 'image/png'
    const mime = usePng ? 'image/png' : 'image/webp'
    const ext = usePng ? 'png' : 'webp'
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (res) => {
          if (res) resolve(res)
          else {
            canvas.toBlob(
              (fb) => (fb ? resolve(fb) : reject(new Error('تعذر ضغط الصورة'))),
              'image/jpeg',
              quality,
            )
          }
        },
        mime,
        quality,
      )
    })

    return {
      blob,
      ext: blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : ext,
      dataUrlFallback: canvas.toDataURL(blob.type || 'image/webp', quality),
    }
  } catch {
    return { blob: file, ext: file.type.includes('png') ? 'png' : 'jpg' }
  }
}

/**
 * Verify Firebase Auth user has actual Admin permission (verified email OR admins/{uid} document)
 */
export async function verifyFirebaseAdminAuthority(): Promise<{
  isAdmin: boolean
  uid: string | null
  email: string | null
  emailVerified: boolean
  reason?: string
}> {
  const user = auth.currentUser
  if (!user) {
    return {
      isAdmin: false,
      uid: null,
      email: null,
      emailVerified: false,
      reason: 'يجب تسجيل الدخول بحساب المدير المعتمد عبر Firebase Authentication.',
    }
  }

  const email = (user.email || '').toLowerCase()
  const emailVerified = Boolean(user.emailVerified)

  if (email === 'majdaltrki8@gmail.com' && emailVerified) {
    return { isAdmin: true, uid: user.uid, email, emailVerified }
  }

  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid))
    if (adminSnap.exists()) {
      return { isAdmin: true, uid: user.uid, email, emailVerified }
    }
  } catch {
    // ignore read error and evaluate remaining checks
  }

  if (AUTHORIZED_ADMIN_EMAILS.has(email) && !emailVerified) {
    return {
      isAdmin: false,
      uid: user.uid,
      email,
      emailVerified,
      reason: 'بريد المدير مسجل ولكن لم يتم تأكيد البريد الإلكتروني في Firebase (emailVerified) أو ربط سجل admins/{uid}.',
    }
  }

  return {
    isAdmin: false,
    uid: user.uid,
    email,
    emailVerified,
    reason: 'غير مصرح: هذا الحساب لا يملك صلاحية مدير النظام في Firebase.',
  }
}

/**
 * Write real Audit entry into Firestore `auditLogs/{id}` alongside local backup
 */
export async function recordAdminAuditFirestore(params: {
  action: string
  section: string
  target: string
  admin?: string
}): Promise<void> {
  const user = auth.currentUser
  const entryId = `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const timestamp = new Date().toISOString()
  const adminName = params.admin || user?.email || 'المدير العام'

  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem('yafa-audit-logs')
      const logs = raw ? (JSON.parse(raw) as any[]) : []
      const next = [
        {
          id: entryId,
          action: params.action,
          section: params.section,
          target: params.target,
          admin: adminName,
          timestamp,
        },
        ...logs,
      ].slice(0, 120)
      window.localStorage.setItem('yafa-audit-logs', JSON.stringify(next))
    }
  } catch {}

  if (!user) return

  try {
    await setDoc(doc(db, 'auditLogs', entryId), {
      id: entryId,
      action: String(params.action).slice(0, 160),
      section: String(params.section).slice(0, 120),
      target: String(params.target).slice(0, 300),
      admin: String(adminName).slice(0, 160),
      adminUid: user.uid,
      adminEmail: (user.email || '').toLowerCase(),
      timestamp,
      createdAt: timestamp,
    })
  } catch (err) {
    logFirestoreError(err, OperationType.CREATE, `auditLogs/${entryId}`)
  }
}

/**
 * Upload an image File/Blob to Firebase Storage under app-images/{slotId}/...
 * Requires active Admin Firebase Auth session.
 */
export async function uploadAppImageToStorage(
  blob: Blob,
  slotId: string,
  fileExt = 'webp',
): Promise<{ url: string; storagePath: string }> {
  const check = await verifyFirebaseAdminAuthority()
  if (!check.isAdmin) {
    throw new Error(check.reason || 'غير مصرح برفع الصور إلى Firebase Storage.')
  }

  const safeSlot = slotId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const storagePath = `app-images/${safeSlot}/${Date.now()}.${fileExt}`
  const storageRef = ref(storage, storagePath)
  const contentType = blob.type || (fileExt === 'png' ? 'image/png' : fileExt === 'jpg' ? 'image/jpeg' : 'image/webp')

  const snap = await uploadBytes(storageRef, blob, {
    contentType,
    customMetadata: {
      uploadedBy: check.uid || 'admin',
      slotId: safeSlot,
    },
  })
  const url = await getDownloadURL(snap.ref)
  return { url, storagePath }
}

/**
 * Admin upload helper for dynamic Firestore entities (establishments, products, categories)
 */
export async function uploadAdminEntityImageToStorage(
  blob: Blob,
  entityFolder: 'establishments' | 'products' | 'categories',
  entityId: string,
  fileExt = 'webp',
): Promise<{ url: string; storagePath: string }> {
  const check = await verifyFirebaseAdminAuthority()
  if (!check.isAdmin) {
    throw new Error(check.reason || 'غير مصرح برفع الصور.')
  }
  const safeId = entityId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'item'
  const storagePath = `${entityFolder}/${safeId}/${Date.now()}.${fileExt}`
  const storageRef = ref(storage, storagePath)
  const contentType = blob.type || (fileExt === 'png' ? 'image/png' : fileExt === 'jpg' ? 'image/jpeg' : 'image/webp')

  const snap = await uploadBytes(storageRef, blob, {
    contentType,
    customMetadata: {
      uploadedBy: check.uid || 'admin',
      entityFolder,
      entityId: safeId,
    },
  })
  const url = await getDownloadURL(snap.ref)
  return { url, storagePath }
}

/**
 * Mirror compatible legacy settings documents so legacy listeners stay synchronized
 */
async function syncLegacyCompatibilityDocs(
  slotId: string,
  nextImages: AppImageEntry[],
): Promise<void> {
  if (!auth.currentUser) return
  const primaryUrl = (nextImages.find((i) => i.isPrimary) || nextImages[0])?.url

  if (slotId === 'remittance_hero' && primaryUrl) {
    await setDoc(
      doc(db, 'settings', 'remittanceHero'),
      {
        imageUrl: primaryUrl,
        updatedAt: new Date().toISOString(),
        adminEmail: auth.currentUser.email || 'majdaltrki8@gmail.com',
      },
      { merge: true },
    ).catch((err) => logFirestoreError(err, OperationType.WRITE, 'settings/remittanceHero'))
  }

  if (slotId.startsWith('activity_card_') && primaryUrl) {
    const actId = slotId.replace('activity_card_', '')
    await setDoc(
      doc(db, 'settings', 'activityImages'),
      {
        cards: { [actId]: primaryUrl },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    ).catch((err) => logFirestoreError(err, OperationType.WRITE, 'settings/activityImages'))
  }

  if (slotId.startsWith('activity_banner_') && primaryUrl) {
    const actId = slotId.replace('activity_banner_', '')
    await setDoc(
      doc(db, 'settings', 'activityImages'),
      {
        banners: { [actId]: primaryUrl },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    ).catch((err) => logFirestoreError(err, OperationType.WRITE, 'settings/activityImages'))
  }
}

/**
 * Persist a slot's image configuration in Firestore `appImages/{slotId}`
 * keeping previousImages so admin can restore previous image anytime.
 */
export async function persistAppImageSlot(
  slotId: string,
  nextImages: AppImageEntry[],
  previousImages: AppImageEntry[],
): Promise<AppImageSlotOverride> {
  const check = await verifyFirebaseAdminAuthority()
  if (!check.isAdmin) {
    throw new Error(check.reason || 'غير مصرح بحفظ صور التطبيق.')
  }

  // Ensure valid normalized order and exactly one primary image if non-empty
  let normalized = nextImages.map((img, idx) => ({
    id: String(img.id || `img-${Date.now()}-${idx}`),
    url: String(img.url),
    ...(img.storagePath ? { storagePath: String(img.storagePath) } : {}),
    ...(img.label ? { label: String(img.label) } : {}),
    ...(img.route ? { route: String(img.route) } : {}),
    ...(img.startsAt ? { startsAt: String(img.startsAt) } : {}),
    ...(img.endsAt ? { endsAt: String(img.endsAt) } : {}),
    active: img.active !== false,
    isPrimary: Boolean(img.isPrimary),
    order: idx + 1,
    updatedAt: img.updatedAt || new Date().toISOString(),
  }))

  if (normalized.length > 0 && !normalized.some((i) => i.isPrimary)) {
    normalized = normalized.map((i, idx) => ({ ...i, isPrimary: idx === 0 }))
  }

  const slotDef = getSlotDef(slotId)
  const docPayload: AppImageSlotOverride & { pageName?: string; placementLabel?: string } = {
    slotId,
    pageName: slotDef?.pageName || slotId,
    placementLabel: slotDef?.placementLabel || slotId,
    images: normalized,
    previousImages: previousImages.slice(0, 20).map((img, idx) => ({
      ...img,
      order: idx + 1,
    })),
    updatedAt: new Date().toISOString(),
    updatedBy: check.email || check.uid || 'admin',
  }

  const path = `appImages/${slotId}`
  try {
    await setDoc(doc(db, 'appImages', slotId), docPayload)
  } catch (err) {
    logFirestoreError(err, OperationType.WRITE, path)
    throw new Error('رفضت قواعد أمان Firestore العملية. تأكد من تسجيل الدخول بحساب المدير الموثق.')
  }

  await syncLegacyCompatibilityDocs(slotId, normalized)

  const current = getLocalAppImagesRegistry()
  const updatedRegistry: AppImagesRegistry = {
    ...current,
    [slotId]: {
      slotId,
      images: normalized,
      previousImages: docPayload.previousImages,
      updatedAt: docPayload.updatedAt,
      updatedBy: docPayload.updatedBy,
    },
  }
  setLocalAppImagesRegistry(updatedRegistry)

  await recordAdminAuditFirestore({
    action: 'تحديث صور التطبيق',
    section: 'إدارة صور التطبيق',
    target: `${docPayload.pageName} (${slotId})`,
    admin: check.email || undefined,
  })

  return updatedRegistry[slotId]
}

/**
 * Live Home Activities Config (Name, Ordering, Visibility) persisted in Firestore `settings/activitiesConfig`
 */
export function getLocalActivitiesConfig(): HomeActivityConfigItem[] {
  if (typeof window === 'undefined') return DEFAULT_HOME_ACTIVITIES
  try {
    const raw = window.localStorage.getItem(ACTIVITIES_CONFIG_CACHE_KEY)
    if (!raw) return DEFAULT_HOME_ACTIVITIES
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_HOME_ACTIVITIES
    const map = new Map<string, HomeActivityConfigItem>()
    DEFAULT_HOME_ACTIVITIES.forEach((d) => map.set(d.id, d))
    parsed.forEach((item: any) => {
      if (item && item.id) {
        const base = map.get(item.id)
        map.set(item.id, {
          id: String(item.id),
          name: String(item.name || base?.name || item.id),
          path: String(item.path || base?.path || `/visitor/${item.id}`),
          iconKey: String(item.iconKey || base?.iconKey || 'Store'),
          defaultImage: String(item.defaultImage || base?.defaultImage || '/assets/market.jpg'),
          defaultBanner: String(item.defaultBanner || base?.defaultBanner || '/assets/yafa-mountains.jpg'),
          order: Number(item.order ?? base?.order ?? 99),
          visible: item.visible !== false,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => a.order - b.order)
  } catch {
    return DEFAULT_HOME_ACTIVITIES
  }
}

export async function persistActivitiesConfig(
  nextActivities: HomeActivityConfigItem[],
): Promise<HomeActivityConfigItem[]> {
  const check = await verifyFirebaseAdminAuthority()
  if (!check.isAdmin) {
    throw new Error(check.reason || 'غير مصرح بتعديل الأنشطة.')
  }

  const normalized = nextActivities.map((act, idx) => ({
    ...act,
    name: act.name.trim() || act.id,
    order: idx + 1,
  }))

  await setDoc(
    doc(db, 'settings', 'activitiesConfig'),
    {
      items: normalized,
      updatedAt: new Date().toISOString(),
      updatedBy: check.email || check.uid || 'admin',
    },
    { merge: true },
  )

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ACTIVITIES_CONFIG_CACHE_KEY, JSON.stringify(normalized))
      window.dispatchEvent(new CustomEvent(ACTIVITIES_CONFIG_EVENT, { detail: normalized }))
    } catch {}
  }

  await recordAdminAuditFirestore({
    action: 'تحديث الأنشطة التجارية',
    section: 'إدارة صور التطبيق',
    target: `تحديث ترتيب وأسماء ${normalized.length} نشاطاً`,
    admin: check.email || undefined,
  })

  return normalized
}

export function useHomeActivities(): HomeActivityConfigItem[] {
  const [activities, setActivities] = useState<HomeActivityConfigItem[]>(DEFAULT_HOME_ACTIVITIES)

  useEffect(() => {
    setActivities(getLocalActivitiesConfig())

    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent).detail as HomeActivityConfigItem[] | undefined
      setActivities(detail || getLocalActivitiesConfig())
    }
    window.addEventListener(ACTIVITIES_CONFIG_EVENT, onLocal)

    let unsub: (() => void) | null = null
    try {
      unsub = onSnapshot(
        doc(db, 'settings', 'activitiesConfig'),
        (snap) => {
          if (snap.exists() && Array.isArray(snap.data()?.items)) {
            const cloud = snap.data().items as HomeActivityConfigItem[]
            if (cloud.length > 0) {
              try {
                window.localStorage.setItem(ACTIVITIES_CONFIG_CACHE_KEY, JSON.stringify(cloud))
              } catch {}
              setActivities(getLocalActivitiesConfig())
            }
          }
        },
        () => {},
      )
    } catch {}

    return () => {
      window.removeEventListener(ACTIVITIES_CONFIG_EVENT, onLocal)
      if (unsub) unsub()
    }
  }, [])

  return activities
}

/**
 * Admin helpers for actual Firestore Establishments, Categories, and Products
 */
export async function updateEstablishmentImagesFirestore(
  establishmentId: string,
  patch: { logo?: string; coverImage?: string; gallery?: string[] },
  storeName?: string,
): Promise<void> {
  const check = await verifyFirebaseAdminAuthority()
  if (!check.isAdmin) {
    throw new Error(check.reason || 'غير مصرح بتعديل صور المنشآت.')
  }

  const updatePayload: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  }
  if (patch.logo !== undefined) {
    updatePayload.logo = patch.logo
    updatePayload.logoUrl = patch.logo
  }
  if (patch.coverImage !== undefined) {
    updatePayload.coverImage = patch.coverImage
  }
  if (patch.gallery !== undefined) {
    updatePayload.gallery = patch.gallery
  }

  await setDoc(doc(db, 'establishments', establishmentId), updatePayload, { merge: true })
  await recordAdminAuditFirestore({
    action: 'تعديل صور منشأة',
    section: 'إدارة صور التطبيق',
    target: `${storeName || establishmentId}`,
    admin: check.email || undefined,
  })
}

export async function updateCategoryImageFirestore(
  categoryId: string,
  imageUrl: string,
  title?: string,
  subcategories?: Array<{ id: string; name: string; imageUrl?: string }>,
): Promise<void> {
  const check = await verifyFirebaseAdminAuthority()
  if (!check.isAdmin) {
    throw new Error(check.reason || 'غير مصرح بتعديل صور الأقسام.')
  }

  const payload: Record<string, any> = {
    id: categoryId,
    imageUrl,
    image: imageUrl,
    updatedAt: new Date().toISOString(),
  }
  if (title) {
    payload.title = title
    payload.name = title
  }
  if (subcategories) {
    payload.subcategories = subcategories
  }

  await setDoc(doc(db, 'categories', categoryId), payload, { merge: true })
  await recordAdminAuditFirestore({
    action: 'تحديث صور الأقسام',
    section: 'إدارة صور التطبيق',
    target: `${title || categoryId}`,
    admin: check.email || undefined,
  })
}

export async function updateProductImagesFirestore(
  productId: string,
  images: string[],
  productName?: string,
): Promise<void> {
  const check = await verifyFirebaseAdminAuthority()
  if (!check.isAdmin) {
    throw new Error(check.reason || 'غير مصرح بتعديل صور المنتجات.')
  }

  // Strictly update ONLY image array and timestamp to preserve prices, stock, and details
  await setDoc(
    doc(db, 'products', productId),
    {
      images,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  )

  await recordAdminAuditFirestore({
    action: 'تعديل صور منتج',
    section: 'إدارة صور التطبيق',
    target: `${productName || productId}`,
    admin: check.email || undefined,
  })
}

/**
 * Live React Hook subscribed to Firestore `appImages` collection + instant browser updates.
 * Automatically updates all visitor/owner/admin pages in real time without app rebuilds.
 */
export function useAppImages(): AppImagesRegistry {
  const [registry, setRegistry] = useState<AppImagesRegistry>({})

  useEffect(() => {
    setRegistry(getLocalAppImagesRegistry())

    const onLocalUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppImagesRegistry | undefined
      setRegistry(detail || getLocalAppImagesRegistry())
    }
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === APP_IMAGES_CACHE_KEY) {
        setRegistry(getLocalAppImagesRegistry())
      }
    }

    window.addEventListener(APP_IMAGES_EVENT, onLocalUpdate)
    window.addEventListener('storage', onStorage)

    let unsubscribe: (() => void) | null = null
    try {
      unsubscribe = onSnapshot(
        collection(db, 'appImages'),
        (snap) => {
          const cloudRegistry: AppImagesRegistry = {}
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any
            if (data && Array.isArray(data.images)) {
              cloudRegistry[docSnap.id] = {
                slotId: docSnap.id,
                images: data.images,
                previousImages: Array.isArray(data.previousImages) ? data.previousImages : undefined,
                updatedAt: data.updatedAt || new Date().toISOString(),
                updatedBy: data.updatedBy,
              }
            }
          })
          const next = { ...getLocalAppImagesRegistry(), ...cloudRegistry }
          setRegistry(next)
          try {
            window.localStorage.setItem(APP_IMAGES_CACHE_KEY, JSON.stringify(next))
          } catch {}
        },
        (err) => {
          logFirestoreError(err, OperationType.LIST, 'appImages')
        },
      )
    } catch {
      getDocs(collection(db, 'appImages'))
        .then((snap) => {
          const cloudRegistry: AppImagesRegistry = {}
          snap.forEach((d) => {
            const data = d.data() as any
            if (data && Array.isArray(data.images)) {
              cloudRegistry[d.id] = {
                slotId: d.id,
                images: data.images,
                previousImages: Array.isArray(data.previousImages) ? data.previousImages : undefined,
                updatedAt: data.updatedAt || new Date().toISOString(),
                updatedBy: data.updatedBy,
              }
            }
          })
          setRegistry((prev) => ({ ...prev, ...cloudRegistry }))
        })
        .catch(() => {})
    }

    return () => {
      window.removeEventListener(APP_IMAGES_EVENT, onLocalUpdate)
      window.removeEventListener('storage', onStorage)
      if (unsubscribe) unsubscribe()
    }
  }, [])

  return registry
}
