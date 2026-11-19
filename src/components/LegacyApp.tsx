'use client'

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BarChart3, Bell, Box, Building2, Car, Check, ChevronDown, ChevronLeft, CircleDollarSign,
  CalendarDays, ClipboardList, Crown, Download, Droplets, Eye, FileSpreadsheet, FileText, Flame, Fuel, Gift, GlassWater,
  Grid2X2, Heart, Home, Image, KeyRound, Landmark, LayoutDashboard, LockKeyhole, LogOut, MapPin,
  Megaphone, Menu, MessageCircle, Navigation, Package, Pencil, Phone, Pill, Plus, RefreshCw, Search, Settings, Share2, ShieldCheck,
  ShoppingBag, ShoppingCart, SlidersHorizontal, Sparkles, Stethoscope, Store, Tag, Trash2, Truck, Upload,
  UserRound, UsersRound, Utensils, Wifi, WifiOff, Wrench, X, Palette
} from "lucide-react";
import AppearanceManager from "@/components/admin/AppearanceManager";
import AppImageManager from "@/components/admin/AppImageManager";
import { auth, db, storage, logFirestoreError, OperationType } from "@/lib/firebase";
import {
  useAppImages,
  resolveSlotPrimaryImage,
  resolveSlotImages,
  compressImageFileToBlob,
  recordAdminAuditFirestore,
  useHomeActivities,
  verifyFirebaseAdminAuthority,
} from "@/lib/appImages";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  getLocalAppearance,
  applyAppearanceToDOM,
  APPEARANCE_EVENT_NAME,
  type AppAppearance,
  defaultAppearance,
} from "@/lib/appearance";

function useAppAppearance() {
  const [appearance, setAppearance] = useState<AppAppearance>(defaultAppearance);

  useEffect(() => {
    const current = getLocalAppearance();
    setAppearance(current);
    applyAppearanceToDOM(current);

    const onUpdate = (e: any) => {
      const updated = e.detail || getLocalAppearance();
      setAppearance(updated);
      applyAppearanceToDOM(updated);
    };

    window.addEventListener(APPEARANCE_EVENT_NAME, onUpdate);

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 2500);

    fetch("/api/appearance", { signal: ctrl.signal })
      .then((res) => {
        clearTimeout(timeout);
        if (!res.ok) return null;
        const ct = res.headers.get("content-type");
        if (ct && ct.includes("application/json")) return res.json();
        return null;
      })
      .then((data) => {
        if (data?.success && data?.appearance) {
          setAppearance(data.appearance);
          applyAppearanceToDOM(data.appearance);
        }
      })
      .catch(() => {
        clearTimeout(timeout);
      });

    return () => window.removeEventListener(APPEARANCE_EVENT_NAME, onUpdate);
  }, []);

  return appearance;
}

type Role = "owner" | "admin" | null;
type Product = { id: number; name: string; price: number; stock: number; status: string; image?: string };
type OwnerProduct = {
  id: number; name: string; mainCategory: string; subCategory: string; description: string;
  price: number; currency: "YER" | "SAR" | "USD"; stock: number; status: "منشور" | "مسودة";
  images: string[];
};
type CarouselAd = {
  id: number; title: string; description: string; image: string; route: string;
  active: boolean; order: number; startsAt: string; endsAt: string;
};
type ExchangeRateData = {
  rates: {
    SAR: { buy: number; sell: number; prevBuy?: number; prevSell?: number };
    USD: { buy: number; sell: number; prevBuy?: number; prevSell?: number };
  };
  source: string;
  updatedAt: string;
  adminName?: string;
  autoUpdateEnabled?: boolean;
  history?: Array<{ timestamp: string; adminName: string; source: string; summary: string }>;
};

const green = "#064b3d";
const hero = "/assets/yafa-mountains.jpg";
const market = "/assets/market.jpg";
const storeImage = "/assets/store.jpg";
const carImage = "/assets/car.jpg";
const carouselStorageKey = "yafa-carousel-published";
const activityImageStorageKey = "yafa-activity-images";
const activityBannerStorageKey = "yafa-activity-banners";
const exchangeRateStorageKey = "yafa-verified-exchange-rates";
const ownerProductsStorageKey = "yafa-owner-products";
const ownerSectionsStorageKey = "yafa-owner-sections";

const memoryStorage = new Map<string, string>();
const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return memoryStorage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
    memoryStorage.set(key, value);
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
    memoryStorage.delete(key);
  },
};

const safeSession = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch {}
    return memoryStorage.get(`sess_${key}`) ?? null;
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
    } catch {}
    memoryStorage.set(`sess_${key}`, value);
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch {}
    memoryStorage.delete(`sess_${key}`);
  },
};

function loadOwnerProducts(): OwnerProduct[] {
  try { return JSON.parse(safeStorage.getItem(ownerProductsStorageKey) || "[]") as OwnerProduct[]; }
  catch { return []; }
}

function saveOwnerProducts(products: OwnerProduct[]) {
  try {
    safeStorage.setItem(ownerProductsStorageKey, JSON.stringify(products));
    if (typeof window !== "undefined") window.dispatchEvent(new Event("yafa-owner-products"));
    return true;
  } catch {
    return false;
  }
}

async function optimizeOwnerImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("نوع الصورة غير مدعوم");
  if (file.size > 8_000_000) throw new Error("حجم الصورة يتجاوز 8MB");
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/webp", .82);
  } catch {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("تعذرت قراءة الصورة"));
      reader.readAsDataURL(file);
    });
  }
}

async function uploadImageWithFallback(file: File, storagePath: string): Promise<{ url: string; cloud: boolean }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("نوع الملف غير مدعوم، يرجى اختيار صورة صالحة");
  }
  if (file.size > 15_000_000) {
    throw new Error("حجم الصورة يتجاوز الحد المسموح (15MB)");
  }
  if (auth.currentUser) {
    try {
      const compressedRes = await compressImageFileToBlob(file).catch(() => null);
      const uploadPayload: Blob = compressedRes?.blob || file;
      const storageRef = ref(storage, storagePath);
      const snap = await uploadBytes(storageRef, uploadPayload, {
        contentType: uploadPayload.type || file.type || "image/webp",
        customMetadata: { ownerId: auth.currentUser.uid },
      });
      const url = await getDownloadURL(snap.ref);
      return { url, cloud: true };
    } catch (err) {
      console.warn("Storage upload fallback to local optimized image:", err);
    }
  }
  const optimized = await optimizeOwnerImage(file);
  return { url: optimized, cloud: false };
}

async function shareOrCopy(title: string, text: string, url: string) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch {
      // Fall back to clipboard if user/browser doesn't complete Web Share
    }
  }
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toastMessage("تم نسخ الرابط بنجاح");
      return;
    }
  } catch {}
  toastMessage(`الرابط: ${url}`);
}

function getArabicAuthError(err: any): string {
  const code = err?.code || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "بيانات الدخول غير صحيحة.";
  }
  if (code === "auth/email-already-in-use") return "هذا الحساب مسجل مسبقاً.";
  if (code === "auth/weak-password") return "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل.";
  if (code === "auth/invalid-email") return "صيغة الحساب غير صالحة.";
  if (code === "auth/too-many-requests") return "تم تجاوز عدد المحاولات المسموح. يرجى المحاولة لاحقاً.";
  if (code === "auth/network-request-failed") return "تعذر الاتصال بخدمة المصادقة. تحقق من الإنترنت.";
  return err?.message || "تعذر إتمام المصادقة.";
}

async function syncFirebaseBridgeClient(fbBridgeEmail?: string, fbBridgeSecret?: string) {
  if (!fbBridgeEmail || !fbBridgeSecret) return null;
  try {
    const cred = await signInWithEmailAndPassword(auth, fbBridgeEmail, fbBridgeSecret);
    return cred.user;
  } catch (err: any) {
    const code = err?.code || "";
    if (code === "auth/user-not-found" || code === "auth/invalid-credential") {
      try {
        const created = await createUserWithEmailAndPassword(auth, fbBridgeEmail, fbBridgeSecret);
        return created.user;
      } catch {
        return auth.currentUser;
      }
    }
    return auth.currentUser;
  }
}

async function clearServerAndFirebaseSession() {
  try {
    await fetch("/api/session", { method: "DELETE", credentials: "include" });
  } catch {}
  try {
    if (auth.currentUser) await signOut(auth);
  } catch {}
}

const defaultCarouselAds: CarouselAd[] = [
  { id: 1, title: "مرحبًا بكم في يافع ون", description: "السوق التجاري الشامل في يافع", image: "/assets/carousel/welcome.jpg", route: "/visitor/stores", active: true, order: 1, startsAt: "", endsAt: "" },
  { id: 2, title: "عروض المواد الغذائية والسوبرماركت", description: "احتياجات البيت من متاجر يافع", image: "/assets/carousel/marketplace.jpg", route: "/visitor/groceries", active: true, order: 2, startsAt: "", endsAt: "" },
  { id: 3, title: "محلات مواد البناء والألمنيوم", description: "مواد وخدمات موثوقة لمشروعك", image: "/assets/carousel/services.jpg", route: "/visitor/building", active: true, order: 3, startsAt: "", endsAt: "" },
  { id: 4, title: "محطات الوقود والخدمات", description: "الأسعار والمواقع داخل يافع", image: "/assets/carousel/fuel-services.jpg", route: "/visitor/fuel", active: true, order: 6, startsAt: "", endsAt: "" },
  { id: 5, title: "السيارات والعقارات وحراج المستعمل", description: "بيع وشراء داخل يافع", image: "/assets/carousel/cars-property.jpg", route: "/visitor/vehicles", active: true, order: 4, startsAt: "", endsAt: "" },
  { id: 6, title: "شارك واربح", description: "برنامج الإحالة والمكافآت", image: "/assets/carousel/share-rewards.jpg", route: "/visitor/share", active: true, order: 5, startsAt: "", endsAt: "" },
];

const safeAdRoutes = [
  ["المتاجر", "/visitor/stores"], ["الغذاء والبقالة", "/visitor/groceries"], ["مواد البناء", "/visitor/building"],
  ["الألمنيوم والزجاج", "/visitor/aluminum"], ["الخدمات", "/visitor/services"], ["الوقود", "/visitor/fuel"],
  ["السيارات والعقارات", "/visitor/vehicles"], ["السوق المستعمل", "/visitor/used"], ["شارك واربح", "/visitor/share"],
] as const;

function loadPublishedAds() {
  try {
    const saved = safeStorage.getItem(carouselStorageKey);
    return saved ? JSON.parse(saved) as CarouselAd[] : defaultCarouselAds;
  } catch {
    return defaultCarouselAds;
  }
}

function usePublishedAds() {
  const [ads, setAds] = useState<CarouselAd[]>(defaultCarouselAds);
  useEffect(() => {
    setAds(loadPublishedAds());
    const update = () => setAds(loadPublishedAds());
    window.addEventListener("yafa-carousel-published", update);
    window.addEventListener("storage", update);
    getDoc(doc(db, "settings", "carousel"))
      .then((snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.items) && snap.data().items.length) {
          const items = snap.data().items as CarouselAd[];
          setAds(items);
          safeStorage.setItem(carouselStorageKey, JSON.stringify(items));
        }
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("yafa-carousel-published", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return ads;
}

function loadActivityImages() {
  try { return JSON.parse(safeStorage.getItem(activityImageStorageKey) || "{}") as Record<string, string>; }
  catch { return {}; }
}

function useActivityImages() {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    setImages(loadActivityImages());
    const update = () => setImages(loadActivityImages());
    window.addEventListener("yafa-activity-images", update);
    window.addEventListener("storage", update);
    getDoc(doc(db, "settings", "activityImages"))
      .then((snap) => {
        if (snap.exists() && snap.data()?.cards) {
          const cards = snap.data().cards as Record<string, string>;
          setImages((prev) => ({ ...prev, ...cards }));
        }
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("yafa-activity-images", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return images;
}

function loadActivityBanners() {
  try { return JSON.parse(safeStorage.getItem(activityBannerStorageKey) || "{}") as Record<string, string>; }
  catch { return {}; }
}

function useActivityBanners() {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    setImages(loadActivityBanners());
    const update = () => setImages(loadActivityBanners());
    window.addEventListener("yafa-activity-banners", update);
    window.addEventListener("storage", update);
    getDoc(doc(db, "settings", "activityImages"))
      .then((snap) => {
        if (snap.exists() && snap.data()?.banners) {
          const banners = snap.data().banners as Record<string, string>;
          setImages((prev) => ({ ...prev, ...banners }));
        }
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("yafa-activity-banners", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return images;
}

const DEFAULT_EXCHANGE_RATES: ExchangeRateData = {
  rates: {
    SAR: { buy: 411, sell: 413, prevBuy: 410, prevSell: 412 },
    USD: { buy: 1568, sell: 1579, prevBuy: 1565, prevSell: 1575 },
  },
  source: 'سوق عدن المالي - جنوب اليمن (معتمد رسمياً)',
  updatedAt: '2026-01-01T00:00:00.000Z',
  adminName: 'المدير العام ماجد التركي',
  autoUpdateEnabled: false,
  history: [],
};

function loadExchangeRates(): ExchangeRateData {
  if (typeof window === "undefined") return DEFAULT_EXCHANGE_RATES;
  try {
    const raw = safeStorage.getItem(exchangeRateStorageKey);
    if (!raw) return DEFAULT_EXCHANGE_RATES;
    const data = JSON.parse(raw) as ExchangeRateData;
    const values = [data.rates.SAR.buy, data.rates.SAR.sell, data.rates.USD.buy, data.rates.USD.sell];
    return data.source && data.updatedAt && values.every((value) => Number.isFinite(value) && value > 0) ? data : DEFAULT_EXCHANGE_RATES;
  } catch {
    return DEFAULT_EXCHANGE_RATES;
  }
}

export function normalizeAppPath(raw: string): string {
  if (!raw) return "/";
  let clean = raw.trim();

  try {
    if (clean.startsWith("http://") || clean.startsWith("https://") || clean.startsWith("capacitor://")) {
      const u = new URL(clean);
      clean = u.pathname + u.search + u.hash;
    }
  } catch {}

  if (clean.includes("#")) {
    const hashPart = clean.substring(clean.indexOf("#") + 1);
    if (hashPart.startsWith("/")) {
      clean = hashPart;
    }
  }

  const qIdx = clean.indexOf("?");
  let pathPart = qIdx !== -1 ? clean.substring(0, qIdx) : clean;

  if (pathPart === "/index.html" || pathPart === "index.html" || pathPart === "") {
    pathPart = "/";
  }

  if (!pathPart.startsWith("/")) {
    pathPart = "/" + pathPart;
  }

  pathPart = pathPart.replace(/\/+/g, "/");

  if (pathPart.length > 1 && pathPart.endsWith("/")) {
    pathPart = pathPart.slice(0, -1);
  }

  return pathPart;
}

const route = (path: string) => {
  if (typeof window === "undefined") return;
  if (!path) return;

  if (
    path.startsWith("tel:") ||
    path.startsWith("mailto:") ||
    path.startsWith("whatsapp:") ||
    path.startsWith("https://wa.me") ||
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    try {
      window.open(path, "_blank");
    } catch {
      window.location.href = path;
    }
    return;
  }

  const clean = normalizeAppPath(path);
  const qIdx = path.indexOf("?");
  const target = qIdx !== -1 ? clean + path.substring(qIdx) : clean;

  try {
    window.history.pushState({}, "", target);
  } catch {
    window.location.hash = target;
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const toastMessage = (message: string) => window.dispatchEvent(new CustomEvent("yafa-toast", { detail: message }));

function Button({ children, onClick, kind = "primary", type = "button", disabled = false, className = "", style }: {
  children: React.ReactNode; onClick?: () => void; kind?: "primary" | "gold" | "outline" | "ghost" | "danger";
  type?: "button" | "submit"; disabled?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return <button style={style} className={`btn btn-${kind} ${className}`} onClick={onClick} type={type} disabled={disabled}>{children}</button>;
}

function Brand({ compact = false, portal }: { compact?: boolean; portal?: "visitor" | "owner" | "admin" }) {
  const handleClick = () => {
    if (portal === "owner") route("/owner/dashboard");
    else if (portal === "admin") route("/admin/dashboard");
    else route("/visitor/home");
  };
  const appearance = useAppAppearance();
  const appImages = useAppImages();
  const customBrandLogo = resolveSlotPrimaryImage(appImages, "brand_logo", "");
  const customSplashIcon = resolveSlotPrimaryImage(appImages, "splash_icon", "");
  const effectiveBrandIcon =
    customBrandLogo && customBrandLogo !== "/icons/icon-512.png"
      ? customBrandLogo
      : customSplashIcon && customSplashIcon !== "/icons/icon-512.png"
        ? customSplashIcon
        : appearance.brand?.appIconUrl && appearance.brand.appIconUrl !== "/icons/icon-512.png"
          ? appearance.brand.appIconUrl
          : "";
  const logoText = appearance.brand?.logoText || "يافع ون";
  const tagline = appearance.brand?.platformTagline || "سوق يافع الإلكتروني";
  const parts = logoText.split(" ");
  const main = parts[0] || "يافع";
  const suffix = parts.slice(1).join(" ") || "ون";

  return <div className={`brand ${compact ? "brand-compact" : ""}`} onClick={handleClick} role="button" tabIndex={0}>
    <div className="brand-mark" aria-hidden="true">
      {effectiveBrandIcon ? (
        <img
          src={effectiveBrandIcon}
          alt=""
          style={{ width: 26, height: 26, borderRadius: 6, objectFit: "cover" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : (
        <><span>▲</span><span>▲</span><i /></>
      )}
    </div>
    <strong>{main} <em>{suffix}</em></strong>
    {!compact && <small>{tagline}</small>}
  </div>;
}

function TopBar({ back, admin = false, portal }: { back?: string; admin?: boolean; portal?: "visitor" | "owner" | "admin" }) {
  const [currentRole, setCurrentRole] = useState<Role>(null);
  useEffect(() => {
    setCurrentRole((safeStorage.getItem("yafa-role") as Role) || null);
  }, []);
  const effectivePortal = portal || (admin ? "admin" : currentRole === "owner" ? "owner" : "visitor");

  const handleBack = () => {
    if (back) {
      route(back);
    } else if (effectivePortal === "owner") {
      route("/owner/dashboard");
    } else if (effectivePortal === "admin") {
      route("/admin/dashboard");
    } else {
      route("/visitor/home");
    }
  };

  return <header className="topbar">
    <button className="icon-button" aria-label={back ? "رجوع" : "القائمة"} onClick={handleBack}>
      {back ? <ChevronLeft /> : <Menu />}
    </button>
    <Brand compact portal={effectivePortal} />
    <div className="top-actions">
      <button
        className="icon-button"
        aria-label="الإشعارات"
        onClick={() => route(effectivePortal === "admin" ? "/admin/notifications" : effectivePortal === "owner" ? "/owner/reports" : "/visitor/notifications")}
      >
        <Bell />
      </button>
      <button
        className="icon-button"
        aria-label="الحساب"
        onClick={() => {
          if (effectivePortal === "owner") route("/owner/setup");
          else if (effectivePortal === "admin") route("/admin/roles");
          else route("/auth/visitor-login");
        }}
      >
        <UserRound />
      </button>
    </div>
  </header>;
}

function ScenicHero({ title, subtitle, icon, image, activity = false, slotId }: { title: string; subtitle: string; icon?: React.ReactNode; image?: string; activity?: boolean; slotId?: string }) {
  const appearance = useAppAppearance();
  const appImages = useAppImages();
  const fallbackHero = appearance.brand?.scenicLandscapeUrl || hero;
  const effectiveImage =
    image ||
    (slotId
      ? resolveSlotPrimaryImage(appImages, slotId, fallbackHero)
      : resolveSlotPrimaryImage(appImages, "scenic_default_hero", fallbackHero));
  const overlay = activity ? "linear-gradient(90deg,rgba(1,35,28,.88),rgba(1,35,28,.2))" : "linear-gradient(90deg,rgba(255,255,255,.94),rgba(255,255,255,.45))";
  return <section className={`scenic-hero ${activity ? "activity-banner" : ""}`} style={{ backgroundImage: `${overlay},url(${effectiveImage})` }}>
    <div>{icon}<span className="eyebrow">يافع ون · يافع فقط</span><h1>{title}</h1><p>{subtitle}</p></div>
  </section>;
}

function Toast() {
  const [text, setText] = useState("");
  useEffect(() => {
    const handler = (event: Event) => {
      setText((event as CustomEvent).detail);
      window.setTimeout(() => setText(""), 2400);
    };
    window.addEventListener("yafa-toast", handler);
    return () => window.removeEventListener("yafa-toast", handler);
  }, []);
  return text ? <div className="toast" role="status"><Check />{text}</div> : null;
}

function Entry() {
  const appearance = useAppAppearance();
  const appImages = useAppImages();
  const welcomeIcon = resolveSlotPrimaryImage(appImages, "entry_welcome_icon", appearance.brand?.appIconUrl || "/icons/icon-512.png");
  return <main className="entry" dir="rtl">
    <div className="entry-clouds" />
    <img className="welcome-official-icon" src={welcomeIcon} alt="يافع ون | YAFA ONE" />
    <Brand />
    <section className="entry-copy"><h1>مرحباً بك في {appearance.brand?.logoText || "يافع ون"}</h1><p>{appearance.brand?.platformTagline || "سوق إلكتروني يجمع منتجات وخدمات يافع من أهلها وإلى أهلها"}</p></section>
    <div className="entry-options">
      <button className="role-card" onClick={() => route("/visitor/home")}><ShoppingBag /><span><strong>دخول زائر</strong><small>تصفح السوق واكتشف المنتجات والخدمات بدون تسجيل دخول</small></span><ChevronLeft /></button>
      <button className="role-card" onClick={() => route("/auth/owner-login")}><Store /><span><strong>دخول صاحب المنشأة</strong><small>إدارة متجرك ومنتجاتك وطلبات متجرك فقط</small></span><ChevronLeft /></button>
    </div>
    <div className="entry-mini">
      <Button kind="outline" onClick={() => route("/visitor/share")}><Share2 /> مشاركة التطبيق</Button>
    </div>
    <p className="prototype-note"><LockKeyhole /> منصة يافع ون · نطاق يافع فقط · عمولة 0%.</p>
    <div className="landscape" />
  </main>;
}

function Auth({ kind, setRole }: { kind: "owner" | "admin"; setRole: (role: Role) => void }) {
  // Admin fields
  const [email, setEmail] = useState("");
  // Owner Phone+Password fields
  const [ownerMode, setOwnerMode] = useState<"login" | "reset">("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setReturnUrl(new URLSearchParams(window.location.search).get("return"));
    }
  }, []);

  const completeAdminLogin = async (verifiedEmail: string, firebaseIdToken: string) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
      credentials: "include",
      body: JSON.stringify({
        role: "admin",
        email: verifiedEmail,
        password,
        firebaseIdToken,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      throw new Error(json?.error || "فشل التحقق من صلاحية الإدارة على الخادم.");
    }

    setRole("admin");
    safeStorage.setItem("yafa-role", "admin");
    safeStorage.setItem("yafa-user-email", verifiedEmail);
    if (typeof document !== "undefined") {
      document.cookie = "yafa-role=admin; path=/; max-age=2592000; SameSite=Lax";
    }
    recordAdminAudit("تسجيل دخول إداري", "المصادقة والأمان", `دخول المدير العام: ${verifiedEmail}`);
    toastMessage("مرحباً بالمدير العام: تم تسجيل الدخول بنجاح");
    const destination = returnUrl && returnUrl.startsWith("/admin/") ? returnUrl : "/admin/dashboard";
    route(destination);
  };

  const submitAdmin = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== "majdaltrki8@gmail.com" || password.length < 6) {
      return setError("البريد الإلكتروني غير مخول للإدارة أو كلمة المرور غير صالحة.");
    }
    setError("");
    setInfoMsg("");
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const firebaseIdToken = await cred.user.getIdToken();
      await completeAdminLogin(cleanEmail, firebaseIdToken);
    } catch (err: any) {
      setError(getArabicAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAdmin = async () => {
    setError("");
    setInfoMsg("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const gEmail = (result.user.email || "").toLowerCase();
      if (gEmail !== "majdaltrki8@gmail.com" || !result.user.emailVerified) {
        await signOut(auth).catch(() => {});
        throw new Error("هذا الحساب غير مصرح له بالدخول كمدير نظام.");
      }
      const token = await result.user.getIdToken();
      await completeAdminLogin(gEmail, token);
    } catch (err: any) {
      setError(getArabicAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAdminPasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== "majdaltrki8@gmail.com") {
      return setError("أدخل البريد الإداري المعتمد أولاً لاستعادة كلمة المرور.");
    }
    setError("");
    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfoMsg("تم إرسال رابط استعادة كلمة المرور إلى البريد الإداري عبر Firebase.");
      toastMessage("تم إرسال رابط استعادة كلمة المرور");
    } catch (err: any) {
      setError(getArabicAuthError(err));
    } finally {
      setResetLoading(false);
    }
  };

  const submitOwnerLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || password.length < 6) {
      return setError("أدخل رقم الجوال اليمني وكلمة المرور (6 أحرف على الأقل).");
    }
    setError("");
    setInfoMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/phone-login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ role: "owner", phone: phone.trim(), password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        return setError(json?.error || "تعذر تسجيل الدخول. تحقق من رقم الجوال وكلمة المرور.");
      }

      const fbUser = await syncFirebaseBridgeClient(json.fbBridgeEmail, json.fbBridgeSecret);
      if (fbUser) {
        try {
          const estSnap = await getDocs(query(collection(db, "establishments"), where("ownerId", "==", fbUser.uid)));
          if (!estSnap.empty) {
            const first = estSnap.docs[0];
            const data = first.data() as any;
            safeStorage.setItem("yafa-owner-est-id", first.id);
            safeStorage.setItem("yafa-draft-est-name", data.name || "");
            safeStorage.setItem("yafa-owner-profile", JSON.stringify({
              id: first.id,
              name: data.name || "",
              ownerName: data.ownerName || json.user?.name || "",
              phone: data.phone || json.user?.phone || "",
              district: data.district || "لبعوس",
              address: data.address || "",
              description: data.description || "",
              logo: data.logo || data.logoUrl || "",
              coverImage: data.coverImage || "",
              gallery: Array.isArray(data.gallery) ? data.gallery : [],
            }));
          }
        } catch {}
      }

      setRole("owner");
      safeStorage.setItem("yafa-role", "owner");
      safeStorage.setItem("yafa-owner-phone", json.user?.phone || phone.trim());
      if (json.user?.name) safeStorage.setItem("yafa-draft-owner-name", json.user.name);
      if (typeof document !== "undefined") {
        document.cookie = "yafa-role=owner; path=/; max-age=2592000; SameSite=Lax";
      }
      toastMessage("تم تسجيل الدخول بنجاح إلى بوابة المنشأة");
      const destination = returnUrl && returnUrl.startsWith("/owner/") ? returnUrl : "/owner/dashboard";
      route(destination);
    } catch (err: any) {
      setError(err?.message || "تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  };

  const sendOwnerResetOtp = async () => {
    if (!phone.trim()) return setError("أدخل رقم الجوال اليمني أولاً.");
    setError("");
    setInfoMsg("");
    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ role: "owner", phone: phone.trim(), purpose: "reset" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        return setError(json?.error || "تعذر إرسال رمز واتساب OTP.");
      }
      setOtpSent(true);
      setInfoMsg("تم إرسال رمز التحقق عبر واتساب إلى رقم جوالك.");
      toastMessage("تم إرسال رمز التحقق عبر واتساب");
    } catch {
      setError("تعذر الاتصال بخادم التحقق.");
    } finally {
      setResetLoading(false);
    }
  };

  const submitOwnerReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !otp.trim() || newPassword.length < 6) {
      return setError("أدخل رقم الجوال، رمز التحقق من واتساب (6 أرقام)، وكلمة مرور جديدة (6 أحرف على الأقل).");
    }
    setError("");
    setInfoMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ role: "owner", phone: phone.trim(), otp: otp.trim(), newPassword }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        return setError(json?.error || "فشل تحديث كلمة المرور.");
      }
      setOwnerMode("login");
      setOtp("");
      setOtpSent(false);
      setNewPassword("");
      setPassword("");
      setInfoMsg("تم تحديث كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن بكلمة المرور الجديدة.");
      toastMessage("تم تحديث كلمة المرور بنجاح");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  };

  const appImages = useAppImages();
  const authBanner = resolveSlotPrimaryImage(appImages, "auth_login_banner", "");

  if (kind === "admin") {
    return <main className="auth-page">
      <TopBar back="/" />
      <div className="auth-shell">
        {authBanner && authBanner !== hero && (
          <img
            src={authBanner}
            alt="يافع ون"
            style={{ width: "100%", height: "110px", objectFit: "cover", borderRadius: "14px", marginBottom: "10px" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        <Brand />
        <span className="eyebrow">بوابة الإدارة العليا</span>
        <h1>دخول مدير النظام</h1>
        <p>دخول محصور بالإدارة المعتمدة وموثق بـ Firebase Authentication</p>
        {error && <div className="alert error"><AlertTriangle />{error}</div>}
        {infoMsg && <div className="alert success"><Check />{infoMsg}</div>}
        <form onSubmit={submitAdmin}>
          <label>البريد الإداري<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="majdaltrki8@gmail.com" required /></label>
          <label>كلمة المرور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></label>
          <div className="form-row">
            <label className="check"><input type="checkbox" defaultChecked /> تذكرني</label>
            <button type="button" className="text-link" disabled={resetLoading} onClick={handleAdminPasswordReset}>
              {resetLoading ? "جارٍ الإرسال..." : "نسيت كلمة المرور؟"}
            </button>
          </div>
          <Button type="submit" disabled={loading}>{loading ? <><span className="spinner" /> جارٍ التحقق...</> : <><LockKeyhole /> تسجيل دخول الإدارة</>}</Button>
          <Button type="button" kind="outline" disabled={loading} onClick={handleGoogleAdmin}><ShieldCheck /> الدخول بحساب Google المعتمد</Button>
        </form>
      </div>
    </main>;
  }

  return <main className="auth-page">
    <TopBar back="/" />
    <div className="auth-shell">
      {authBanner && authBanner !== hero && (
        <img
          src={authBanner}
          alt="يافع ون"
          style={{ width: "100%", height: "110px", objectFit: "cover", borderRadius: "14px", marginBottom: "10px" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      <Brand />
      <span className="eyebrow">بوابة صاحب المنشأة</span>
      <h1>{ownerMode === "login" ? "دخول صاحب المنشأة" : "استعادة كلمة مرور المنشأة"}</h1>
      <p>{ownerMode === "login" ? "الدخول برقم الجوال وكلمة المرور" : "التحقق عبر واتساب OTP لإعادة تعيين كلمة المرور"}</p>
      {error && <div className="alert error"><AlertTriangle />{error}</div>}
      {infoMsg && <div className="alert success"><Check />{infoMsg}</div>}
      {ownerMode === "login" ? (
        <form onSubmit={submitOwnerLogin}>
          <label>رقم الجوال *<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77xxxxxxx أو 9677xxxxxxxx" required /></label>
          <label>كلمة المرور *<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required /></label>
          <div className="form-row">
            <label className="check"><input type="checkbox" defaultChecked /> تذكرني</label>
            <button type="button" className="text-link" onClick={() => { setError(""); setInfoMsg(""); setOwnerMode("reset"); }}>
              نسيت كلمة المرور؟
            </button>
          </div>
          <Button type="submit" disabled={loading}>{loading ? <><span className="spinner" /> جارٍ التحقق...</> : <><LockKeyhole /> تسجيل الدخول</>}</Button>
        </form>
      ) : (
        <form onSubmit={submitOwnerReset}>
          <label>رقم الجوال المسجل *<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77xxxxxxx" required /></label>
          <Button type="button" kind="outline" disabled={resetLoading} onClick={sendOwnerResetOtp}>
            {resetLoading ? "جارٍ الإرسال..." : otpSent ? "إعادة إرسال رمز واتساب" : "إرسال رمز التحقق عبر واتساب"}
          </Button>
          {otpSent && (
            <>
              <label>رمز التحقق المرسل عبر واتساب (6 أرقام) *<input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" required /></label>
              <label>كلمة المرور الجديدة (6 أحرف على الأقل) *<input type="password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required /></label>
              <Button type="submit" disabled={loading}>{loading ? "جارٍ التحديث..." : "تحديث كلمة المرور"}</Button>
            </>
          )}
          <button type="button" className="text-link" onClick={() => { setError(""); setInfoMsg(""); setOwnerMode("login"); }}>
            العودة لتسجيل الدخول
          </button>
        </form>
      )}
      <p>ليس لديك حساب؟ <button className="text-link" onClick={() => route("/owner/signup")}>سجّل منشأتك مجاناً</button></p>
      <div className="prototype-note"><ShieldCheck /> جلسة محمية بتحقق الخادم وبرقم الجوال وكلمة المرور.</div>
    </div>
  </main>;
}

function VisitorLoginPrompt() {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [loggedPhone, setLoggedPhone] = useState("");
  const [returnTo, setReturnTo] = useState("/visitor/home");

  useEffect(() => {
    setLoggedPhone(safeStorage.getItem("yafa-visitor-auth") || "");
    const requestedReturn = new URLSearchParams(window.location.search).get("return");
    const pathStr = window.location.pathname;
    setReturnTo(pathStr.startsWith("/visitor/") && pathStr !== "/auth/visitor-login" ? pathStr : requestedReturn || "/visitor/home");
  }, []);

  const sendVisitorOtp = async (purpose: "register" | "reset") => {
    if (!phone.trim()) return setError("أدخل رقم الجوال اليمني أولاً.");
    setError("");
    setInfoMsg("");
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ role: "visitor", phone: phone.trim(), purpose }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        return setError(json?.error || "تعذر إرسال رمز واتساب OTP.");
      }
      setOtpSent(true);
      setInfoMsg("تم إرسال رمز التحقق إلى رقم جوالك عبر واتساب.");
      toastMessage("تم إرسال رمز التحقق عبر واتساب");
    } catch {
      setError("تعذر الاتصال بخادم التحقق.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVisitorAuth = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setInfoMsg("");

    if (mode === "reset") {
      if (!phone.trim() || !otp.trim() || newPassword.length < 6) {
        return setError("أدخل رقم الجوال، رمز التحقق، وكلمة مرور جديدة (6 أحرف على الأقل).");
      }
      setLoading(true);
      try {
        const res = await fetch("/api/auth/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
          credentials: "include",
          body: JSON.stringify({ role: "visitor", phone: phone.trim(), otp: otp.trim(), newPassword }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) return setError(json?.error || "تعذر تحديث كلمة المرور.");
        setMode("login");
        setOtp("");
        setOtpSent(false);
        setNewPassword("");
        setInfoMsg("تم تحديث كلمة المرور بنجاح. سجل الدخول برقمك الآن.");
        toastMessage("تم تحديث كلمة المرور بنجاح");
      } catch {
        setError("تعذر الاتصال بالخادم.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!phone.trim() || password.length < 6) {
      return setError("أدخل رقم الجوال وكلمة مرور من 6 أحرف على الأقل.");
    }
    if (mode === "register" && (!name.trim() || !otp.trim())) {
      return setError("أدخل الاسم الكامل وأكمل التحقق برمز واتساب OTP لإنشاء الحساب.");
    }

    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/phone-register" : "/api/auth/phone-login";
      const payload = mode === "register"
        ? { role: "visitor", name: name.trim(), phone: phone.trim(), password, otp: otp.trim() }
        : { role: "visitor", phone: phone.trim(), password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        return setError(json?.error || "تعذر إتمام العملية.");
      }

      const fbUser = await syncFirebaseBridgeClient(json.fbBridgeEmail, json.fbBridgeSecret);
      const userPhone = json.user?.phone || phone.trim();
      const userName = json.user?.name || name.trim() || userPhone;

      if (fbUser) {
        await setDoc(doc(db, "users", fbUser.uid), {
          uid: fbUser.uid,
          name: userName,
          phoneNumber: userPhone,
          role: "customer",
          status: "active",
          createdAt: new Date().toISOString(),
        }, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}`));
      }

      safeStorage.setItem("yafa-visitor-auth", userPhone);
      safeStorage.setItem("yafa-customer-phone", userPhone);
      if (userName) safeStorage.setItem("yafa-customer-name", userName);
      setLoggedPhone(userPhone);
      toastMessage(mode === "register" ? "تم إنشاء حسابك وتسجيل الدخول بنجاح" : "تم تسجيل الدخول بنجاح");
      route(returnTo.startsWith("/visitor/") ? returnTo : "/visitor/home");
    } catch (err: any) {
      setError(err?.message || "تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  };

  const handleVisitorLogout = async () => {
    await clearServerAndFirebaseSession();
    safeStorage.removeItem("yafa-visitor-auth");
    setLoggedPhone("");
    toastMessage("تم تسجيل الخروج من حساب الزائر");
  };

  return <main className="auth-page"><TopBar back="/visitor/home" /><div className="auth-shell"><Brand /><span className="eyebrow">حساب الزائر</span>
    {loggedPhone ? (
      <>
        <h1>حسابك نشط</h1>
        <p>مسجل الدخول حالياً برقم الجوال: <b dir="ltr">{loggedPhone}</b></p>
        <div style={{ display: "grid", gap: "10px", width: "100%", marginTop: "12px" }}>
          <Button kind="gold" onClick={() => route("/visitor/home")}>العودة للرئيسية</Button>
          <Button kind="outline" onClick={() => route("/visitor/orders")}>طلباتي</Button>
          <Button kind="danger" onClick={handleVisitorLogout}><LogOut /> تسجيل الخروج</Button>
        </div>
      </>
    ) : (
      <>
        <h1>{mode === "login" ? "دخول الزائر" : mode === "register" ? "إنشاء حساب زائر جديد" : "استعادة كلمة المرور"}</h1>
        <p>التصفح متاح دون حساب. سجّل الدخول برقم الجوال وكلمة المرور لحفظ طلباتك ومحادثاتك.</p>
        {error && <div className="alert error"><AlertTriangle />{error}</div>}
        {infoMsg && <div className="alert success"><Check />{infoMsg}</div>}
        <form onSubmit={handleVisitorAuth}>
          {mode === "register" && <label>الاسم الكامل *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد اليافعي" required /></label>}
          <label>رقم الجوال *<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77xxxxxxx أو 9677xxxxxxxx" required /></label>
          {mode !== "reset" && (
            <label>كلمة المرور (6 أحرف على الأقل) *<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
          )}
          {(mode === "register" || mode === "reset") && (
            <>
              <Button type="button" kind="outline" disabled={otpLoading} onClick={() => sendVisitorOtp(mode)}>
                {otpLoading ? "جارٍ الإرسال..." : otpSent ? "إعادة إرسال رمز واتساب" : "إرسال رمز التحقق عبر واتساب"}
              </Button>
              {otpSent && (
                <label>رمز التحقق عبر واتساب (6 أرقام) *<input type="text" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" required /></label>
              )}
              {mode === "reset" && otpSent && (
                <label>كلمة المرور الجديدة *<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required /></label>
              )}
            </>
          )}
          <Button type="submit" disabled={loading || ((mode === "register" || mode === "reset") && !otpSent)}>
            {loading ? <><span className="spinner" /> جارٍ التنفيذ...</> : <><LockKeyhole /> {mode === "login" ? "تسجيل الدخول" : mode === "register" ? "تأكيد وإنشاء الحساب" : "تحديث كلمة المرور"}</>}
          </Button>
          {mode === "login" && (
            <button type="button" className="text-link" onClick={() => { setError(""); setInfoMsg(""); setOtpSent(false); setMode("reset"); }}>
              نسيت كلمة المرور؟
            </button>
          )}
          <Button type="button" kind="outline" onClick={() => { setError(""); setInfoMsg(""); setOtpSent(false); setMode(mode === "login" ? "register" : "login"); }}>
            {mode === "login" ? "ليس لديك حساب؟ أنشئ حساباً" : "لديك حساب بالفعل؟ تسجيل الدخول"}
          </Button>
          <Button kind="ghost" onClick={() => route("/visitor/home")}>متابعة التصفح كزائر</Button>
        </form>
      </>
    )}
    <div className="prototype-note"><ShieldCheck /> الدخول برقم الجوال وكلمة المرور · التحقق عبر واتساب OTP عند التسجيل أو الاستعادة فقط.</div></div></main>;
}

const visitorScreens = [
  ["الرئيسية", "/visitor/home", Home], ["المتاجر", "/visitor/stores", Store], ["الغذاء والبقالة", "/visitor/groceries", ShoppingBasketIcon],
  ["المطاعم والمقاهي", "/visitor/restaurants", Utensils], ["الإلكترونيات", "/visitor/electronics", Box], ["الموضة", "/visitor/fashion", ShoppingBag],
  ["الأثاث", "/visitor/furniture", Home], ["مواد البناء", "/visitor/building", Building2], ["الألمنيوم والزجاج", "/visitor/aluminum", GlassWater],
  ["الخدمات", "/visitor/services", Wrench], ["السيارات والعقارات", "/visitor/vehicles", Car], ["معارض السيارات", "/visitor/dealers", Car],
  ["العقارات والأراضي", "/visitor/property", Building2], ["السوق المستعمل", "/visitor/used", Package], ["شارك واربح", "/visitor/share", Gift], ["الوقود والخريطة", "/visitor/fuel", Fuel],
] as const;

function ShoppingBasketIcon() { return <ShoppingCart />; }

const products = [
  { name: "عسل يافع الطبيعي", price: "3,500 ر.ي", image: market },
  { name: "قهوة يافع الأصيلة", price: "4,800 ر.ي", image: storeImage },
  { name: "هاتف ذكي", price: "425,000 ر.ي", image: carImage },
  { name: "منتجات محلية", price: "12,000 ر.ي", image: market },
];

function VisitorBottom() {
  const [more, setMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [district, setDistrict] = useState("لبعوس");
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [currentPath, setCurrentPath] = useState("");
  useEffect(() => {
    setDistrict(safeStorage.getItem("yafa-district") || "لبعوس");
    setNotifEnabled(safeStorage.getItem("yafa-visitor-notif") !== "0");
    setCurrentPath(window.location.pathname);
    const onRoute = () => setCurrentPath(window.location.pathname);
    const open = () => setMore(true);
    window.addEventListener("yafa-open-more", open);
    window.addEventListener("popstate", onRoute);
    return () => {
      window.removeEventListener("yafa-open-more", open);
      window.removeEventListener("popstate", onRoute);
    };
  }, []);
  const goAndClose = (path: string) => {
    setMore(false);
    route(path);
  };
  const item = (path: string, label: string, icon: React.ReactNode) => <button className={currentPath === path ? "active" : ""} onClick={() => route(path)}>{icon}<span>{label}</span></button>;
  return <>{more && <div className="more-backdrop" onClick={() => setMore(false)}><section className="more-sheet" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><h2>المزيد</h2><div className="more-grid">
    <button onClick={() => goAndClose("/auth/visitor-login")}><UserRound />الحساب</button>
    <button onClick={() => goAndClose("/visitor/used")}><Package />حراج المستعمل</button>
    <button onClick={() => goAndClose("/visitor/share")}><Gift />شارك واربح</button>
    <button onClick={() => { setMore(false); setSettingsOpen(true); }}><Settings />الإعدادات</button>
    <button onClick={() => {
      setMore(false);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      shareOrCopy("يافع ون", "تطبيق يافع ون — السوق الإلكتروني لأبناء يافع", origin);
    }}><Share2 />مشاركة التطبيق</button>
    <button onClick={() => goAndClose("/visitor/used/new")}><Plus />إضافة إعلان</button>
    <button onClick={() => goAndClose("/auth/owner-login")}><KeyRound />دخول صاحب المنشأة</button>
  </div></section></div>}
  {settingsOpen && <Modal title="إعدادات الزائر" close={() => setSettingsOpen(false)}>
    <div style={{ display: "grid", gap: "12px" }}>
      <label>المديرية الافتراضية في يافع
        <select value={district} onChange={(e) => {
          setDistrict(e.target.value);
          safeStorage.setItem("yafa-district", e.target.value);
          toastMessage(`تم حفظ المديرية: ${e.target.value}`);
        }}>
          {yafaDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <label className="check" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input type="checkbox" checked={notifEnabled} onChange={(e) => {
          setNotifEnabled(e.target.checked);
          safeStorage.setItem("yafa-visitor-notif", e.target.checked ? "1" : "0");
          toastMessage(e.target.checked ? "تم تفعيل إشعارات العروض" : "تم كتم إشعارات العروض");
        }} />
        <span>تفعيل تنبيهات العروض وأسعار الصرف</span>
      </label>
      <Button kind="outline" onClick={() => { setSettingsOpen(false); route("/visitor/cart"); }}>
        <ShoppingCart /> عرض سلة التسوق
      </Button>
      <Button kind="outline" onClick={() => {
        safeStorage.removeItem("yafa-cart");
        toastMessage("تم تفريغ سلة التسوق");
      }}>
        <Trash2 /> تفريغ السلة
      </Button>
    </div>
  </Modal>}
  <nav className="mobile-nav visitor-bottom" aria-label="تنقل الزائر">
    {item("/visitor/home", "الرئيسية", <Home />)}
    {item("/visitor/favorites", "المفضلة", <Heart />)}
    {item("/visitor/orders", "الطلبات", <ClipboardList />)}
    {item("/visitor/chats", "المحادثات", <MessageCircle />)}
    <button className={more ? "active" : ""} onClick={() => setMore(true)}><Grid2X2 /><span>المزيد</span></button>
  </nav></>;
}

function VisitorHome() {
  const [hydrated, setHydrated] = useState(false);
  const [district, setDistrict] = useState("لبعوس");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveRates, setLiveRates] = useState<ExchangeRateData>(DEFAULT_EXCHANGE_RATES);
  const activityImages = useActivityImages();
  const appImages = useAppImages();
  const liveActivities = useHomeActivities();
  const appearance = useAppAppearance();
  useEffect(() => {
    setHydrated(true);
    setDistrict(safeStorage.getItem("yafa-district") || "لبعوس");
    setLiveRates(loadExchangeRates());
    getDoc(doc(db, "settings", "exchangeRates"))
      .then((snap) => {
        if (snap.exists()) {
          const cloud = snap.data() as ExchangeRateData;
          if (cloud?.rates?.SAR?.buy && cloud?.rates?.USD?.buy) {
            setLiveRates(cloud);
            safeStorage.setItem(exchangeRateStorageKey, JSON.stringify(cloud));
          }
        }
      })
      .catch(() => {});
  }, []);
  const changeDistrict = (value: string) => {
    setDistrict(value);
    safeStorage.setItem("yafa-district", value);
    toastMessage(`تم تحديث النتائج إلى ${value}`);
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    route(`/visitor/search?q=${encodeURIComponent(query)}&district=${encodeURIComponent(district)}`);
  };

  const handleOwnerAccess = () => {
    setMenuOpen(false);
    const role = safeStorage.getItem("yafa-role");
    if (role === "owner") {
      route("/owner/dashboard");
    } else {
      route("/auth/owner-login");
    }
  };

  const handleShare = () => {
    setMenuOpen(false);
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    shareOrCopy("يافع ون", "تطبيق يافع ون — السوق الإلكتروني لأبناء يافع", origin);
  };

  return <div className="app-shell visitor-shell visitor-home">
    <header className="home-header">
      <div className="home-header-row">
        <button className="icon-button" aria-label="فتح القائمة" onClick={() => setMenuOpen((prev) => !prev)}><Menu /></button>
        <Brand compact />
        <form className="home-smart-search" onSubmit={submitSearch}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن منتجات، متاجر، خدمات..." /><button aria-label="تنفيذ البحث">بحث</button></form>
        <button className="icon-button notification-button" aria-label="الإشعارات" onClick={() => route("/visitor/notifications")}><Bell /><i /></button>
      </div>
      <label className="district-picker"><MapPin /><span>الموقع داخل يافع:</span><select value={district} onChange={(event) => changeDistrict(event.target.value)}>{yafaDistricts.map((name) => <option key={name}>{name}</option>)}</select></label>
    </header>

    {menuOpen && (
      <div className="more-backdrop" onClick={() => setMenuOpen(false)} style={{ zIndex: 9999 }}>
        <section className="more-sheet" onClick={(event) => event.stopPropagation()} style={{ paddingBottom: '32px' }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", color: "var(--forest)" }}>قائمة يافع ون الرئيسية</h2>
            <button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="إغلاق القائمة" style={{ background: "#f1f5f9", borderRadius: "50%", width: 36, height: 36, display: "grid", placeItems: "center" }}><X style={{ width: 18, height: 18 }} /></button>
          </div>
          <div className="more-grid" style={{ gridTemplateColumns: "repeat(1, 1fr)", gap: "10px" }}>
            <button style={{ display: "flex", alignItems: "center", justifyContent: "start", gap: "12px", padding: "12px 16px", minHeight: "50px", fontSize: "14px", fontWeight: 700 }} onClick={() => { setMenuOpen(false); route("/visitor/home"); }}>
              <Home style={{ width: 20, height: 20, color: "var(--gold)" }} />
              <span>الرئيسية</span>
            </button>
            <button style={{ display: "flex", alignItems: "center", justifyContent: "start", gap: "12px", padding: "12px 16px", minHeight: "50px", fontSize: "14px", fontWeight: 700 }} onClick={() => { setMenuOpen(false); route("/visitor/home"); }}>
              <Store style={{ width: 20, height: 20, color: "var(--gold)" }} />
              <span>بوابة الزائر</span>
            </button>
            <button style={{ display: "flex", alignItems: "center", justifyContent: "start", gap: "12px", padding: "12px 16px", minHeight: "50px", fontSize: "14px", fontWeight: 700 }} onClick={handleOwnerAccess}>
              <KeyRound style={{ width: 20, height: 20, color: "var(--gold)" }} />
              <span>دخول صاحب المنشأة</span>
            </button>
            <button style={{ display: "flex", alignItems: "center", justifyContent: "start", gap: "12px", padding: "12px 16px", minHeight: "50px", fontSize: "14px", fontWeight: 700 }} onClick={handleShare}>
              <Share2 style={{ width: 20, height: 20, color: "var(--gold)" }} />
              <span>مشاركة التطبيق</span>
            </button>
          </div>
        </section>
      </div>
    )}
    <main className="page-content home-content">
      {/* Announcement banner removed per user instructions */}

      {appearance.sections
        .filter((sec) => sec.visible && sec.id !== "featuredStores" && sec.id !== "promotions" && sec.id !== "vehiclesRealEstate")
        .sort((a, b) => a.order - b.order)
        .map((sec) => {
          switch (sec.id) {
            case "heroCarousel":
              return <VisitorCarousel key="heroCarousel" />;
            case "quickActivities":
              return (
                <div key="quickActivitiesWithRates">
                  <section className="home-section" key="exchangeRatesTop">
                    <div style={{ background: "linear-gradient(135deg, #064b3d, #03372d)", color: "white", borderRadius: "16px", padding: "16px 20px", boxShadow: "0 6px 20px rgba(6,75,61,0.18)", marginBottom: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Landmark style={{ width: 22, color: "var(--gold)" }} />
                          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "white" }}>أسعار الصرف – جنوب اليمن</h3>
                        </div>
                        <span style={{ fontSize: "11px", background: "rgba(199,148,44,0.2)", color: "var(--gold)", padding: "3px 8px", borderRadius: "6px" }}>معتمدة من الإدارة</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                        <div style={{ background: "rgba(255,255,255,0.08)", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <div style={{ fontSize: "12px", color: "var(--gold-pale)", marginBottom: "4px" }}>الريال السعودي (SAR)</div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                            <span>شراء: <b>{liveRates.rates.SAR.buy}</b></span>
                            <span>بيع: <b>{liveRates.rates.SAR.sell}</b></span>
                          </div>
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.08)", padding: "10px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <div style={{ fontSize: "12px", color: "var(--gold-pale)", marginBottom: "4px" }}>الدولار الأمريكي (USD)</div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                            <span>شراء: <b>{liveRates.rates.USD.buy}</b></span>
                            <span>بيع: <b>{liveRates.rates.USD.sell}</b></span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--gold-pale)" }}>
                        <span>آخر تحديث: {hydrated ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "short", timeStyle: "short" }).format(new Date(liveRates.updatedAt)) : "معتمد اليوم"}</span>
                        <button onClick={() => route("/visitor/exchange-rates")} style={{ background: "var(--gold)", color: "var(--forest-dark)", border: "none", padding: "6px 14px", borderRadius: "8px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>المحول والأسعار</span>
                          <ChevronLeft style={{ width: 14 }} />
                        </button>
                      </div>
                    </div>
                  </section>
                  <section className="home-section" key="quickActivities">
                    <SectionTitle title={sec.title || "دليل الأنشطة والخدمات التجارية"} action={() => route("/visitor/stores")} />
                    <div className="activity-grid">
                      {liveActivities
                        .filter((act) => act.visible !== false)
                        .map((act) => {
                          const Icon = activityIconMap[act.iconKey] || Store;
                          const fallbackImg = act.defaultImage || "/assets/market.jpg";
                          const cardSrc = resolveSlotPrimaryImage(
                            appImages,
                            `activity_card_${act.id}`,
                            activityImages[act.id] || fallbackImg,
                          );
                          return (
                            <button key={act.id} onClick={() => route(act.path)}>
                              <div className="activity-image">
                                <img
                                  src={cardSrc}
                                  alt={`صورة ${act.name}`}
                                  loading="lazy"
                                  onError={(event) => {
                                    event.currentTarget.onerror = null;
                                    event.currentTarget.src = fallbackImg;
                                  }}
                                />
                                <Icon />
                              </div>
                              <span>{act.name}</span>
                            </button>
                          );
                        })}
                    </div>
                    <Button kind="outline" className="all-activities" onClick={() => route("/visitor/stores")}>
                      <Grid2X2 /> عرض جميع الأنشطة
                    </Button>
                  </section>
                </div>
              );
            case "exchangeRemittance":
              return null;
            case "featuredStores":
              return (
                <section className="home-section" key="featuredStores">
                  <SectionTitle title={sec.title || "المتاجر المعتمدة في يافع"} action={() => route("/visitor/stores")} />
                  <div style={{ background: "white", padding: "14px 18px", borderRadius: "16px", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => route("/visitor/stores")}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Store style={{ width: 24, height: 24, color: "var(--forest)" }} />
                      <div>
                        <strong style={{ fontSize: "13px", display: "block", color: "var(--forest)" }}>دليل المتاجر والمنشآت في يافع</strong>
                        <small style={{ color: "var(--muted)", fontSize: "11px" }}>استعراض المتاجر المسجلة والمعتمدة حسب المديرية</small>
                      </div>
                    </div>
                    <Button kind="outline" className="text-xs py-1 px-3">دخول المتاجر</Button>
                  </div>
                </section>
              );
            case "promotions":
              return (
                <section className="home-section" key="promotions">
                  <SectionTitle title={sec.title || "أحدث العروض والخصومات"} action={() => route("/visitor/promotions")} />
                  <div style={{ background: "linear-gradient(135deg, #fdfbf7, #f7f2e4)", border: "1px solid #ebd9b7", borderRadius: "16px", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => route("/visitor/promotions")}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "var(--gold)", color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}><Gift style={{ width: 20 }} /></div>
                      <div>
                        <strong style={{ fontSize: "13px", display: "block", color: "var(--forest)" }}>عروض وبونصات متاجر يافع</strong>
                        <small style={{ color: "var(--muted)", fontSize: "11px" }}>خصومات فورية وعروض حصرية لأبناء يافع</small>
                      </div>
                    </div>
                    <Button kind="outline" className="text-xs py-1 px-3">استعراض العروض</Button>
                  </div>
                </section>
              );
            case "vehiclesRealEstate":
              return (
                <section className="home-section" key="vehiclesRealEstate">
                  <SectionTitle title={sec.title || "سوق السيارات والعقارات وحراج المستعمل"} action={() => route("/visitor/vehicles")} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "10px" }}>
                    <button onClick={() => route("/visitor/dealers")} style={{ background: "white", padding: "12px 8px", borderRadius: "12px", border: "1px solid var(--line)", textAlign: "center" }}>
                      <Car style={{ margin: "0 auto 4px", color: "var(--forest)", width: 22 }} />
                      <span style={{ fontSize: "11px", fontWeight: 700, display: "block" }}>معارض السيارات</span>
                    </button>
                    <button onClick={() => route("/visitor/property")} style={{ background: "white", padding: "12px 8px", borderRadius: "12px", border: "1px solid var(--line)", textAlign: "center" }}>
                      <Building2 style={{ margin: "0 auto 4px", color: "var(--forest)", width: 22 }} />
                      <span style={{ fontSize: "11px", fontWeight: 700, display: "block" }}>عقارات يافع</span>
                    </button>
                    <button onClick={() => route("/visitor/used")} style={{ background: "white", padding: "12px 8px", borderRadius: "12px", border: "1px solid var(--line)", textAlign: "center" }}>
                      <Package style={{ margin: "0 auto 4px", color: "var(--forest)", width: 22 }} />
                      <span style={{ fontSize: "11px", fontWeight: 700, display: "block" }}>حراج المستعمل</span>
                    </button>
                  </div>
                </section>
              );
            case "shareAndEarn":
              return (
                <section className="home-section" key="shareAndEarn">
                  <div style={{ background: "linear-gradient(135deg, var(--forest), var(--forest-dark))", color: "white", borderRadius: "16px", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", boxShadow: "0 6px 18px rgba(6,75,61,0.18)" }} onClick={() => route("/visitor/share")}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "var(--gold)", color: "var(--forest-dark)", display: "flex", alignItems: "center", justifyContent: "center" }}><Gift style={{ width: 20 }} /></div>
                      <div>
                        <strong style={{ fontSize: "13px", display: "block", color: "white" }}>شارك واربح 1,000 ريال يمني</strong>
                        <small style={{ color: "var(--gold-pale)", fontSize: "10px" }}>ادعُ منشأة جديدة في يافع واحصل على مكافأة فورية بعد اعتمادها</small>
                      </div>
                    </div>
                    <ChevronLeft style={{ width: 18, color: "var(--gold)" }} />
                  </div>
                </section>
              );
            default:
              return null;
          }
        })}
    </main>
  </div>;
}

const yafaDistricts = ["لبعوس", "رصد", "الحد", "يهر", "المفلحي", "سرار", "سباح"];

const activityIconMap: Record<string, any> = {
  Utensils,
  ShoppingCart,
  ShoppingBag,
  Box,
  Building2,
  GlassWater,
  Home,
  Car,
  Stethoscope,
  Pill,
  Fuel,
  FileText,
  Wrench,
  Package,
  Landmark,
  Store,
};

const homeActivities = [
  { id: "restaurants", name: "المطاعم والمقاهي", path: "/visitor/restaurants", Icon: Utensils, image: "/assets/activities/restaurants.jpg", banner: "/assets/activity-banners/restaurants.jpg" },
  { id: "groceries", name: "التموينات والمواد الغذائية", path: "/visitor/groceries", Icon: ShoppingCart, image: "/assets/activities/groceries.jpg", banner: "/assets/activity-banners/groceries.jpg" },
  { id: "fashion", name: "الملابس والأحذية", path: "/visitor/fashion", Icon: ShoppingBag, image: "/assets/activities/fashion.jpg", banner: "/assets/activity-banners/fashion.jpg" },
  { id: "electronics", name: "الجوالات والإلكترونيات", path: "/visitor/electronics", Icon: Box, image: "/assets/activities/electronics.jpg", banner: "/assets/activity-banners/electronics.jpg" },
  { id: "building", name: "مواد البناء", path: "/visitor/building", Icon: Building2, image: "/assets/activities/building.jpg", banner: "/assets/activity-banners/building.jpg" },
  { id: "aluminum", name: "الألمنيوم والزجاج", path: "/visitor/aluminum", Icon: GlassWater, image: "/assets/activities/aluminum-glass.jpg", banner: "/assets/activity-banners/aluminum.jpg" },
  { id: "furniture", name: "الأثاث والمفروشات", path: "/visitor/furniture", Icon: Home, image: "/assets/activities/furniture.jpg", banner: "/assets/activity-banners/furniture.jpg" },
  { id: "cars", name: "السيارات", path: "/visitor/dealers", Icon: Car, image: "/assets/activities/cars.jpg", banner: "/assets/activity-banners/cars.jpg" },
  { id: "property", name: "العقارات", path: "/visitor/property", Icon: Building2, image: "/assets/activities/property.jpg", banner: "/assets/activity-banners/property.jpg" },
  { id: "health", name: "المستشفيات والمراكز الصحية", path: "/visitor/health", Icon: Stethoscope, image: "/assets/activities/health.jpg", banner: "/assets/activity-banners/health.jpg" },
  { id: "pharmacies", name: "الصيدليات", path: "/visitor/pharmacies", Icon: Pill, image: "/assets/activities/pharmacy.jpg", banner: "/assets/activity-banners/pharmacies.jpg" },
  { id: "fuel", name: "محطات الوقود والغاز", path: "/visitor/fuel", Icon: Fuel, image: "/assets/activities/fuel.jpg", banner: "/assets/activity-banners/fuel.jpg" },
  { id: "offices", name: "مكاتب الخدمات", path: "/visitor/offices", Icon: FileText, image: "/assets/activities/offices.jpg", banner: "/assets/activity-banners/offices.jpg" },
  { id: "maintenance", name: "الورش والصيانة", path: "/visitor/maintenance", Icon: Wrench, image: "/assets/activities/maintenance.jpg", banner: "/assets/activity-banners/maintenance.jpg" },
  { id: "used", name: "حراج المستعمل", path: "/visitor/used", Icon: Package, image: "/assets/activities/used.jpg", banner: "/assets/activity-banners/used.jpg" },
  { id: "exchange", name: "الصرافة والتحويلات", path: "/visitor/exchange", Icon: Landmark, image: "/assets/activities/exchange.jpg", banner: "/assets/activity-banners/exchange.jpg" },
  { id: "professionals", name: "أصحاب المهن", path: "/visitor/professionals", Icon: Wrench, image: "/assets/activities/maintenance.jpg", banner: "/assets/activity-banners/maintenance.jpg" },
] as const;

const categoryActivityIds: Record<string, string> = {
  restaurants: "restaurants", groceries: "groceries", fashion: "fashion", electronics: "electronics",
  building: "building", aluminum: "aluminum", furniture: "furniture", vehicles: "cars", dealers: "cars",
  property: "property", health: "health", pharmacies: "pharmacies", fuel: "fuel", services: "offices",
  offices: "offices", maintenance: "maintenance", exchange: "exchange", professionals: "professionals",
};

const quickVisitorServices = [
  { name: "طلب توصيل", path: "/visitor/services?type=delivery", Icon: Truck },
  { name: "احجز خدمة", path: "/visitor/services?type=booking", Icon: Wrench },
  { name: "احجز موعد", path: "/visitor/health?type=appointment", Icon: CalendarDays },
  { name: "اطلب عرض سعر", path: "/visitor/building?type=quote", Icon: FileText },
  { name: "تواصل مع متجر", path: "/visitor/stores?contact=true", Icon: MessageCircle },
] as const;

const homePreviewStores = [
  { id: 1, name: "متجر يافع النموذجي", district: "لبعوس", activity: "منتجات محلية", image: market, approved: true, active: true },
  { id: 2, name: "خدمات يافع النموذجية", district: "لبعوس", activity: "خدمات", image: storeImage, approved: true, active: true },
  { id: 3, name: "سوق رصد النموذجي", district: "رصد", activity: "تموينات", image: market, approved: true, active: true },
  { id: 4, name: "تقنية الحد النموذجية", district: "الحد", activity: "إلكترونيات", image: storeImage, approved: true, active: true },
  { id: 5, name: "متجر يهر النموذجي", district: "يهر", activity: "تجارة عامة", image: hero, approved: true, active: true },
  { id: 6, name: "خدمات المفلحي النموذجية", district: "المفلحي", activity: "خدمات", image: storeImage, approved: true, active: true },
  { id: 7, name: "سوق سرار النموذجي", district: "سرار", activity: "منتجات محلية", image: market, approved: true, active: true },
  { id: 8, name: "متجر سباح النموذجي", district: "سباح", activity: "تجارة عامة", image: hero, approved: true, active: true },
];

function HomeStoreCard({ store }: { store: typeof homePreviewStores[number] & { phone?: string } }) {
  const [contactOpen, setContactOpen] = useState(false);
  const appImages = useAppImages();
  const resolvedCover = store.image === storeImage
    ? resolveSlotPrimaryImage(appImages, "store_alt_cover", storeImage)
    : (store.image === market || store.image === hero)
      ? resolveSlotPrimaryImage(appImages, "store_default_cover", store.image)
      : store.image;
  const [favorite, setFavorite] = useState(false);
  useEffect(() => {
    try {
      setFavorite((JSON.parse(safeStorage.getItem("yafa-favorites") || "[]") as Array<number | string>).map(String).includes(String(store.id)));
    } catch {}
  }, [store.id]);
  const storePhone = store.phone && store.phone !== "770000000" ? store.phone : "";
  return <article className="nearby-card"><div className="nearby-image"><img src={resolvedCover} alt={`صورة معاينة ${store.name}`} loading="lazy" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = market; }} /><button className={favorite ? "selected" : ""} aria-label={favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"} onClick={() => {
    const next = !favorite;
    setFavorite(next);
    let saved: Array<number | string> = [];
    try { saved = JSON.parse(safeStorage.getItem("yafa-favorites") || "[]"); } catch { saved = []; }
    const filtered = saved.filter((id) => String(id) !== String(store.id));
    safeStorage.setItem("yafa-favorites", JSON.stringify(next ? [...filtered, store.id] : filtered));
    toastMessage(favorite ? "أزيل المتجر من المفضلة" : "أضيف المتجر إلى المفضلة");
  }}><Heart /></button><span>متجر معتمد</span></div><div className="nearby-body"><h3>{store.name}</h3><p><MapPin /> {store.district} · {store.activity}</p><small>متاح في يافع ون</small><div className="card-actions"><Button kind="gold" onClick={() => route(`/visitor/store/${store.id}`)}>عرض المتجر</Button><Button kind="outline" onClick={() => setContactOpen(true)}>تواصل</Button></div></div>
  {contactOpen && <Modal title={`التواصل مع ${store.name}`} close={() => setContactOpen(false)}>
    <div style={{ display: "grid", gap: "10px" }}>
      <Button kind="gold" onClick={() => { setContactOpen(false); route(`/visitor/chats?storeId=${encodeURIComponent(String(store.id))}&storeName=${encodeURIComponent(store.name)}`); }}><MessageCircle /> محادثة فورية داخل التطبيق</Button>
      {storePhone && <Button kind="outline" onClick={() => route(`https://wa.me/967${storePhone.replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أتواصل معكم عبر يافع ون بخصوص ${store.name}`)}`)}><MessageCircle /> مراسلة عبر واتساب</Button>}
      {storePhone && <Button kind="outline" onClick={() => route(`tel:${storePhone}`)}><Store /> اتصال هاتفي مباشر ({storePhone})</Button>}
    </div>
  </Modal>}
  </article>;
}

function VisitorCarousel() {
  const published = usePublishedAds();
  const appImages = useAppImages();
  const carouselOverride = appImages["home_carousel"];
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);
  const baseAds: CarouselAd[] = useMemo(() => {
    if (carouselOverride && Array.isArray(carouselOverride.images) && carouselOverride.images.length > 0) {
      return [...carouselOverride.images]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((img, idx) => ({
          id: idx + 1,
          title: img.label || defaultCarouselAds[idx]?.title || "يافع ون",
          description: defaultCarouselAds[idx]?.description || "السوق الإلكتروني الشامل في يافع",
          image: img.url,
          route: img.route || defaultCarouselAds[idx]?.route || "/visitor/stores",
          active: true,
          order: img.order || idx + 1,
          startsAt: "",
          endsAt: "",
        }));
    }
    return published;
  }, [carouselOverride, published]);

  const ads = baseAds
    .filter((ad) => ad.active && (nowMs === null || ((!ad.startsAt || nowMs >= new Date(`${ad.startsAt}T00:00:00`).getTime()) && (!ad.endsAt || nowMs <= new Date(`${ad.endsAt}T23:59:59`).getTime()))))
    .sort((a, b) => a.order - b.order);
  const [current, setCurrent] = useState(0);
  const [touching, setTouching] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const didSwipe = useRef(false);

  useEffect(() => {
    if (current >= ads.length) setCurrent(0);
  }, [ads.length, current]);

  useEffect(() => {
    if (touching || ads.length < 2) return;
    const timer = window.setInterval(() => setCurrent((value) => (value + 1) % ads.length), 4000);
    return () => window.clearInterval(timer);
  }, [ads.length, touching]);

  if (!ads.length) return null;
  const next = () => setCurrent((value) => (value + 1) % ads.length);
  const previous = () => setCurrent((value) => (value - 1 + ads.length) % ads.length);
  return <section
    className="visitor-carousel"
    aria-roledescription="carousel"
    aria-label="إعلانات يافع ون"
    onTouchStart={(event) => { didSwipe.current = false; setTouching(true); setTouchStart(event.touches[0].clientX); }}
    onTouchEnd={(event) => {
      const distance = event.changedTouches[0].clientX - touchStart;
      if (Math.abs(distance) > 45) didSwipe.current = true;
      if (distance < -45) next();
      if (distance > 45) previous();
      setTouching(false);
    }}
    onTouchCancel={() => setTouching(false)}
  >
    <div className="carousel-track" style={{ transform: `translateX(-${current * 100}%)` }}>
      {ads.map((ad, index) => <button
        className="ad-slide"
        key={ad.id}
        onClick={() => {
          if (didSwipe.current) { didSwipe.current = false; return; }
          route(ad.route);
        }}
        aria-label={`${ad.title}: ${ad.description}`}
        aria-hidden={index !== current}
        tabIndex={index === current ? 0 : -1}
      ><img src={ad.image} alt={`${ad.title} — ${ad.description}`} draggable="false" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = hero; }} /></button>)}
    </div>
    <div className="carousel-dots" aria-label="اختيار الإعلان">
      {ads.map((ad, index) => <button key={ad.id} className={index === current ? "active" : ""} onClick={() => setCurrent(index)} aria-label={`الإعلان ${index + 1}: ${ad.title}`} aria-current={index === current ? "true" : undefined} />)}
    </div>
  </section>;
}

function VisitorShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell visitor-shell"><TopBar /><main className="page-content">{children}</main><VisitorBottom /></div>;
}

function SearchBar() {
  const [query, setQuery] = useState("");
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      route(`/visitor/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      route("/visitor/search");
    }
  };
  return <form className="search-row" onSubmit={handleSearch}>
    <Search />
    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن منتج، متجر أو خدمة..." />
    <Button kind="gold" type="submit">بحث</Button>
  </form>;
}

function SectionTitle({ title, action }: { title: string; action?: () => void }) {
  return <div className="section-title"><h2>{title}</h2>{action && <button onClick={action}>عرض الكل <ChevronLeft /></button>}</div>;
}

function StoreCard({ alt = false, store }: { alt?: boolean; store?: { id: string | number; name: string; district: string; activity?: string; image?: string; phone?: string } }) {
  const [contactOpen, setContactOpen] = useState(false);
  const appImages = useAppImages();
  const fallbackCover = resolveSlotPrimaryImage(appImages, alt ? "store_alt_cover" : "store_default_cover", alt ? storeImage : market);
  const resolved = store || {
    id: alt ? 4 : 1,
    name: alt ? "متجر يافع للتقنية" : "سوق القمة",
    district: "لبعوس",
    activity: alt ? "إلكترونيات" : "منتجات محلية",
    image: fallbackCover,
    phone: "",
  };
  const displayCover = !resolved.image || resolved.image === market || resolved.image === storeImage ? fallbackCover : resolved.image;
  const phone = resolved.phone && resolved.phone !== "770000000" ? resolved.phone : "";
  return <article className="store-card"><img src={displayCover} alt={resolved.name} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = fallbackCover; }} /><span className="badge">{alt ? "عرض خاص" : "مميز"}</span><div><h3>{resolved.name}</h3><p><MapPin /> يافع · {resolved.district}</p><div className="card-actions"><Button kind="outline" onClick={() => setContactOpen(true)}>تواصل</Button><Button kind="gold" onClick={() => route(`/visitor/store/${resolved.id}`)}>عرض المتجر</Button></div></div>
  {contactOpen && <Modal title={`التواصل مع ${resolved.name}`} close={() => setContactOpen(false)}>
    <div style={{ display: "grid", gap: "10px" }}>
      <Button kind="gold" onClick={() => { setContactOpen(false); route(`/visitor/chats?storeId=${encodeURIComponent(String(resolved.id))}&storeName=${encodeURIComponent(resolved.name)}`); }}><MessageCircle /> محادثة فورية داخل التطبيق</Button>
      {phone && <Button kind="outline" onClick={() => route(`https://wa.me/967${phone.replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أتواصل معكم عبر يافع ون بخصوص ${resolved.name}`)}`)}><MessageCircle /> واتساب</Button>}
      {phone && <Button kind="outline" onClick={() => route(`tel:${phone}`)}><Store /> اتصال ({phone})</Button>}
    </div>
  </Modal>}
  </article>;
}

function FeatureGrid() {
  return <div className="feature-grid"><div><ShieldCheck /><b>متاجر موثوقة</b></div><div><Package /><b>توصيل سريع</b></div><div><CircleDollarSign /><b>أسعار مناسبة</b></div><div><ShoppingBag /><b>منتجات أصلية</b></div></div>;
}

const categoryCopy: Record<string, { title: string; subtitle: string; icon: React.ReactNode }> = {
  stores: { title: "المتاجر", subtitle: "اكتشف المتاجر والمنشآت الموثوقة في يافع", icon: <Store /> },
  groceries: { title: "الغذاء والبقالة", subtitle: "كل احتياجات منزلك من المواد الغذائية في يافع", icon: <ShoppingCart /> },
  restaurants: { title: "المطاعم والمقاهي", subtitle: "أشهى المأكولات وأجمل الجلسات", icon: <Utensils /> },
  electronics: { title: "الجوالات والإلكترونيات", subtitle: "أحدث التقنيات بين يديك في يافع", icon: <Box /> },
  fashion: { title: "الملابس والأحذية", subtitle: "أناقة تناسب أسلوب حياتك", icon: <ShoppingBag /> },
  furniture: { title: "الأثاث والمفروشات", subtitle: "بيت أجمل في يافع", icon: <Home /> },
  building: { title: "مواد البناء", subtitle: "كل مواد البناء لمشاريعك في يافع", icon: <Building2 /> },
  aluminum: { title: "الألمنيوم والزجاج", subtitle: "حلول عصرية وجودة عالية", icon: <GlassWater /> },
  services: { title: "الخدمات", subtitle: "مقدمو خدمات موثوقون في يافع", icon: <Wrench /> },
  health: { title: "المستشفيات والمراكز الصحية", subtitle: "الخدمات الصحية داخل مديريات يافع", icon: <Stethoscope /> },
  pharmacies: { title: "الصيدليات", subtitle: "البحث عن الصيدليات داخل يافع", icon: <Pill /> },
  offices: { title: "مكاتب الخدمات", subtitle: "مكاتب ومعاملات وخدمات داخل يافع", icon: <FileText /> },
  maintenance: { title: "الورش والصيانة", subtitle: "ورش ومقدمو صيانة داخل يافع", icon: <Wrench /> },
  exchange: { title: "الصرافة والتحويلات", subtitle: "مكاتب صرافة وتحويلات داخل يافع", icon: <Landmark /> },
  vehicles: { title: "السيارات والعقارات", subtitle: "كل ما تحتاجه في يافع بمكان واحد", icon: <Car /> },
  dealers: { title: "معارض السيارات", subtitle: "أفضل معارض السيارات في يافع", icon: <Car /> },
  property: { title: "العقارات والأراضي", subtitle: "عقارات يافع للبيع والإيجار", icon: <Building2 /> },
  offers: { title: "العروض والتخفيضات", subtitle: "عروض وتخفيضات حصرية في متاجر يافع", icon: <Gift /> },
  promotions: { title: "العروض والبونصات", subtitle: "خصومات فورية وعروض حصرية لأبناء يافع", icon: <Gift /> },
  ads: { title: "الإعلانات والمواضع", subtitle: "تصفح الحملات الإعلانية النشطة داخل يافع", icon: <Image /> },
};

function VisitorCategory({ type }: { type: string }) {
  const copy = categoryCopy[type] || categoryCopy.stores;
  const appImages = useAppImages();
  const defaultStoreCover = resolveSlotPrimaryImage(appImages, "store_default_cover", market);
  const defaultProductImg = resolveSlotPrimaryImage(appImages, "product_default_image", market);
  const vehiclesDefaultImg = resolveSlotPrimaryImage(appImages, "vehicles_default_card", carImage);
  const image = ["vehicles", "dealers"].includes(type) ? vehiclesDefaultImg : type === "stores" ? defaultStoreCover : resolveSlotPrimaryImage(appImages, "scenic_default_hero", hero);
  const customBanners = useActivityBanners();
  const activityId = categoryActivityIds[type];
  const defaultBanner = homeActivities.find((activity) => activity.id === activityId)?.banner;
  const resolvedCategoryBanner =
    type === "property"
      ? resolveSlotPrimaryImage(appImages, "property_page_banner", resolveSlotPrimaryImage(appImages, "activity_banner_property", customBanners.property || defaultBanner || hero))
      : activityId
        ? resolveSlotPrimaryImage(appImages, `activity_banner_${activityId}`, customBanners[activityId] || defaultBanner || hero)
        : type === "ads"
          ? resolveSlotPrimaryImage(appImages, "ads_page_banner", hero)
          : type === "promotions" || type === "offers"
            ? resolveSlotPrimaryImage(appImages, "promotions_page_banner", hero)
            : resolveSlotPrimaryImage(appImages, "stores_page_banner", defaultStoreCover);

  const [selectedDistrict, setSelectedDistrict] = useState<string>("الكل");
  const [sortOrder, setSortOrder] = useState<"default" | "price-asc" | "price-desc">("default");
  const [filterOpen, setFilterOpen] = useState(false);
  const [favProdIds, setFavProdIds] = useState<string[]>([]);
  const [cloudStores, setCloudStores] = useState<any[]>([]);
  const [cloudProducts, setCloudProducts] = useState<any[]>([]);

  useEffect(() => {
    try {
      setFavProdIds((JSON.parse(safeStorage.getItem("yafa-favorite-products") || "[]") as Array<string | number>).map(String));
    } catch {}
    getDocs(query(collection(db, "establishments"), where("approved", "==", true)))
      .then((snap) => setCloudStores(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
    getDocs(query(collection(db, "products"), where("approved", "==", true)))
      .then((snap) => setCloudProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  const toggleFavoriteProd = (id: string | number) => {
    const strId = String(id);
    const exists = favProdIds.includes(strId);
    const next = exists ? favProdIds.filter((x) => x !== strId) : [...favProdIds, strId];
    setFavProdIds(next);
    safeStorage.setItem("yafa-favorite-products", JSON.stringify(next));
    toastMessage(exists ? "أزيل المنتج من المفضلة" : "أضيف إلى المفضلة");
  };

  const baseItems = useMemo(() => {
    const sampleImages = [
      resolveSlotPrimaryImage(appImages, "product_sample_1", market),
      resolveSlotPrimaryImage(appImages, "product_sample_2", storeImage),
      resolveSlotPrimaryImage(appImages, "product_sample_3", carImage),
      defaultProductImg,
    ];
    const ownerPublished = loadOwnerProducts().filter((p) => p.status === "منشور").map((p) => ({
      id: p.id,
      name: p.name,
      numericPrice: Number(p.price) || 0,
      price: `${Number(p.price).toLocaleString()} ${p.currency}`,
      image: p.images[0] || defaultProductImg,
      district: "لبعوس",
    }));
    const fbItems = cloudProducts.filter((p) => p.inStock !== false).map((p) => ({
      id: p.id,
      name: p.name || "منتج",
      numericPrice: Number(p.price) || 0,
      price: `${Number(p.price || 0).toLocaleString()} ${p.currency || "YER"}`,
      image: p.images?.[0] || defaultProductImg,
      district: p.district || "لبعوس",
    }));
    const defaults = products.map((product, i) => ({
      id: i + 1,
      name: type === "property" ? ["أرض سكنية", "فيلا مستقلة", "محل تجاري", "شقة سكنية"][i] : product.name,
      numericPrice: [3500, 4800, 425000, 12000][i] || 5000,
      price: product.price,
      image: i === 0 ? image : sampleImages[i] || product.image,
      district: ["لبعوس", "رصد", "الحد", "يهر"][i] || "لبعوس",
    }));
    const merged = [...fbItems, ...ownerPublished, ...defaults];
    const filtered = selectedDistrict === "الكل" ? merged : merged.filter((it) => it.district === selectedDistrict);
    if (sortOrder === "price-asc") return [...filtered].sort((a, b) => a.numericPrice - b.numericPrice);
    if (sortOrder === "price-desc") return [...filtered].sort((a, b) => b.numericPrice - a.numericPrice);
    return filtered;
  }, [type, image, selectedDistrict, sortOrder, cloudProducts, appImages, defaultProductImg]);

  const matchingStores = useMemo(() => {
    const allStores = [
      ...cloudStores.map((s) => ({
        id: s.id,
        name: s.name || "منشأة يافع",
        district: s.district || "لبعوس",
        activity: s.category || "متجر تجاري",
        image: s.coverImage || s.logoUrl || s.logo || defaultStoreCover,
        phone: s.phone && s.phone !== "770000000" ? s.phone : "",
      })),
      ...homePreviewStores,
    ];
    return selectedDistrict === "الكل" ? allStores : allStores.filter((s) => s.district === selectedDistrict);
  }, [cloudStores, selectedDistrict, defaultStoreCover]);

  return <VisitorShell>
    <ScenicHero title={copy.title} subtitle={copy.subtitle} icon={copy.icon} image={resolvedCategoryBanner} activity={Boolean(activityId)} />
    <SearchBar />
    <div className="filter-row">
      <Button kind="outline" onClick={() => setFilterOpen(true)}><MapPin /> {selectedDistrict === "الكل" ? "كل مديريات يافع" : selectedDistrict}</Button>
      <Button kind="outline" onClick={() => setSortOrder((s) => s === "default" ? "price-asc" : s === "price-asc" ? "price-desc" : "default")}><SlidersHorizontal /> {sortOrder === "default" ? "ترتيب: الافتراضي" : sortOrder === "price-asc" ? "الأقل سعراً" : "الأعلى سعراً"}</Button>
    </div>
    {filterOpen && <Modal title="تصفية حسب المديرية في يافع" close={() => setFilterOpen(false)}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {["الكل", ...yafaDistricts].map((d) => (
          <Button key={d} kind={selectedDistrict === d ? "gold" : "outline"} onClick={() => { setSelectedDistrict(d); setFilterOpen(false); toastMessage(`تم التصفية: ${d}`); }}>{d}</Button>
        ))}
      </div>
    </Modal>}
    <section><SectionTitle title={`نتائج ${copy.title}`} />{baseItems.length ? <div className="product-grid">{baseItems.map((product) => {
      const isFav = favProdIds.includes(String(product.id));
      return <article className="product-card" key={String(product.id)}><button className={`favorite ${isFav ? "selected" : ""}`} aria-label="المفضلة" onClick={() => toggleFavoriteProd(product.id)}><Heart style={{ fill: isFav ? "#dc2626" : "none", color: isFav ? "#dc2626" : undefined }} /></button><img src={product.image} alt={product.name} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = defaultProductImg; }} /><h3>{product.name}</h3><strong>{product.price}</strong><Button kind="gold" onClick={() => route(`/visitor/product/${product.id}`)}>عرض التفاصيل</Button></article>;
    })}</div> : <Empty title="لا توجد نتائج في هذه المديرية" action={() => setSelectedDistrict("الكل")} />}</section>
    <section><SectionTitle title="متاجر موصى بها" /><div className="store-grid">{matchingStores.slice(0, 4).map((st, idx) => <StoreCard key={String(st.id)} alt={idx % 2 === 1} store={st} />)}</div></section>
  </VisitorShell>;
}

function VisitorDetail({ kind, currentPath }: { kind: "store" | "product"; currentPath?: string }) {
  const [count, setCount] = useState(1);
  const [cloudStore, setCloudStore] = useState<any>(null);
  const [cloudStoreProducts, setCloudStoreProducts] = useState<any[]>([]);
  const [cloudProduct, setCloudProduct] = useState<any>(null);
  const [selectedSection, setSelectedSection] = useState("الكل");
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [clientPath, setClientPath] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") setClientPath(window.location.pathname);
  }, []);
  const activePath = currentPath || clientPath;
  const param = activePath.split("/").pop() || "1";

  useEffect(() => {
    setSelectedSection("الكل");
    if (kind === "store") {
      getDoc(doc(db, "establishments", param))
        .then((snap) => { if (snap.exists()) setCloudStore({ id: snap.id, ...snap.data() }); })
        .catch(() => {});
      getDocs(query(collection(db, "products"), where("establishmentId", "==", param), where("approved", "==", true)))
        .then((snap) => {
          setCloudStoreProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        })
        .catch(() => {});
    } else {
      getDoc(doc(db, "products", param))
        .then((snap) => { if (snap.exists()) setCloudProduct({ id: snap.id, ...snap.data() }); })
        .catch(() => {});
    }
  }, [kind, param]);

  const appImages = useAppImages();
  const defaultStoreCover = resolveSlotPrimaryImage(appImages, "store_default_cover", market);
  const defaultProductImg = resolveSlotPrimaryImage(appImages, "product_default_image", market);
  const sampleProd1 = resolveSlotPrimaryImage(appImages, "product_sample_1", market);
  const sampleProd2 = resolveSlotPrimaryImage(appImages, "product_sample_2", storeImage);
  const sampleProd3 = resolveSlotPrimaryImage(appImages, "product_sample_3", carImage);

  const ownerProds = loadOwnerProducts();
  const catalogProducts = [
    { id: 1, name: "عسل يافع السدر الطبيعي الدوعني الفاخر", price: 3500, formattedPrice: "3,500 ر.ي", image: sampleProd1, storeName: "سوق القمة التجاري", category: "منتجات محلية", stock: 12, storeId: 1, desc: "عسل سدر طبيعي 100% مستخرج من مناحل أودية يافع الشامخة، غني بالفوائد الصحية ومضمون الجودة." },
    { id: 2, name: "قهوة بن يافع الأصيلة (محمصة درجة أولى)", price: 4800, formattedPrice: "4,800 ر.ي", image: sampleProd2, storeName: "سوق القمة التجاري", category: "بن وبهارات", stock: 25, storeId: 1, desc: "بن يافعي أصيل من مزارع يافع التاريخية، محمص بعناية ونكهة تراثية فاخرة تعبق بالأصالة." },
    { id: 3, name: "هاتف ذكي حديث يدعم شبكات الجيل الخامس", price: 425000, formattedPrice: "425,000 ر.ي", image: sampleProd3, storeName: "متجر يافع للتقنية", category: "إلكترونيات", stock: 6, storeId: 4, desc: "أحدث إصدارات الهواتف الذكية مع شاشة أموليد وبطارية تدوم طويلاً، مع ضمان محلي معتمد." },
    { id: 4, name: "مكسرات وبهارات يافعية مشكلة فاخرة", price: 12000, formattedPrice: "12,000 ر.ي", image: defaultProductImg, storeName: "سوق القمة التجاري", category: "أغذية ومونة", stock: 18, storeId: 1, desc: "تشكيلة مختارة من أجود أنواع المكسرات والبهارات الطازجة، معبأة بعناية ومناسبة لجميع المناسبات." },
    ...ownerProds.map((op) => ({
      id: op.id,
      name: op.name,
      price: op.price,
      formattedPrice: `${op.price.toLocaleString()} ${op.currency}`,
      image: op.images[0] || defaultProductImg,
      storeName: safeStorage.getItem("yafa-draft-est-name") || "متجري في يافع",
      category: op.mainCategory,
      stock: op.stock || 10,
      storeId: safeStorage.getItem("yafa-owner-est-id") || 99,
      desc: op.description || "منتج عالي الجودة معتمد ومتاح للطلب الفوري في منصة يافع ون.",
    })),
  ];

  let ownerLocalProfile: any = null;
  try {
    const raw = safeStorage.getItem("yafa-owner-profile");
    if (raw) ownerLocalProfile = JSON.parse(raw);
  } catch {}
  const ownerEstId = safeStorage.getItem("yafa-owner-est-id");
  const matchesOwnerStore = ownerEstId && (String(ownerEstId) === String(param) || param === "my-store" || param === "draft" || param === "99");

  let store: any = cloudStore
    ? {
        id: cloudStore.id,
        name: cloudStore.name,
        district: cloudStore.district || "لبعوس",
        address: cloudStore.address || "",
        activity: cloudStore.category || "متجر تجاري",
        description: cloudStore.description || "",
        logo: cloudStore.logo || cloudStore.logoUrl || "",
        image: cloudStore.coverImage || cloudStore.logo || cloudStore.logoUrl || defaultStoreCover,
        gallery: Array.isArray(cloudStore.gallery) ? cloudStore.gallery.filter(Boolean) : [],
        phone: cloudStore.phone && cloudStore.phone !== "770000000" ? cloudStore.phone : "",
        approved: cloudStore.approved,
        active: cloudStore.active,
      }
    : homePreviewStores.find((s) => s.id.toString() === param || s.name.includes(param));
  if (!store) {
    if (param === "souq-alqimma" || param === "1") {
      store = { ...homePreviewStores[0], image: defaultStoreCover, gallery: [], phone: "" };
    } else {
      const ownerEstName = ownerLocalProfile?.name || safeStorage.getItem("yafa-draft-est-name");
      if (ownerEstName && matchesOwnerStore) {
        store = {
          id: ownerEstId || 99,
          name: ownerEstName,
          district: ownerLocalProfile?.district || "لبعوس",
          address: ownerLocalProfile?.address || "",
          activity: "منشأة تجارية",
          description: ownerLocalProfile?.description || "",
          logo: ownerLocalProfile?.logo || "",
          image: ownerLocalProfile?.coverImage || ownerLocalProfile?.logo || defaultStoreCover,
          gallery: Array.isArray(ownerLocalProfile?.gallery) ? ownerLocalProfile.gallery.filter(Boolean) : [],
          phone: ownerLocalProfile?.phone && ownerLocalProfile.phone !== "770000000" ? ownerLocalProfile.phone : "",
          approved: true,
          active: true,
        };
      } else {
        const num = parseInt(param, 10);
        const baseStore = (!isNaN(num) && num >= 1 && num <= homePreviewStores.length) ? homePreviewStores[num - 1] : homePreviewStores[0];
        store = { ...baseStore, image: baseStore.image === market ? defaultStoreCover : baseStore.image, gallery: [], phone: "" };
      }
    }
  } else if (matchesOwnerStore && ownerLocalProfile) {
    store = {
      ...store,
      name: ownerLocalProfile.name || store.name,
      district: ownerLocalProfile.district || store.district,
      address: ownerLocalProfile.address || store.address || "",
      description: ownerLocalProfile.description || store.description || "",
      logo: ownerLocalProfile.logo || store.logo || "",
      image: ownerLocalProfile.coverImage || store.image || ownerLocalProfile.logo || defaultStoreCover,
      gallery: Array.isArray(ownerLocalProfile.gallery) && ownerLocalProfile.gallery.length
        ? ownerLocalProfile.gallery.filter(Boolean)
        : (store.gallery || []),
      phone: (ownerLocalProfile.phone && ownerLocalProfile.phone !== "770000000" ? ownerLocalProfile.phone : store.phone) || "",
    };
  }

  let product: any = cloudProduct
    ? {
        id: cloudProduct.id,
        name: cloudProduct.name,
        price: Number(cloudProduct.price) || 0,
        formattedPrice: `${Number(cloudProduct.price || 0).toLocaleString()} ${cloudProduct.currency || "YER"}`,
        image: cloudProduct.images?.[0] || defaultProductImg,
        storeName: cloudProduct.storeName || "متجر يافع",
        category: cloudProduct.category || "منتجات",
        stock: Number(cloudProduct.stock) || 10,
        storeId: cloudProduct.establishmentId || 1,
        desc: cloudProduct.description || "منتج معتمد في يافع ون",
      }
    : catalogProducts.find((p) => p.id.toString() === param);
  if (!product) {
    const num = parseInt(param, 10);
    product = (!isNaN(num) && num >= 1 && num <= catalogProducts.length) ? catalogProducts[num - 1] : catalogProducts[0];
  }

  const [isStoreFav, setIsStoreFav] = useState(false);
  const [isProdFav, setIsProdFav] = useState(false);

  useEffect(() => {
    try {
      const favStores = (JSON.parse(safeStorage.getItem("yafa-favorites") || "[]") as Array<number | string>).map(String);
      setIsStoreFav(favStores.includes(String(store.id)));
      const favProds = (JSON.parse(safeStorage.getItem("yafa-favorite-products") || "[]") as Array<number | string>).map(String);
      setIsProdFav(favProds.includes(String(product.id)));
    } catch {}
  }, [store.id, product.id]);

  const toggleStoreFav = () => {
    const next = !isStoreFav;
    setIsStoreFav(next);
    let favs: Array<number | string> = [];
    try { favs = JSON.parse(safeStorage.getItem("yafa-favorites") || "[]"); } catch {}
    const filtered = favs.filter((id) => String(id) !== String(store.id));
    const updated = next ? [...filtered, store.id] : filtered;
    safeStorage.setItem("yafa-favorites", JSON.stringify(updated));
    toastMessage(next ? "أضيف المتجر إلى المفضلة" : "أزيل المتجر من المفضلة");
  };

  const toggleProdFav = () => {
    const next = !isProdFav;
    setIsProdFav(next);
    let favs: Array<number | string> = [];
    try { favs = JSON.parse(safeStorage.getItem("yafa-favorite-products") || "[]"); } catch {}
    const filtered = favs.filter((id) => String(id) !== String(product.id));
    const updated = next ? [...filtered, product.id] : filtered;
    safeStorage.setItem("yafa-favorite-products", JSON.stringify(updated));
    toastMessage(next ? "أضيف المنتج إلى المفضلة" : "أزيل المنتج من المفضلة");
  };

  const handleAddToCart = () => {
    try {
      const cart: any[] = JSON.parse(safeStorage.getItem("yafa-cart") || "[]");
      const existing = cart.find((item) => String(item.id) === String(product.id));
      if (existing) {
        existing.quantity += count;
      } else {
        cart.push({
          id: product.id,
          name: product.name,
          price: product.price,
          formattedPrice: product.formattedPrice,
          image: product.image,
          quantity: count,
          storeName: product.storeName,
          establishmentId: String(product.storeId || "1"),
        });
      }
      safeStorage.setItem("yafa-cart", JSON.stringify(cart));
      toastMessage(`تمت إضافة ${count} من "${product.name}" إلى السلة`);
      route("/visitor/cart");
    } catch {
      toastMessage("تمت الإضافة إلى السلة");
    }
  };

  if (kind === "store") {
    const cloudMappedProds = cloudStoreProducts
      .filter((p) => p.active !== false)
      .map((p) => ({
        id: p.id,
        name: p.name || "منتج",
        price: Number(p.price) || 0,
        formattedPrice: `${Number(p.price || 0).toLocaleString()} ${p.currency || "YER"}`,
        image: p.images?.[0] || defaultProductImg,
        storeName: store.name,
        category: p.mainCategory || p.subCategory || p.category || "منتجات المتجر",
        stock: Number(p.stock) || 10,
        storeId: store.id,
        desc: p.description || "منتج متاح في المتجر",
      }));
    const localMatched = catalogProducts.filter((p) => String(p.storeId) === String(store.id) || p.storeName === store.name);
    const mergedMap = new Map<string, any>();
    [...cloudMappedProds, ...localMatched].forEach((item) => {
      mergedMap.set(String(item.id), item);
    });
    const baseStoreProds = Array.from(mergedMap.values());
    const storeProds = baseStoreProds.length ? baseStoreProds : catalogProducts.slice(0, 3);

    const storeSections = Array.from(
      new Set([
        "الكل",
        ...storeProds.map((p) => p.category).filter(Boolean),
        ...(Array.isArray(cloudStore?.sections) ? cloudStore.sections : []),
      ])
    );
    const visibleProds = selectedSection === "الكل"
      ? storeProds
      : storeProds.filter((p) => p.category === selectedSection);
    const displayedProds = visibleProds.length ? visibleProds : storeProds;

    const storePhone = store.phone && store.phone !== "770000000" ? store.phone : "";
    const storeLocation = `يافع · ${store.district}${store.address ? ` — ${store.address}` : ""}`;
    const storeDescription =
      store.description?.trim() ||
      "منشأة تجارية معتمدة في منصة يافع ون تقدم منتجات وخدمات موثوقة لأبناء يافع بجودة عالية وتواصل مباشر وسريع.";

    return (
      <VisitorShell>
        <div className="mobile-subbar">
          <button type="button" className="mobile-back-btn" onClick={() => route("/visitor/stores")}>
            <ChevronLeft style={{ transform: "rotate(180deg)", width: 18, height: 18 }} />
            <span>العودة للمتاجر</span>
          </button>
          <button
            type="button"
            className={`store-fav-chip ${isStoreFav ? "active" : ""}`}
            onClick={toggleStoreFav}
            aria-label={isStoreFav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
          >
            <Heart style={{ width: 18, height: 18, fill: isStoreFav ? "#b72b38" : "none", color: isStoreFav ? "#b72b38" : "#064b3d" }} />
            <span>{isStoreFav ? "بالمفضلة" : "حفظ"}</span>
          </button>
        </div>

        <article className="store-profile-card">
          <div className="store-profile-media">
            <img
              src={store.image || defaultStoreCover}
              alt={store.name}
              referrerPolicy="no-referrer"
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = defaultStoreCover; }}
            />
            <div className="store-profile-scrim">
              <span className="store-verified-line">
                <ShieldCheck style={{ width: 16, height: 16 }} /> منشأة موثقة في يافع ون
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {store.logo && (
                  <img
                    src={store.logo}
                    alt={`شعار ${store.name}`}
                    style={{ width: 44, height: 44, borderRadius: "10px", objectFit: "cover", border: "2px solid #eedab0", background: "#fff", flexShrink: 0 }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <h1>{store.name}</h1>
              </div>
            </div>
          </div>

          <div className="store-profile-body">
            <div className="store-meta-grid">
              <div className="store-meta-item">
                <span className="store-meta-icon"><Store /></span>
                <div>
                  <small>نوع النشاط</small>
                  <b>{store.activity}</b>
                </div>
              </div>
              <div className="store-meta-item">
                <span className="store-meta-icon"><MapPin /></span>
                <div>
                  <small>الموقع</small>
                  <b>{storeLocation}</b>
                </div>
              </div>
            </div>

            <div className="store-desc-box">
              <h2>نبذة عن المنشأة</h2>
              <p>{storeDescription}</p>
            </div>

            {Array.isArray(store.gallery) && store.gallery.length > 0 && (
              <div className="store-desc-box">
                <h2>صور المتجر الداخلية</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "8px", marginTop: "8px" }}>
                  {store.gallery.map((gUrl: string, gIdx: number) => (
                    <img
                      key={`${gIdx}-${gUrl.slice(-16)}`}
                      src={gUrl}
                      alt={`${store.name} ${gIdx + 1}`}
                      style={{ width: "100%", height: "90px", objectFit: "cover", borderRadius: "10px", border: "1px solid var(--line)" }}
                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = defaultStoreCover; }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="store-primary-actions">
              <Button kind="primary" onClick={() => setContactSheetOpen(true)}>
                <Phone /> تواصل مع المنشأة
              </Button>
              <Button
                kind="gold"
                onClick={() => shareOrCopy(store.name, `تصفح ${store.name} في منصة يافع ون`, typeof window !== "undefined" ? window.location.href : "")}
              >
                <Share2 /> مشاركة
              </Button>
            </div>

            <div className="store-quick-contact-row">
              <button
                type="button"
                className="store-quick-btn"
                onClick={() => route(`/visitor/chats?storeId=${encodeURIComponent(String(store.id))}&storeName=${encodeURIComponent(store.name)}`)}
              >
                <MessageCircle /> محادثة فورية
              </button>
              <button
                type="button"
                className="store-quick-btn"
                onClick={() => route(`https://wa.me/967${String(storePhone).replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أتواصل معكم عبر منصة يافع ون بخصوص منشأتكم: ${store.name}`)}`)}
              >
                <MessageCircle /> واتساب مباشر
              </button>
            </div>
          </div>
        </article>

        <section className="store-sections-block">
          <div className="store-block-head">
            <div>
              <h2>أقسام المتجر</h2>
              <p>اختر القسم لعرض المنتجات المتوفرة</p>
            </div>
          </div>
          <div className="store-section-tabs" role="tablist" aria-label="أقسام المتجر">
            {storeSections.map((sec) => (
              <button
                type="button"
                key={sec}
                role="tab"
                aria-selected={selectedSection === sec}
                className={`store-section-tab ${selectedSection === sec ? "active" : ""}`}
                onClick={() => setSelectedSection(sec)}
              >
                <Tag style={{ width: 15, height: 15 }} />
                <span>{sec}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="store-products-block">
          <div className="store-block-head">
            <div>
              <h2>المنتجات المتوفرة</h2>
              <p>{displayedProds.length} صنف معروض</p>
            </div>
          </div>
          <div className="store-products-grid">
            {displayedProds.map((p) => (
              <article className="store-product-card" key={String(p.id)}>
                <div className="store-product-thumb">
                  <img src={p.image} alt={p.name} referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = defaultProductImg; }} />
                </div>
                <div className="store-product-info">
                  <span className="store-product-cat">{p.category}</span>
                  <h3>{p.name}</h3>
                  <strong>{p.formattedPrice}</strong>
                  <Button kind="gold" onClick={() => route(`/visitor/product/${p.id}`)}>
                    عرض التفاصيل
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {contactSheetOpen && (
          <Modal title={`التواصل مع ${store.name}`} close={() => setContactSheetOpen(false)}>
            <div style={{ display: "grid", gap: "10px", marginTop: "8px" }}>
              <Button kind="primary" onClick={() => route(`tel:${storePhone}`)}>
                <Phone /> اتصال هاتفي مباشر ({storePhone})
              </Button>
              <Button
                kind="gold"
                onClick={() => route(`https://wa.me/967${String(storePhone).replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أتواصل معكم عبر منصة يافع ون بخصوص: ${store.name}`)}`)}
              >
                <MessageCircle /> مراسلة عبر واتساب
              </Button>
              <Button
                kind="outline"
                onClick={() => {
                  setContactSheetOpen(false);
                  route(`/visitor/chats?storeId=${encodeURIComponent(String(store.id))}&storeName=${encodeURIComponent(store.name)}`);
                }}
              >
                <MessageCircle /> محادثة داخل يافع ون
              </Button>
            </div>
          </Modal>
        )}
      </VisitorShell>
    );
  }

  return (
    <VisitorShell>
      <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button
          onClick={() => route("/visitor/stores")}
          style={{ background: "none", border: "none", color: "#064b3d", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 13 }}
        >
          <ChevronLeft style={{ transform: "rotate(180deg)", width: 16, height: 16 }} /> العودة للسوق
        </button>
        <button type="button" onClick={() => route(`/visitor/store/${product.storeId || 1}`)} style={{ background: "none", border: "none", fontSize: 12, color: "#064b3d", fontWeight: 700, cursor: "pointer" }}>{product.storeName}</button>
      </div>
      <div className="detail-hero">
        <img src={product.image} alt={product.name} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = defaultProductImg; }} />
      </div>
      <div className="detail-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="badge">منتج موثق</span>
          <span style={{ fontSize: 11, background: "#e8f5e9", color: "#2e7d32", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
            متوفر ({product.stock} قطع)
          </span>
        </div>
        <h1>{product.name}</h1>
        <p><MapPin /> متوفر لدى: {product.storeName} · يافع</p>
        <p style={{ color: "#52605b", lineHeight: 1.6 }}>{product.desc}</p>
        <h2>{product.formattedPrice}</h2>
        <div className="quantity">
          <button type="button" onClick={() => setCount(Math.max(1, count - 1))}>−</button>
          <b>{count}</b>
          <button type="button" onClick={() => setCount(Math.min(Math.max(1, product.stock), count + 1))}>+</button>
        </div>
        <div className="card-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <Button kind={isProdFav ? "gold" : "outline"} onClick={toggleProdFav}>
            <Heart style={{ fill: isProdFav ? "#064b3d" : "none" }} /> {isProdFav ? "في المفضلة" : "مفضلة"}
          </Button>
          <Button kind="gold" onClick={handleAddToCart}>
            <ShoppingCart /> أضف إلى السلة
          </Button>
          <Button kind="outline" onClick={() => route(`/visitor/chats?storeId=${encodeURIComponent(String(product.storeId || "1"))}&storeName=${encodeURIComponent(product.storeName)}`)}>
            <MessageCircle /> طلب / محادثة المتجر
          </Button>
          {store.phone && (
            <Button kind="outline" onClick={() => route(`https://wa.me/967${String(store.phone).replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أرغب في طلب ${count} من منتج: ${product.name} بسعر ${product.formattedPrice} عبر تطبيق يافع ون.`)}`)}>
              <MessageCircle /> طلب عبر واتساب
            </Button>
          )}
        </div>
      </div>
    </VisitorShell>
  );
}

function CartLike({ type }: { type: "cart" | "orders" | "favorites" }) {
  const [, setTick] = useState(0);
  const appImages = useAppImages();
  const defaultProdImg = resolveSlotPrimaryImage(appImages, "product_default_image", market);
  const sampleImgs = [
    resolveSlotPrimaryImage(appImages, "product_sample_1", market),
    resolveSlotPrimaryImage(appImages, "product_sample_2", storeImage),
    resolveSlotPrimaryImage(appImages, "product_sample_3", carImage),
    defaultProdImg,
  ];
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("لبعوس");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer">("cash");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [savedStoreIds, setSavedStoreIds] = useState<string[]>([]);
  const [savedProdIds, setSavedProdIds] = useState<string[]>([]);
  const [localCart, setLocalCart] = useState<any[]>([]);
  const [localOrders, setLocalOrders] = useState<any[]>([]);
  const [ownerProdsState, setOwnerProdsState] = useState<OwnerProduct[]>([]);

  const hydrateFromStorage = () => {
    setCustomerName(safeStorage.getItem("yafa-customer-name") || "");
    setCustomerPhone(safeStorage.getItem("yafa-customer-phone") || "");
    setCustomerAddress(safeStorage.getItem("yafa-district") || "لبعوس");
    setOwnerProdsState(loadOwnerProducts());
    try { setSavedStoreIds((JSON.parse(safeStorage.getItem("yafa-favorites") || "[]") as Array<string | number>).map(String)); } catch {}
    try { setSavedProdIds((JSON.parse(safeStorage.getItem("yafa-favorite-products") || "[]") as Array<string | number>).map(String)); } catch {}
    try { setLocalCart(JSON.parse(safeStorage.getItem("yafa-cart") || "[]")); } catch {}
    try { setLocalOrders(JSON.parse(safeStorage.getItem("yafa-orders") || "[]")); } catch {}
  };

  useEffect(() => {
    hydrateFromStorage();
    if (type === "orders" && auth.currentUser) {
      getDocs(query(collection(db, "orders"), where("customerId", "==", auth.currentUser.uid)))
        .then((snap) => {
          if (!snap.empty) {
            const cloudOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setLocalOrders((prev) => {
              const map = new Map(prev.map((o) => [String(o.id), o]));
              cloudOrders.forEach((o) => map.set(String(o.id), o));
              return Array.from(map.values());
            });
          }
        })
        .catch(() => {});
    }
  }, [type]);

  const refresh = () => {
    hydrateFromStorage();
    setTick((t) => t + 1);
  };

  if (type === "favorites") {
    const allProducts = [
      ...products.map((p, idx) => ({ id: String(idx + 1), name: p.name, price: p.price, image: sampleImgs[idx] || p.image })),
      ...ownerProdsState.map((op) => ({ id: String(op.id), name: op.name, price: `${op.price.toLocaleString()} ${op.currency}`, image: op.images[0] || defaultProdImg })),
    ];
    const favStores = homePreviewStores.filter((s) => savedStoreIds.includes(String(s.id)));
    const favProducts = allProducts.filter((p) => savedProdIds.includes(String(p.id)));

    const removeStore = (id: number | string) => {
      const next = savedStoreIds.filter((x) => x !== String(id));
      safeStorage.setItem("yafa-favorites", JSON.stringify(next));
      toastMessage("أزيل المتجر من المفضلة");
      refresh();
    };

    const removeProduct = (id: number | string) => {
      const next = savedProdIds.filter((x) => x !== String(id));
      safeStorage.setItem("yafa-favorite-products", JSON.stringify(next));
      toastMessage("أزيل المنتج من المفضلة");
      refresh();
    };

    const isEmpty = favStores.length === 0 && favProducts.length === 0;

    return (
      <VisitorShell>
        <ScenicHero slotId="visitor_utility_banner" title="المفضلة" subtitle="متاجرك ومنتجاتك المفضلة للوصول السريع" icon={<Heart />} />
        {isEmpty ? (
          <div className="panel" style={{ textAlign: "center", padding: "40px 16px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(6, 75, 61, 0.08)", color: "#064b3d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Heart style={{ width: 32, height: 32 }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>قائمة المفضلة فارغة</h3>
            <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6, maxWidth: 360, margin: "0 auto 20px" }}>
              لم تقم بإضافة أي متاجر أو منتجات إلى مفضلتك بعد. تصفح سوق يافع وأضف ما يعجبك لتصل إليه بنقرة واحدة.
            </p>
            <Button kind="gold" onClick={() => route("/visitor/home")}>تصفح المتاجر والمنتجات</Button>
          </div>
        ) : (
          <div style={{ padding: "16px 12px" }}>
            {favStores.length > 0 && (
              <section style={{ marginBottom: 24 }}>
                <SectionTitle title="المتاجر المفضلة" />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {favStores.map((s) => (
                    <div key={s.id} className="list-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src={s.image} alt={s.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
                        <div>
                          <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{s.name}</h3>
                          <p style={{ margin: 0, fontSize: 12, color: "#666" }}><MapPin style={{ width: 12, height: 12, display: "inline" }} /> {s.district} · {s.activity}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Button kind="gold" onClick={() => route(`/visitor/store/${s.id}`)}>زيارة المتجر</Button>
                        <button className="icon-button danger" onClick={() => removeStore(s.id)} title="حذف من المفضلة"><Trash2 /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {favProducts.length > 0 && (
              <section>
                <SectionTitle title="المنتجات المفضلة" />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {favProducts.map((p) => (
                    <div key={p.id} className="list-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src={p.image} alt={p.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
                        <div>
                          <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{p.name}</h3>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#064b3d" }}>{p.price}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Button kind="gold" onClick={() => route(`/visitor/product/${p.id}`)}>عرض التفاصيل</Button>
                        <button className="icon-button danger" onClick={() => removeProduct(p.id)} title="حذف من المفضلة"><Trash2 /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </VisitorShell>
    );
  }

  if (type === "cart") {
    const cart = localCart;

    const removeFromCart = (id: number | string) => {
      const updated = cart.filter((item) => String(item.id) !== String(id));
      safeStorage.setItem("yafa-cart", JSON.stringify(updated));
      setLocalCart(updated);
      toastMessage("تم الحذف من السلة");
      refresh();
    };

    const updateQuantity = (id: number | string, delta: number) => {
      const nextCart = cart.map((i) => String(i.id) === String(id) ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i);
      safeStorage.setItem("yafa-cart", JSON.stringify(nextCart));
      setLocalCart(nextCart);
      refresh();
    };

    const total = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);

    const handleCheckout = async (e: FormEvent) => {
      e.preventDefault();
      if (!cart.length) return;
      if (!customerName.trim() || !customerPhone.trim()) {
        return toastMessage("أدخل الاسم ورقم الجوال لإتمام الطلب");
      }
      setSubmittingOrder(true);
      const orderId = `ORD-${Date.now().toString().slice(-5)}`;
      const firstStore = cart[0]?.storeName || "متجر يافع";
      const estId = String(cart[0]?.establishmentId || "1");
      const order = {
        id: orderId,
        establishmentId: estId,
        storeName: firstStore,
        customerId: auth.currentUser?.uid || safeStorage.getItem("yafa-visitor-auth") || "guest",
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        address: customerAddress.trim(),
        paymentMethod,
        items: [...cart],
        itemsCount: cart.length,
        total,
        date: new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date()),
        createdAt: new Date().toISOString(),
        status: "قيد المراجعة والتجهيز",
      };

      safeStorage.setItem("yafa-customer-name", customerName.trim());
      safeStorage.setItem("yafa-customer-phone", customerPhone.trim());

      if (auth.currentUser) {
        try {
          await setDoc(doc(db, "orders", orderId), {
            ...order,
            status: "pending",
          });
        } catch (err) {
          logFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
        }
      }

      let orders: any[] = [];
      try { orders = JSON.parse(safeStorage.getItem("yafa-orders") || "[]"); } catch {}
      safeStorage.setItem("yafa-orders", JSON.stringify([order, ...orders]));
      safeStorage.setItem("yafa-cart", "[]");
      setLocalCart([]);

      const adminOrders = loadAdminSectionData("orders");
      saveAdminSectionData("orders", [
        {
          id: orderId,
          title: `طلب من ${firstStore}`,
          detail: `العميل: ${order.customerName} (${order.customerPhone}) · ${total.toLocaleString()} ر.ي`,
          status: "قيد المراجعة",
          date: order.date,
        },
        ...adminOrders,
      ]);

      setSubmittingOrder(false);
      toastMessage(`تم تأكيد طلبك رقم (${order.id}) بنجاح!`);
      route("/visitor/orders");
    };

    return (
      <VisitorShell>
        <ScenicHero slotId="visitor_utility_banner" title="سلة التسوق" subtitle="مراجعة المنتجات وإتمام الطلب" icon={<ShoppingCart />} />
        {!cart.length ? (
          <div className="panel" style={{ textAlign: "center", padding: "40px 16px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(6, 75, 61, 0.08)", color: "#064b3d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <ShoppingCart style={{ width: 32, height: 32 }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>سلة التسوق فارغة</h3>
            <p style={{ color: "#666", fontSize: 14, margin: "0 auto 20px" }}>أضف منتجات من متاجر يافع لإتمام طلبك.</p>
            <Button kind="gold" onClick={() => route("/visitor/home")}>تسوق الآن</Button>
          </div>
        ) : (
          <div style={{ padding: "16px 12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cart.map((item) => (
                <div key={item.id} className="list-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <img src={item.image} alt={item.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover" }} />
                    <div>
                      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{item.name}</h3>
                      <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
                        السعر: {item.formattedPrice || `${item.price.toLocaleString()} ر.ي`}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <button type="button" onClick={() => updateQuantity(item.id, -1)} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer" }}>−</button>
                        <span style={{ fontWeight: "bold", fontSize: 13 }}>{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.id, 1)} style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #ccc", background: "#f5f5f5", cursor: "pointer" }}>+</button>
                      </div>
                    </div>
                  </div>
                  <button type="button" className="icon-button danger" onClick={() => removeFromCart(item.id)} title="حذف من السلة">
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
            <form className="checkout-card form-panel" onSubmit={handleCheckout} style={{ marginTop: 20, padding: 16, background: "white", borderRadius: 12, border: "1px solid #e0e0e0", display: "grid", gap: "10px" }}>
              <h3 style={{ margin: 0, fontSize: 15, color: "#064b3d" }}>بيانات التوصيل والدفع</h3>
              <label>الاسم الكامل *<input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="الاسم المستلم" /></label>
              <label>رقم الجوال *<input required type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="77xxxxxxx" /></label>
              <label>العنوان والمديرية *<input required value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="لبعوس، السوق العام..." /></label>
              <label>طريقة الدفع
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "cash" | "transfer")}>
                  <option value="cash">الدفع نقداً عند الاستلام (عمولة 0%)</option>
                  <option value="transfer">حوالة صرافة مباشرة للمتجر</option>
                </select>
              </label>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #eee", fontSize: 16 }}>
                <span>إجمالي الطلب:</span>
                <b style={{ color: "#064b3d" }}>{total.toLocaleString()} ر.ي</b>
              </div>
              <Button type="submit" kind="gold" disabled={submittingOrder} style={{ width: "100%" }}>
                {submittingOrder ? "جارٍ إرسال الطلب..." : "تأكيد وإرسال الطلب"}
              </Button>
            </form>
          </div>
        )}
      </VisitorShell>
    );
  }

  const orders = localOrders;

  const cancelOrder = async (orderId: string) => {
    const next = orders.map((o) => o.id === orderId ? { ...o, status: "ملغي" } : o);
    safeStorage.setItem("yafa-orders", JSON.stringify(next));
    setLocalOrders(next);
    if (auth.currentUser) {
      await updateDoc(doc(db, "orders", orderId), { status: "cancelled" }).catch(() => {});
    }
    toastMessage(`تم إلغاء الطلب #${orderId}`);
    refresh();
  };

  return (
    <VisitorShell>
      <ScenicHero slotId="orders_page_banner" title="طلباتي" subtitle="سجل الطلبات السابقة وحالتها" icon={<Package />} />
      {!orders.length ? (
        <div className="panel" style={{ textAlign: "center", padding: "40px 16px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(6, 75, 61, 0.08)", color: "#064b3d", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Package style={{ width: 32, height: 32 }} />
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>لا توجد طلبات سابقة</h3>
          <p style={{ color: "#666", fontSize: 14, margin: "0 auto 20px" }}>يمكنك تصفح متاجر يافع وإتمام أول طلب لك الآن.</p>
          <Button kind="gold" onClick={() => route("/visitor/home")}>تصفح المتاجر</Button>
        </div>
      ) : (
        <div style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((order) => (
            <div key={order.id} className="list-card" style={{ padding: 16, background: "white", borderRadius: 12, border: "1px solid #e0e0e0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: "bold", fontSize: 15, color: "#064b3d" }}>طلب #{order.id}</span>
                <span style={{ fontSize: 12, background: order.status === "ملغي" ? "#fdeeed" : "#e8f5e9", color: order.status === "ملغي" ? "#b91c1c" : "#2e7d32", padding: "3px 8px", borderRadius: 4, fontWeight: 600 }}>{order.status}</span>
              </div>
              <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px" }}>المتجر: {order.storeName || "سوق يافع"} · تاريخ الطلب: {order.date}</p>
              {order.address && <p style={{ fontSize: 12, color: "#666", margin: "0 0 8px" }}>التوصيل: {order.address}</p>}
              <div style={{ borderTop: "1px solid #eee", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#444" }}>عدد الأصناف: {order.items?.length || 1}</span>
                <span style={{ fontSize: 15, fontWeight: "bold", color: "#064b3d" }}>الإجمالي: {order.total?.toLocaleString()} ر.ي</span>
              </div>
              {order.status === "قيد المراجعة والتجهيز" && (
                <div style={{ marginTop: 10 }}>
                  <Button kind="outline" onClick={() => cancelOrder(order.id)}>إلغاء الطلب</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </VisitorShell>
  );
}

type ChatThread = {
  id: string;
  storeId: string;
  storeName: string;
  messages: Array<{ id: string; sender: "visitor" | "store"; text: string; time: string }>;
};

function VisitorChats() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [cloudStoresList, setCloudStoresList] = useState<any[]>([]);

  useEffect(() => {
    let initialThreads: ChatThread[] = [];
    try { initialThreads = JSON.parse(safeStorage.getItem("yafa-chats") || "[]") as ChatThread[]; } catch {}

    const params = new URLSearchParams(window.location.search);
    const targetStoreId = params.get("storeId");
    const targetStoreName = params.get("storeName");

    if (targetStoreId && targetStoreName) {
      const chatId = `store-${targetStoreId}`;
      if (!initialThreads.some((t) => t.id === chatId)) {
        const created: ChatThread = {
          id: chatId,
          storeId: targetStoreId,
          storeName: targetStoreName,
          messages: [{ id: `m-${Date.now()}`, sender: "store", text: `مرحباً بك في ${targetStoreName}! كيف يمكننا مساعدتك اليوم؟`, time: new Intl.DateTimeFormat("ar-YE", { timeStyle: "short" }).format(new Date()) }],
        };
        initialThreads = [created, ...initialThreads];
        safeStorage.setItem("yafa-chats", JSON.stringify(initialThreads));
      }
      setActiveId(chatId);
    }
    setThreads(initialThreads);

    getDocs(query(collection(db, "establishments"), where("approved", "==", true)))
      .then((snap) => setCloudStoresList(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});

    if (auth.currentUser) {
      getDocs(query(collection(db, "chats"), where("visitorId", "==", auth.currentUser.uid)))
        .then((snap) => {
          if (!snap.empty) {
            const cloudThreads: ChatThread[] = snap.docs.map((d) => {
              const data = d.data() as any;
              return {
                id: `store-${data.storeId || data.establishmentId || d.id}`,
                storeId: String(data.storeId || data.establishmentId || d.id),
                storeName: data.storeName || "متجر في يافع",
                messages: Array.isArray(data.messages) ? data.messages : [],
              };
            });
            setThreads((prev) => {
              const map = new Map(prev.map((t) => [t.id, t]));
              cloudThreads.forEach((ct) => map.set(ct.id, ct));
              const merged = Array.from(map.values());
              safeStorage.setItem("yafa-chats", JSON.stringify(merged));
              return merged;
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const activeThread = threads.find((t) => t.id === activeId) || null;

  const startThread = (store: { id: number | string; name: string }) => {
    const chatId = `store-${store.id}`;
    if (!threads.some((t) => t.id === chatId)) {
      const created: ChatThread = {
        id: chatId,
        storeId: String(store.id),
        storeName: store.name,
        messages: [{ id: `m-${Date.now()}`, sender: "store", text: `مرحباً بك في ${store.name}! تفضل بكتابة استفسارك.`, time: new Intl.DateTimeFormat("ar-YE", { timeStyle: "short" }).format(new Date()) }],
      };
      const next = [created, ...threads];
      setThreads(next);
      safeStorage.setItem("yafa-chats", JSON.stringify(next));
    }
    setActiveId(chatId);
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeThread || !text.trim()) return;
    const msg = {
      id: `msg-${Date.now()}`,
      sender: "visitor" as const,
      text: text.trim(),
      time: new Intl.DateTimeFormat("ar-YE", { timeStyle: "short" }).format(new Date()),
    };
    const next = threads.map((t) => t.id === activeThread.id ? { ...t, messages: [...t.messages, msg] } : t);
    setThreads(next);
    safeStorage.setItem("yafa-chats", JSON.stringify(next));
    setText("");

    if (auth.currentUser) {
      let resolvedOwnerId = "";
      try {
        const estDoc = await getDoc(doc(db, "establishments", String(activeThread.storeId)));
        if (estDoc.exists()) resolvedOwnerId = (estDoc.data() as any)?.ownerId || "";
      } catch {}
      const visitorName = safeStorage.getItem("yafa-customer-name") || safeStorage.getItem("yafa-visitor-auth") || "زائر يافع ون";
      await setDoc(doc(db, "chats", `${auth.currentUser.uid}_${activeThread.storeId}`), {
        visitorId: auth.currentUser.uid,
        visitorName,
        ownerId: resolvedOwnerId || String(activeThread.storeId),
        storeId: activeThread.storeId,
        establishmentId: activeThread.storeId,
        storeName: activeThread.storeName,
        lastMessage: msg.text,
        updatedAt: new Date().toISOString(),
        messages: next.find((t) => t.id === activeThread.id)?.messages || [msg],
      }, { merge: true }).catch(() => {});
    }
  };

  return <VisitorShell>
    <ScenicHero slotId="visitor_utility_banner" title="المحادثات" subtitle="تواصل مباشرة مع متاجر يافع" icon={<MessageCircle />} />
    {activeThread ? (
      <section className="panel" style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: "8px" }}>
          <button type="button" className="text-link" onClick={() => setActiveId(null)}>← كل المحادثات</button>
          <b>{activeThread.storeName}</b>
          <Button kind="outline" onClick={() => route(`/visitor/store/${activeThread.storeId}`)}>عرض المتجر</Button>
        </div>
        <div style={{ display: "grid", gap: "8px", maxHeight: "340px", overflowY: "auto", padding: "4px" }}>
          {activeThread.messages.map((m) => (
            <div key={m.id} style={{
              justifySelf: m.sender === "visitor" ? "start" : "end",
              background: m.sender === "visitor" ? "#064b3d" : "#f1f5f9",
              color: m.sender === "visitor" ? "white" : "#0f172a",
              padding: "8px 12px",
              borderRadius: "12px",
              maxWidth: "80%",
              fontSize: "13px",
            }}>
              <div>{m.text}</div>
              <small style={{ opacity: 0.7, fontSize: "10px", display: "block", marginTop: "3px" }}>{m.time}</small>
            </div>
          ))}
        </div>
        <form onSubmit={sendMessage} style={{ display: "flex", gap: "8px" }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالتك للمتجر..." style={{ flex: 1 }} required />
          <Button type="submit" kind="gold">إرسال</Button>
        </form>
      </section>
    ) : (
      <div className="panel" style={{ display: "grid", gap: "12px" }}>
        <SectionTitle title="محادثاتك السابقة" />
        {threads.length ? threads.map((t) => (
          <div key={t.id} className="list-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{t.storeName}</b>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#666" }}>{t.messages[t.messages.length - 1]?.text}</p>
            </div>
            <Button kind="gold" onClick={() => setActiveId(t.id)}>فتح</Button>
          </div>
        )) : <p style={{ color: "#666", fontSize: "13px" }}>لا توجد محادثات مفتوحة بعد. اختر متجراً لبدء المحادثة:</p>}
        <SectionTitle title="بدء محادثة جديدة مع متجر" />
        <div style={{ display: "grid", gap: "8px" }}>
          {(cloudStoresList.length ? cloudStoresList : homePreviewStores).slice(0, 6).map((st: any) => (
            <div key={st.id} className="list-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><b>{st.name}</b> · <small>{st.district || "يافع"}</small></span>
              <Button kind="outline" onClick={() => startThread({ id: st.id, name: st.name })}><MessageCircle /> مراسلة</Button>
            </div>
          ))}
        </div>
      </div>
    )}
  </VisitorShell>;
}

function VisitorServiceShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell visitor-shell service-shell"><TopBar back="/visitor/home" /><main className="page-content">{children}</main><VisitorBottom /></div>;
}

function ExchangeRatesPage() {
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<ExchangeRateData | null>(DEFAULT_EXCHANGE_RATES);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [fromCurr, setFromCurr] = useState<"YER" | "SAR" | "USD">("SAR");
  const [toCurr, setToCurr] = useState<"YER" | "SAR" | "USD">("YER");

  const fetchRates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/exchange-rates");
      const ct = res.headers.get("content-type");
      const json = res.ok && ct && ct.includes("application/json") ? await res.json() : null;
      if (json && json.success && json.data) {
        setData(json.data);
        safeStorage.setItem(exchangeRateStorageKey, JSON.stringify(json.data));
        toastMessage("تم تحديث أسعار الصرف بنجاح من المصدر المعتمد");
      } else {
        const fallback = loadExchangeRates();
        setData(fallback);
        toastMessage("تم استخدام آخر سعر موثوق محفوظ محلياً");
      }
    } catch {
      const fallback = loadExchangeRates();
      setData(fallback);
      toastMessage("تعذر الاتصال بالخادم، تم عرض آخر سعر موثوق");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setHydrated(true);
    setData(loadExchangeRates());
    fetchRates();
  }, []);

  const numericAmount = Number(amount);
  
  // Calculate conversion per rule:
  // Foreign to YER uses Buy price (شراء)
  // YER to Foreign uses Sell price (بيع)
  // Cross currency (SAR <-> USD) via YER
  let convertedResult: number | null = null;
  if (data && Number.isFinite(numericAmount) && numericAmount > 0) {
    if (fromCurr === "YER" && toCurr === "SAR") {
      convertedResult = numericAmount / data.rates.SAR.sell;
    } else if (fromCurr === "YER" && toCurr === "USD") {
      convertedResult = numericAmount / data.rates.USD.sell;
    } else if (fromCurr === "SAR" && toCurr === "YER") {
      convertedResult = numericAmount * data.rates.SAR.buy;
    } else if (fromCurr === "USD" && toCurr === "YER") {
      convertedResult = numericAmount * data.rates.USD.buy;
    } else if (fromCurr === "SAR" && toCurr === "USD") {
      const yer = numericAmount * data.rates.SAR.buy;
      convertedResult = yer / data.rates.USD.sell;
    } else if (fromCurr === "USD" && toCurr === "SAR") {
      const yer = numericAmount * data.rates.USD.buy;
      convertedResult = yer / data.rates.SAR.sell;
    } else {
      convertedResult = numericAmount;
    }
  }

  const appImages = useAppImages();
  const exchangeHeroImg = resolveSlotPrimaryImage(appImages, "exchange_rates_banner", "/assets/activity-banners/exchange.jpg");
  const currencies = [
    { code: "SAR", name: "الريال السعودي" },
    { code: "USD", name: "الدولار الأمريكي" },
  ] as const;

  return <VisitorServiceShell>
    <section className="finance-hero" style={{ backgroundImage: `linear-gradient(120deg,rgba(2,50,41,.96),rgba(5,94,75,.68)),url(${exchangeHeroImg})` }}><div className="finance-icon"><Landmark /></div><div><span className="eyebrow">الخدمات المالية · سوق عدن وجنوب اليمن</span><h1>أسعار الصرف – جنوب اليمن</h1><p>الريال السعودي والدولار الأمريكي مقابل الريال اليمني (مرجعية سوق عدن المالي)</p></div></section>
    <div className="connection-status online"><Wifi /><span>بيانات محدثة معتمدة من إدارة التطبيق (سوق عدن)</span></div>
    
    <section className="rate-panel">
      <div className="rate-meta">
        <div><span>آخر تحديث (توقيت اليمن)</span><b>{hydrated && data ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(data.updatedAt)) : "معتمد اليوم"}</b></div>
        <div><span>المصدر المعتمد</span><b>{data?.source || "سوق عدن المالي - جنوب اليمن"}</b></div>
        <div><span>حالة البيانات</span><b style={{ color: "var(--gold)" }}>محدثة (نشطة)</b></div>
      </div>

      <div className="rate-table" role="table" aria-label="أسعار الصرف">
        <div className="rate-head" role="row">
          <b>العملة</b>
          <b>شراء (YER)</b>
          <b>بيع (YER)</b>
          <b>التغير</b>
          <b>الاتجاه</b>
        </div>
        {currencies.map(({ code, name }) => {
          const item = data?.rates[code];
          const buy = item?.buy || 0;
          const sell = item?.sell || 0;
          const prevBuy = item?.prevBuy ?? buy;
          const diff = buy - prevBuy;
          const trend = diff > 0 ? "↗ ارتفاع" : diff < 0 ? "↘ انخفاض" : "＝ ثبات";
          const trendColor = diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#6b7280";
          return (
            <div className="rate-row" role="row" key={code} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #eee" }}>
              <span><i>{code}</i><b>{name}</b></span>
              <strong>{buy.toLocaleString("en-US")}</strong>
              <strong>{sell.toLocaleString("en-US")}</strong>
              <span style={{ color: trendColor, fontWeight: 700 }}>{diff > 0 ? `+${diff}` : diff}</span>
              <span style={{ color: trendColor, fontWeight: 700 }}>{trend}</span>
            </div>
          );
        })}
      </div>

      {!data && <div className="unavailable-state"><AlertTriangle /><b>الأسعار غير متاحة حالياً</b><p>لن نعرض أسعارًا تقديرية أو عشوائية غير متحقق منها.</p></div>}
      <Button onClick={fetchRates} disabled={loading}>{loading ? <><span className="spinner" /> جارٍ التحديث...</> : <><RefreshCw /> تحديث الأسعار من الخادم</>}</Button>
    </section>

    <section className={`panel currency-calculator ${!data ? "disabled" : ""}`}>
      <h2>حاسبة تحويل العملات</h2>
      <p>تعتمد النتيجة حصريًا على الأسعار المعتمدة لسوق عدن (الشراء للتحويل إلى يمني، البيع للشراء باليمني).</p>
      <div className="calculator-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", margin: "14px 0" }}>
        <label>المبلغ<input type="number" min="0" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" disabled={!data} /></label>
        <label>من العملة<select value={fromCurr} onChange={(event) => setFromCurr(event.target.value as any)} disabled={!data}><option value="SAR">SAR — ريال سعودي</option><option value="USD">USD — دولار أمريكي</option><option value="YER">YER — ريال يمني</option></select></label>
        <label>إلى العملة<select value={toCurr} onChange={(event) => setToCurr(event.target.value as any)} disabled={!data}><option value="YER">YER — ريال يمني</option><option value="SAR">SAR — ريال سعودي</option><option value="USD">USD — دولار أمريكي</option></select></label>
      </div>
      <div className="conversion-result" style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", textAlign: "center", marginTop: "10px" }}>
        <span>الناتج المحسوب</span>
        <strong style={{ fontSize: "1.4rem", display: "block", color: "var(--green)" }}>{convertedResult === null ? "—" : convertedResult.toLocaleString("en-US", { maximumFractionDigits: 2 })} {toCurr}</strong>
        <small style={{ color: "#666", display: "block", marginTop: "4px" }}>* الحساب استرشادي وقد يختلف سعر التنفيذ الفعلي بحسب صراف المحافظة.</small>
      </div>
    </section>

    <div className="alert"><ShieldCheck /> الأسعار معتمدة رسمياً لأسواق جنوب اليمن (سوق عدن المالي) ولا تتأثر بالتحديثات التلقائية غير الموثوقة. الإدارة العامة: ماجد التركي.</div>
  </VisitorServiceShell>;
}

function RemittancePage() {
  const officialUrl = "https://www.unmoneye.com/ar/remittance-tracker";
  const [remittanceImage, setRemittanceImage] = useState<string>("/assets/activity-banners/exchange.jpg");
  const appImages = useAppImages();

  useEffect(() => {
    async function fetchRemittanceImage() {
      try {
        const docRef = doc(db, "settings", "remittanceHero");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data()?.imageUrl) {
          setRemittanceImage(docSnap.data().imageUrl);
        }
      } catch (err) {
        console.error("Failed to fetch remittance hero image:", err);
      }
    }
    fetchRemittanceImage();
  }, []);

  const effectiveRemittanceImg = resolveSlotPrimaryImage(appImages, "remittance_hero", remittanceImage);

  return <VisitorServiceShell>
    <section className="finance-hero remittance-hero" style={{ backgroundImage: `linear-gradient(120deg,rgba(2,50,41,.96),rgba(5,94,75,.68)),url(${effectiveRemittanceImg})`, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "18px" }}><div className="finance-icon"><FileText /></div><div><span className="eyebrow">خدمة خارجية رسمية</span><h1>الاستعلام عن الحوالات</h1><p>الشبكة الموحدة للأموال (UNMoney)</p></div></section>
    <section className="official-service-card">
      <div className="official-brand"><Landmark /><div><h2>تتبع حوالتك بأمان عبر الموقع الرسمي</h2><p>سيتم توجيهك إلى بوابة الشبكة الموحدة للأموال لإدخال رقم الحوالة ومعرفة حالتها بشكل مباشر وآمن.</p></div></div>
      <Button kind="gold" onClick={() => window.open(officialUrl, "_blank", "noopener,noreferrer")}><Share2 /> الانتقال إلى تتبع الحوالة الرسمي</Button>
      <code>{officialUrl}</code>
    </section>
    <section className="security-list">
      <div><ShieldCheck /><span><b>ربط آمن بالموقع الرسمي</b><small>لا توجد أي نتائج وهمية أو استعلامات داخلية غير مصرح بها.</small></span></div>
      <div><LockKeyhole /><span><b>خصوصية تامة</b><small>لا يطلب التطبيق رقم الحوالة ولا يحفظه أو يرسله لأي طرف.</small></span></div>
      <div><FileText /><span><b>النتائج الفعلية من المصدر</b><small>تظهر حالة الحوالة داخل نظام الشبكة الموحدة للأموال حصراً.</small></span></div>
    </section>
    <div className="alert"><AlertTriangle /> استعلام الحوالات يعتمد على الرابط الرسمي للشبكة الموحدة للأموال التزاماً بالمعايير الأمنية ومنعاً لعرض بيانات غير دقيقة.</div>
  </VisitorServiceShell>;
}

function ShareEarn() {
  type ReferralSummary = {
    link: string; successfulInvites: number; eligibleReferrals: number;
    earned: number; paid: number; history: Array<{ establishment: string; status: string; date: string }>;
  };
  const visitorEmail = safeStorage.getItem("yafa-visitor-auth") || safeStorage.getItem("yafa-user-email") || auth.currentUser?.email || "";
  const [referralData, setReferralData] = useState<ReferralSummary | null>(null);

  useEffect(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://yafaone.app";
    if (!visitorEmail && !auth.currentUser) {
      setReferralData(null);
      return;
    }
    const uid = auth.currentUser?.uid || visitorEmail.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "yafa";
    const link = `${origin}/owner/signup?ref=${encodeURIComponent(uid)}`;
    const adminRefs = loadAdminSectionData("referrals");
    const history = adminRefs.map((r) => ({
      establishment: r.title,
      status: r.status,
      date: r.date,
    }));
    const activeCount = adminRefs.filter((r) => r.status === "نشط" || r.status === "معتمدة").length;
    setReferralData({
      link,
      successfulInvites: adminRefs.length,
      eligibleReferrals: activeCount,
      earned: activeCount * 1000,
      paid: 0,
      history,
    });
  }, [visitorEmail]);

  const getShareUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return referralData?.link || `${origin}/owner/signup`;
  };
  const copyReferral = async () => {
    if (!referralData?.link) return toastMessage("سجّل الدخول أولاً لإنشاء رابط الإحالة الخاص بك");
    await shareOrCopy("يافع ون", "رابط الإحالة الخاص بك", referralData.link);
  };
  const shareReferral = (channel: "whatsapp" | "facebook" | "system") => {
    const link = getShareUrl();
    const text = `انضم إلى منصة يافع ون وسجّل منشأتك عبر رابط دعوتي: ${link}`;
    if (channel === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    if (channel === "facebook") window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank", "noopener,noreferrer");
    if (channel === "system") shareOrCopy("يافع ون", text, link);
  };
  const appImages = useAppImages();
  const shareHeroImg = resolveSlotPrimaryImage(appImages, "share_earn_hero", "/assets/carousel/share-rewards.jpg");
  return <VisitorShell>
    <section className="referral-hero" style={{ backgroundImage: `linear-gradient(90deg,rgba(255,255,255,.96),rgba(255,255,255,.12)),url(${shareHeroImg})` }}><div><span className="eyebrow">برنامج الإحالة</span><h1>شارك يافع ون واربح</h1><p>ادعُ أصحاب المنشآت للانضمام إلى يافع ون واستفد من مكافآت الإحالة المستحقة.</p></div></section>
    <div className="referral-stats"><article><UsersRound /><span>الدعوات الناجحة</span><strong>{referralData ? referralData.successfulInvites : "—"}</strong><small>{referralData ? "دعوات مسجلة" : "سجل الدخول للعرض"}</small></article><article><Gift /><span>الإحالات المؤهلة</span><strong>{referralData ? referralData.eligibleReferrals : "—"}</strong><small>بعد اكتمال شروط الاستحقاق</small></article><article><CircleDollarSign /><span>المكافآت المستحقة</span><strong>{referralData ? `${referralData.earned.toLocaleString()} ر.ي` : "—"}</strong><small>1,000 ر.ي لكل منشأة</small></article><article><Check /><span>المكافآت المدفوعة</span><strong>{referralData ? `${referralData.paid.toLocaleString()} ر.ي` : "—"}</strong><small>بعد اعتماد الإدارة</small></article></div>
    <section className="panel referral-link-panel"><div className="panel-heading"><div><Gift /><h2>رابط الإحالة الخاص بك</h2></div><span>{referralData ? "مفعل" : "بانتظار الدخول"}</span></div>{referralData ? <div className="copy-field"><code>{referralData.link}</code><Button onClick={copyReferral}>نسخ</Button></div> : <div className="referral-unavailable"><LockKeyhole /><p>سجّل الدخول الآن للحصول على رابط إحالة فريد ومربوط بحسابك.</p><Button kind="outline" onClick={() => route("/auth/visitor-login?return=/visitor/share")}>تسجيل الدخول</Button></div>}<div className="social-share"><button onClick={() => shareReferral("whatsapp")}><MessageCircle /> مشاركة عبر واتساب</button><button onClick={() => shareReferral("facebook")}><Share2 /> مشاركة عبر فيسبوك</button><button onClick={() => shareReferral("system")}><Share2 /> تطبيقات أخرى</button></div></section>
    <section className="panel"><div className="panel-heading"><div><Settings /><h2>كيف تعمل المكافأة؟</h2></div></div><div className="referral-steps"><article><b>1</b><UserRound /><h3>شارك رابطك</h3><p>أرسل الرابط إلى صاحب منشأة حقيقية في يافع.</p></article><article><b>2</b><ShieldCheck /><h3>اعتماد المنشأة</h3><p>تراجع الإدارة البيانات وتوافق على المنشأة.</p></article><article><b>3</b><Package /><h3>نشر أول منتج</h3><p>يضيف صاحب المنشأة أول منتج صالح ويتم نشره.</p></article><article><b>4</b><Gift /><h3>استحقاق 1,000 ر.ي</h3><p>تُسجل المكافأة مرة واحدة فقط للمنشأة المؤهلة.</p></article></div><div className="alert"><ShieldCheck /> لا تُمنح المكافأة بمجرد التسجيل، ولا يمكن تكرارها لنفس المنشأة أو لإحالة غير حقيقية.</div></section>
    <section className="panel referral-history"><div className="panel-heading"><div><ClipboardList /><h2>سجل الإحالات</h2></div></div>{referralData?.history.length ? referralData.history.map((item) => <div className="referral-history-row" key={`${item.establishment}-${item.date}`}><div><b>{item.establishment}</b><small>{item.date}</small></div><span>{item.status}</span></div>) : <div className="empty compact-empty"><ClipboardList /><h3>لا توجد بيانات إحالات مسجلة بعد</h3><p>شارك رابطك مع أصحاب المتاجر في يافع لبدء احتساب المكافآت.</p></div>}</section>
  </VisitorShell>;
}

function FuelPage() {
  const banners = useActivityBanners();
  const appImages = useAppImages();
  const fuelBannerImg = resolveSlotPrimaryImage(appImages, "fuel_page_banner", banners.fuel || "/assets/activity-banners/fuel.jpg");
  const [activeTab, setActiveTab] = useState<"all" | "stations" | "gas">("all");
  const [gasOrderModal, setGasOrderModal] = useState<{ distributor: any; mode: "order" | "delivery" | "exchange" } | null>(null);
  const [gasContactModal, setGasContactModal] = useState<any | null>(null);
  const [gasQty, setGasQty] = useState(1);
  const [gasDistrict, setGasDistrict] = useState("لبعوس");
  const [gasAddress, setGasAddress] = useState("");
  const [gasPhone, setGasPhone] = useState("");
  const [gasName, setGasName] = useState("");
  const [submittingGas, setSubmittingGas] = useState(false);

  useEffect(() => {
    setGasPhone(safeStorage.getItem("yafa-customer-phone") || "");
    setGasName(safeStorage.getItem("yafa-customer-name") || "");
  }, []);

  const stations = [
    {
      id: "st-1",
      name: "محطة يافع المركزية",
      location: "يافع · لبعوس — الشارع العام",
      status: "متاح الآن · مفتوح 24 ساعة",
      available: true,
      phone: "770112233",
      coords: "13.8608,45.2241",
      image: resolveSlotPrimaryImage(appImages, "fuel_station_1", fuelBannerImg),
      petrol: { available: true, price: "1,150 ر.ي/لتر" },
      diesel: { available: true, price: "1,200 ر.ي/لتر" },
      wash: { available: true, label: "غسيل وتشحيم متاح" },
      oils: { available: true, label: "زيوت أصلية وفلاتر" },
    },
    {
      id: "st-2",
      name: "محطة لبعوس الحديثة",
      location: "يافع · لبعوس — مدخل السوق",
      status: "متاح الآن · خدمة سريعة",
      available: true,
      phone: "771223344",
      coords: "13.8542,45.2189",
      image: resolveSlotPrimaryImage(appImages, "fuel_station_2", "/assets/activities/fuel.jpg"),
      petrol: { available: true, price: "1,160 ر.ي/لتر" },
      diesel: { available: true, price: "1,210 ر.ي/لتر" },
      wash: { available: false, label: "الغسيل متوقف مؤقتاً" },
      oils: { available: true, label: "تغيير زيوت السيارات" },
    },
    {
      id: "st-3",
      name: "محطة رصد النموذجية",
      location: "يافع · رصد — الخط الرئيسي",
      status: "متاح حتى 10:00 مساءً",
      available: true,
      phone: "772334455",
      coords: "13.7395,45.2495",
      image: resolveSlotPrimaryImage(appImages, "fuel_station_3", fuelBannerImg),
      petrol: { available: true, price: "1,170 ر.ي/لتر" },
      diesel: { available: true, price: "1,220 ر.ي/لتر" },
      wash: { available: true, label: "مغسلة سيارات حديثة" },
      oils: { available: true, label: "زيوت محركات مستوردة" },
    },
  ];

  const gasDistributors = [
    {
      id: "gas-1",
      name: "موزع غاز يافع المركزي",
      location: "يافع · لبعوس — جولة لبعوس",
      status: "متاح للتسليم الفوري",
      available: true,
      phone: "773445566",
      cylinderPrice: 7500,
      deliveryFee: 1000,
      deliveryAvailable: true,
      exchangeAvailable: true,
      image: resolveSlotPrimaryImage(appImages, "gas_distributor_1", "/assets/activities/fuel.jpg"),
    },
    {
      id: "gas-2",
      name: "مركز توزيع غاز رصد",
      location: "يافع · رصد — السوق القديم",
      status: "متاح · توصيل وتبديل",
      available: true,
      phone: "774556677",
      cylinderPrice: 7700,
      deliveryFee: 1200,
      deliveryAvailable: true,
      exchangeAvailable: true,
      image: resolveSlotPrimaryImage(appImages, "gas_distributor_2", fuelBannerImg),
    },
    {
      id: "gas-3",
      name: "موزع غاز الحد والمفلحي",
      location: "يافع · الحد — منطقة السعدي",
      status: "متاح بالطلب المسبق",
      available: true,
      phone: "775667788",
      cylinderPrice: 7800,
      deliveryFee: 1500,
      deliveryAvailable: true,
      exchangeAvailable: true,
      image: resolveSlotPrimaryImage(appImages, "gas_distributor_3", "/assets/activities/fuel.jpg"),
    },
  ];

  const openGasAction = (distributor: any, mode: "order" | "delivery" | "exchange") => {
    setGasQty(1);
    setGasOrderModal({ distributor, mode });
  };

  const handleSubmitGasOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!gasOrderModal) return;
    if (!gasName.trim() || !gasPhone.trim()) {
      toastMessage("أدخل الاسم ورقم الجوال لتأكيد طلب الغاز");
      return;
    }
    setSubmittingGas(true);
    const { distributor, mode } = gasOrderModal;
    const modeLabel = mode === "exchange" ? "تبديل أسطوانة غاز" : mode === "delivery" ? "توصيل أسطوانة غاز" : "طلب أسطوانة غاز";
    const total = distributor.cylinderPrice * gasQty + (mode === "delivery" || gasAddress.trim() ? distributor.deliveryFee : 0);
    const orderId = `GAS-${Date.now().toString().slice(-5)}`;
    const orderRecord = {
      id: orderId,
      establishmentId: distributor.id,
      storeName: distributor.name,
      customerId: auth.currentUser?.uid || safeStorage.getItem("yafa-visitor-auth") || "guest",
      customerName: gasName.trim(),
      customerPhone: gasPhone.trim(),
      address: `${gasDistrict}${gasAddress.trim() ? ` - ${gasAddress.trim()}` : ""}`,
      paymentMethod: "cash",
      items: [{ id: distributor.id, name: modeLabel, price: distributor.cylinderPrice, quantity: gasQty }],
      total,
      date: new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date()),
      createdAt: new Date().toISOString(),
      status: "قيد التجهيز",
    };

    try {
      safeStorage.setItem("yafa-customer-name", gasName.trim());
      safeStorage.setItem("yafa-customer-phone", gasPhone.trim());
      let orders: any[] = [];
      try { orders = JSON.parse(safeStorage.getItem("yafa-orders") || "[]"); } catch {}
      safeStorage.setItem("yafa-orders", JSON.stringify([orderRecord, ...orders]));

      if (auth.currentUser) {
        await setDoc(doc(db, "orders", orderId), { ...orderRecord, status: "pending" }).catch(() => {});
      }
      toastMessage(`تم إرسال ${modeLabel} بنجاح (#${orderId})`);
      setGasOrderModal(null);
    } finally {
      setSubmittingGas(false);
    }
  };

  return (
    <VisitorShell>
      <ScenicHero
        title="الوقود والغاز المنزلي"
        subtitle="محطات الوقود المعتمدة وموزعو الغاز المنزلي في مديريات يافع"
        icon={<Fuel />}
        image={fuelBannerImg}
        activity
      />

      <div className="fuel-switcher" role="tablist" aria-label="اختر الخدمة">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          className={activeTab === "all" ? "active" : ""}
          onClick={() => setActiveTab("all")}
        >
          <Grid2X2 style={{ width: 17, height: 17 }} />
          <span>عرض الكل</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "stations"}
          className={activeTab === "stations" ? "active" : ""}
          onClick={() => setActiveTab("stations")}
        >
          <Fuel style={{ width: 17, height: 17 }} />
          <span>محطات الوقود</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "gas"}
          className={activeTab === "gas" ? "active" : ""}
          onClick={() => setActiveTab("gas")}
        >
          <Flame style={{ width: 17, height: 17 }} />
          <span>الغاز المنزلي</span>
        </button>
      </div>

      {(activeTab === "all" || activeTab === "stations") && (
        <section className="fuel-section">
          <div className="store-block-head">
            <div>
              <h2>محطات الوقود في يافع</h2>
              <p>الوقود والخدمات المتوفرة مع الاتصال والاتجاهات</p>
            </div>
          </div>

          <div className="fuel-cards-list">
            {stations.map((st) => (
              <article className="fuel-mobile-card" key={st.id}>
                <div className="fuel-card-banner">
                  <img src={st.image} alt={st.name} referrerPolicy="no-referrer" />
                  <div className="fuel-card-banner-scrim">
                    <span className={`availability-label ${st.available ? "available" : "unavailable"}`}>
                      <Check style={{ width: 14, height: 14 }} />
                      {st.status}
                    </span>
                    <h3>{st.name}</h3>
                    <p><MapPin style={{ width: 15, height: 15 }} /> {st.location}</p>
                  </div>
                </div>

                <div className="fuel-card-body">
                  <div className="fuel-services-grid">
                    <div className={`fuel-service-box ${st.petrol.available ? "on" : "off"}`}>
                      <span className="fuel-srv-icon"><Fuel /></span>
                      <div>
                        <b>البنزين</b>
                        <small>{st.petrol.price}</small>
                      </div>
                    </div>
                    <div className={`fuel-service-box ${st.diesel.available ? "on" : "off"}`}>
                      <span className="fuel-srv-icon"><Droplets /></span>
                      <div>
                        <b>الديزل</b>
                        <small>{st.diesel.price}</small>
                      </div>
                    </div>
                    <div className={`fuel-service-box ${st.wash.available ? "on" : "off"}`}>
                      <span className="fuel-srv-icon"><Sparkles /></span>
                      <div>
                        <b>الغسيل</b>
                        <small>{st.wash.label}</small>
                      </div>
                    </div>
                    <div className={`fuel-service-box ${st.oils.available ? "on" : "off"}`}>
                      <span className="fuel-srv-icon"><Wrench /></span>
                      <div>
                        <b>الزيوت</b>
                        <small>{st.oils.label}</small>
                      </div>
                    </div>
                  </div>

                  <div className="fuel-cta-row">
                    <Button kind="primary" onClick={() => route(`tel:${st.phone}`)}>
                      <Phone /> الاتصال
                    </Button>
                    <Button
                      kind="gold"
                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(st.coords)}`, "_blank", "noopener,noreferrer")}
                    >
                      <Navigation /> الاتجاهات
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {(activeTab === "all" || activeTab === "gas") && (
        <section className="fuel-section">
          <div className="store-block-head">
            <div>
              <h2>موزعو الغاز المنزلي</h2>
              <p>اطلب أسطوانة غاز أو توصيل أو تبديل مباشرة</p>
            </div>
          </div>

          <div className="fuel-cards-list">
            {gasDistributors.map((dist) => (
              <article className="fuel-mobile-card gas-card" key={dist.id}>
                <div className="fuel-card-banner">
                  <img src={dist.image} alt={dist.name} referrerPolicy="no-referrer" />
                  <div className="fuel-card-banner-scrim">
                    <span className="availability-label available">
                      <Check style={{ width: 14, height: 14 }} />
                      {dist.status}
                    </span>
                    <h3>{dist.name}</h3>
                    <p><MapPin style={{ width: 15, height: 15 }} /> {dist.location}</p>
                  </div>
                </div>

                <div className="fuel-card-body">
                  <div className="gas-summary-strip">
                    <div>
                      <Flame style={{ width: 18, height: 18, color: "var(--gold)" }} />
                      <span>أسطوانة 20 لتر: <b>{dist.cylinderPrice.toLocaleString()} ر.ي</b></span>
                    </div>
                    <div>
                      <Truck style={{ width: 18, height: 18, color: "var(--forest)" }} />
                      <span>رسوم التوصيل: <b>{dist.deliveryFee.toLocaleString()} ر.ي</b></span>
                    </div>
                  </div>

                  <div className="gas-actions-grid">
                    <Button kind="gold" onClick={() => openGasAction(dist, "order")}>
                      <Flame /> طلب الغاز
                    </Button>
                    <Button kind="primary" onClick={() => openGasAction(dist, "delivery")}>
                      <Truck /> التوصيل
                    </Button>
                    <Button kind="outline" onClick={() => openGasAction(dist, "exchange")}>
                      <RefreshCw /> التبديل
                    </Button>
                    <Button kind="outline" onClick={() => setGasContactModal(dist)}>
                      <Phone /> التواصل
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {gasOrderModal && (
        <Modal
          title={
            gasOrderModal.mode === "exchange"
              ? `تبديل أسطوانة — ${gasOrderModal.distributor.name}`
              : gasOrderModal.mode === "delivery"
                ? `خدمة التوصيل — ${gasOrderModal.distributor.name}`
                : `طلب غاز منزلي — ${gasOrderModal.distributor.name}`
          }
          close={() => setGasOrderModal(null)}
        >
          <form onSubmit={handleSubmitGasOrder} style={{ display: "grid", gap: "12px", marginTop: "8px" }}>
            <div className="gas-mode-tabs">
              <button
                type="button"
                className={gasOrderModal.mode === "order" ? "active" : ""}
                onClick={() => setGasOrderModal({ ...gasOrderModal, mode: "order" })}
              >
                طلب غاز
              </button>
              <button
                type="button"
                className={gasOrderModal.mode === "delivery" ? "active" : ""}
                onClick={() => setGasOrderModal({ ...gasOrderModal, mode: "delivery" })}
              >
                توصيل للمنزل
              </button>
              <button
                type="button"
                className={gasOrderModal.mode === "exchange" ? "active" : ""}
                onClick={() => setGasOrderModal({ ...gasOrderModal, mode: "exchange" })}
              >
                تبديل أسطوانة
              </button>
            </div>

            <div className="form-grid">
              <label>
                عدد الأسطوانات
                <select value={gasQty} onChange={(e) => setGasQty(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} أسطوانة</option>
                  ))}
                </select>
              </label>
              <label>
                المديرية
                <select value={gasDistrict} onChange={(e) => setGasDistrict(e.target.value)}>
                  {yafaDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            </div>

            <label>
              اسم العميل *
              <input required value={gasName} onChange={(e) => setGasName(e.target.value)} placeholder="الاسم الكامل" />
            </label>
            <label>
              رقم الجوال *
              <input required type="tel" value={gasPhone} onChange={(e) => setGasPhone(e.target.value)} placeholder="77xxxxxxx" />
            </label>
            <label>
              العنوان التفصيلي
              <input value={gasAddress} onChange={(e) => setGasAddress(e.target.value)} placeholder="القرية أو الحي / أقرب معلم" />
            </label>

            <div className="gas-total-box">
              <span>الإجمالي التقديري</span>
              <strong>
                {(gasOrderModal.distributor.cylinderPrice * gasQty + (gasOrderModal.mode === "delivery" || gasAddress.trim() ? gasOrderModal.distributor.deliveryFee : 0)).toLocaleString()} ر.ي
              </strong>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <Button type="submit" kind="gold" disabled={submittingGas}>
                <Check /> {submittingGas ? "جارٍ التأكيد..." : "تأكيد الطلب"}
              </Button>
              <Button
                type="button"
                kind="outline"
                onClick={() => route(`https://wa.me/967${String(gasOrderModal.distributor.phone).replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أرغب في ${gasOrderModal.mode === "exchange" ? "تبديل" : "طلب"} ${gasQty} أسطوانة غاز منزلي (${gasDistrict}${gasAddress ? ` - ${gasAddress}` : ""}) عبر منصة يافع ون.`)}`)}
              >
                <MessageCircle /> واتساب
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {gasContactModal && (
        <Modal title={`التواصل مع ${gasContactModal.name}`} close={() => setGasContactModal(null)}>
          <div style={{ display: "grid", gap: "10px", marginTop: "8px" }}>
            <Button kind="primary" onClick={() => route(`tel:${gasContactModal.phone}`)}>
              <Phone /> اتصال هاتفي مباشر ({gasContactModal.phone})
            </Button>
            <Button
              kind="gold"
              onClick={() => route(`https://wa.me/967${String(gasContactModal.phone).replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أتواصل معكم بخصوص الغاز المنزلي عبر تطبيق يافع ون (${gasContactModal.name})`)}`)}
            >
              <MessageCircle /> مراسلة عبر واتساب
            </Button>
          </div>
        </Modal>
      )}
    </VisitorShell>
  );
}

function SearchPage() {
  const searchStr = typeof window !== "undefined" ? window.location.search : "";
  const urlParams = new URLSearchParams(searchStr);
  const initialQ = urlParams.get("q") || "";
  const initialDistrict = urlParams.get("district") || "الكل";

  const [queryText, setQueryText] = useState(initialQ);
  const [districtFilter, setDistrictFilter] = useState(initialDistrict || "الكل");
  const [catFilter, setCatFilter] = useState("الكل");
  const [sortPriceAsc, setSortPriceAsc] = useState<boolean | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQueryText(p.get("q") || "");
    const d = p.get("district");
    if (d) setDistrictFilter(d);
  }, [searchStr]);

  const appImages = useAppImages();
  const s1 = resolveSlotPrimaryImage(appImages, "product_sample_1", market);
  const s2 = resolveSlotPrimaryImage(appImages, "product_sample_2", storeImage);
  const s3 = resolveSlotPrimaryImage(appImages, "product_sample_3", carImage);
  const defaultProdImg = resolveSlotPrimaryImage(appImages, "product_default_image", market);

  const allItems = useMemo(() => {
    const base = [
      { id: 1, name: "عسل يافع الطبيعي", category: "منتجات غذائية", district: "لبعوس", numericPrice: 3500, price: "3,500 ر.ي", image: s1 },
      { id: 2, name: "قهوة يافع الأصيلة", category: "منتجات غذائية", district: "لبعوس", numericPrice: 4800, price: "4,800 ر.ي", image: s2 },
      { id: 3, name: "هاتف ذكي", category: "إلكترونيات", district: "الحد", numericPrice: 425000, price: "425,000 ر.ي", image: s3 },
      { id: 4, name: "منتجات محلية", category: "منتجات غذائية", district: "رصد", numericPrice: 12000, price: "12,000 ر.ي", image: defaultProdImg },
      ...loadOwnerProducts().filter((p) => p.status === "منشور").map((op) => ({
        id: op.id,
        name: op.name,
        category: op.mainCategory || "منتجات",
        district: "لبعوس",
        numericPrice: Number(op.price) || 0,
        price: `${op.price.toLocaleString()} ${op.currency}`,
        image: op.images[0] || defaultProdImg,
      })),
    ];
    let filtered = base.filter((it) => {
      const qOk = !queryText.trim() || it.name.toLowerCase().includes(queryText.toLowerCase()) || it.category.toLowerCase().includes(queryText.toLowerCase());
      const dOk = districtFilter === "الكل" || districtFilter === "يافع" || it.district === districtFilter;
      const cOk = catFilter === "الكل" || it.category === catFilter;
      return qOk && dOk && cOk;
    });
    if (sortPriceAsc !== null) {
      filtered = [...filtered].sort((a, b) => sortPriceAsc ? a.numericPrice - b.numericPrice : b.numericPrice - a.numericPrice);
    }
    return filtered;
  }, [queryText, districtFilter, catFilter, sortPriceAsc, s1, s2, s3, defaultProdImg]);

  return <VisitorShell>
    <ScenicHero slotId="visitor_utility_banner" title="البحث والتصفية" subtitle={`النتائج عن: ${queryText || "كل السوق"} · ${districtFilter}`} />
    <SearchBar />
    <div className="filter-row">
      <Button kind={catFilter !== "الكل" ? "gold" : "outline"} onClick={() => setCatFilter((c) => c === "الكل" ? "منتجات غذائية" : c === "منتجات غذائية" ? "إلكترونيات" : "الكل")}>الفئة: {catFilter}</Button>
      <Button kind={sortPriceAsc !== null ? "gold" : "outline"} onClick={() => setSortPriceAsc((v) => v === null ? true : v ? false : null)}>السعر: {sortPriceAsc === null ? "افتراضي" : sortPriceAsc ? "الأقل" : "الأعلى"}</Button>
      <Button kind={districtFilter !== "الكل" ? "gold" : "outline"} onClick={() => setDistrictFilter((d) => d === "الكل" ? "لبعوس" : "الكل")}>المديرية: {districtFilter}</Button>
    </div>
    {allItems.length ? <div className="product-grid">{allItems.map((p) => <article className="product-card" key={String(p.id)}><img src={p.image} alt={p.name} loading="lazy" /><h3>{p.name}</h3><strong>{p.price}</strong><Button kind="gold" onClick={() => route(`/visitor/product/${p.id}`)}>التفاصيل</Button></article>)}</div> : <Empty title="لا توجد نتائج مطابقة للبحث" action={() => { setQueryText(""); setCatFilter("الكل"); setDistrictFilter("الكل"); }} />}
  </VisitorShell>;
}

function UsedMarketplace({ create = false }: { create?: boolean }) {
  const [preview, setPreview] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("إلكترونيات");
  const [price, setPrice] = useState("");
  const [district, setDistrict] = useState("لبعوس");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [cloudUsedAds, setCloudUsedAds] = useState<any[]>([]);
  const banners = useActivityBanners();
  const appImages = useAppImages();
  const usedBannerImg = resolveSlotPrimaryImage(appImages, "used_market_banner", banners.used || "/assets/activity-banners/used.jpg");
  const usedDefaultItemImg = resolveSlotPrimaryImage(appImages, "used_default_item", market);

  useEffect(() => {
    getDocs(query(collection(db, "usedAds"), where("approved", "==", true)))
      .then((snap) => setCloudUsedAds(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  if (create) {
    const handleCreateUsed = async (e: FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !price || Number(price) <= 0 || !description.trim() || !phone.trim()) {
        return toastMessage("أكمل جميع الحقول المطلوبة ورقم التواصل وسعر الإعلان");
      }
      setSubmitting(true);
      try {
        let imageUrl = usedDefaultItemImg;
        if (imageFile) {
          const uploaded = await uploadImageWithFallback(imageFile, `used/used_${Date.now()}_${imageFile.name}`);
          imageUrl = uploaded.url;
        }
        const adId = `USD-${Date.now().toString().slice(-5)}`;
        const newAd = {
          id: adId,
          title: title.trim(),
          category,
          price: Number(price),
          district,
          phone: phone.trim(),
          description: description.trim(),
          image: imageUrl,
          approved: false,
          status: "قيد المراجعة",
          date: new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date()),
        };

        if (auth.currentUser) {
          await setDoc(doc(db, "usedAds", adId), {
            ...newAd,
            ownerId: auth.currentUser.uid,
            sellerId: auth.currentUser.uid,
            createdAt: new Date().toISOString(),
          }).catch((err) => logFirestoreError(err, OperationType.CREATE, `usedAds/${adId}`));
        }

        const adminUsed = loadAdminSectionData("used");
        saveAdminSectionData("used", [
          {
            id: adId,
            title: newAd.title,
            detail: `${district} · السعر: ${Number(price).toLocaleString()} ر.ي · ${category}`,
            status: "قيد المراجعة",
            date: newAd.date,
            extra: newAd,
          },
          ...adminUsed,
        ]);

        toastMessage("تم إرسال إعلانك للمراجعة الإدارية بنجاح");
        route("/visitor/used");
      } catch (err: any) {
        toastMessage(err?.message || "تعذر إرسال الإعلان");
      } finally {
        setSubmitting(false);
      }
    };

    return <VisitorShell><TopBar back="/visitor/used" /><ScenicHero title="أضف إعلاناً مستعملاً" subtitle="يُرسل مباشرة لمراجعة الإدارة ثم يظهر للجميع في حراج يافع" image={usedBannerImg} activity />
      <form className="panel form-panel" onSubmit={handleCreateUsed}>
        <label>عنوان الإعلان *<input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: هاتف مستعمل بحالة ممتازة" /></label>
        <div className="form-grid">
          <label>الفئة<select value={category} onChange={(e) => setCategory(e.target.value)}><option>إلكترونيات</option><option>أثاث</option><option>سيارات</option><option>أخرى</option></select></label>
          <label>السعر بالريال اليمني *<input type="number" min="1" required value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        </div>
        <div className="form-grid">
          <label>المديرية<select value={district} onChange={(e) => setDistrict(e.target.value)}>{yafaDistricts.map((d) => <option key={d}>{d}</option>)}</select></label>
          <label>رقم التواصل *<input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77xxxxxxx" /></label>
        </div>
        <label>الوصف *<textarea required value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="upload"><Upload /><b>إضافة صور</b><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setImageFile(file); setPreview(URL.createObjectURL(file)); } }} /></label>
        {preview && <img className="upload-preview" src={preview} alt="معاينة صورة الإعلان" />}
        <Button type="submit" disabled={submitting}><Check /> {submitting ? "جارٍ الإرسال..." : "إرسال للمراجعة"}</Button>
      </form>
    </VisitorShell>;
  }

  const localUsed = loadAdminSectionData("used")
    .filter((item) => item.status === "نشط" || item.status === "معتمدة")
    .map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      price: item.extra?.price ? `${Number(item.extra.price).toLocaleString()} ر.ي` : "حسب الاتفاق",
      image: item.extra?.image || usedDefaultItemImg,
      phone: item.extra?.phone && item.extra.phone !== "770000000" ? item.extra.phone : "",
      district: item.extra?.district || "يافع",
      description: item.extra?.description || item.detail,
    }));

  const mergedUsed = [
    ...cloudUsedAds.map((c) => ({
      id: c.id,
      title: c.title,
      detail: `${c.district || "يافع"} · ${c.category || "مستعمل"}`,
      price: `${Number(c.price || 0).toLocaleString()} ر.ي`,
      image: c.image || usedDefaultItemImg,
      phone: c.phone && c.phone !== "770000000" ? c.phone : "",
      district: c.district || "يافع",
      description: c.description || "",
    })),
    ...localUsed,
  ].filter((ad) => !searchTerm.trim() || ad.title.toLowerCase().includes(searchTerm.toLowerCase()) || ad.detail.toLowerCase().includes(searchTerm.toLowerCase()));

  return <VisitorShell>
    <ScenicHero title="السوق المستعمل" subtitle="بيع واشترِ المستعمل داخل يافع فقط" icon={<Package />} image={usedBannerImg} activity />
    <Button onClick={() => route("/visitor/used/new")}><Plus /> إنشاء إعلان</Button>
    <div className="search-row"><Search /><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="ابحث في حراج المستعمل..." /></div>
    <div className="product-grid">
      {mergedUsed.map((ad) => (
        <article className="product-card" key={ad.id}>
          <img src={ad.image} alt={ad.title} onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = usedDefaultItemImg; }} />
          <span className="badge">مستعمل · {ad.district}</span>
          <h3>{ad.title}</h3>
          <strong>{ad.price}</strong>
          <Button kind="gold" onClick={() => setSelectedAd(ad)}>التفاصيل</Button>
        </article>
      ))}
    </div>
    {selectedAd && <Modal title={selectedAd.title} close={() => setSelectedAd(null)}>
      <div style={{ display: "grid", gap: "10px" }}>
        <img src={selectedAd.image} alt={selectedAd.title} style={{ width: "100%", height: "180px", objectFit: "cover", borderRadius: "10px" }} />
        <p style={{ margin: 0, color: "#444" }}>{selectedAd.description || selectedAd.detail}</p>
        <div><b>السعر:</b> <span style={{ color: "#064b3d", fontWeight: 700 }}>{selectedAd.price}</span> · <b>المديرية:</b> {selectedAd.district}</div>
        <div style={{ display: "flex", gap: "8px" }}>
          {selectedAd.phone && <Button kind="gold" onClick={() => route(`https://wa.me/967${String(selectedAd.phone).replace(/^0+/, "")}?text=${encodeURIComponent(`السلام عليكم، أستفسر عن إعلان حراج المستعمل في يافع ون: ${selectedAd.title}`)}`)}><MessageCircle /> تواصل واتساب</Button>}
          {selectedAd.phone && <Button kind="outline" onClick={() => route(`tel:${selectedAd.phone}`)}>اتصال</Button>}
        </div>
      </div>
    </Modal>}
  </VisitorShell>;
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="stat">{icon}<span>{label}</span><strong>{value}</strong><small>مؤشر فعلي</small></div>;
}

const ownerNav = [
  ["الرئيسية", "/owner/dashboard", Home],
  ["المنتجات", "/owner/products", Package],
  ["الطلبات", "/owner/orders", ClipboardList],
  ["المحادثات", "/owner/chats", MessageCircle],
  ["التقارير", "/owner/reports", BarChart3],
  ["المنشأة", "/owner/setup", Settings],
] as const;
function OwnerBottom() {
  const [currentPath, setCurrentPath] = useState("");
  useEffect(() => {
    setCurrentPath(window.location.pathname);
    const onRoute = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onRoute);
    return () => window.removeEventListener("popstate", onRoute);
  }, []);
  return <nav className="mobile-nav owner-bottom">{ownerNav.map(([n, p, Icon]) => <button className={currentPath === p ? "active" : ""} key={p} onClick={() => route(p)}><Icon /><span>{n}</span></button>)}<button className={currentPath === "/owner/share" ? "active" : ""} onClick={() => route("/owner/share")}><Share2 /><span>مشاركة</span></button></nav>;
}
function OwnerShell({ children, setRole }: { children: React.ReactNode; setRole: (r: Role) => void }) {
  const handleLogout = async () => {
    await clearServerAndFirebaseSession();
    setRole(null);
    safeStorage.removeItem("yafa-role");
    safeStorage.removeItem("yafa-owner-est-id");
    if (typeof document !== "undefined") {
      document.cookie = "yafa-role=; path=/; max-age=0; SameSite=Lax";
    }
    toastMessage("تم تسجيل الخروج بنجاح من بوابة المنشأة");
    route("/entry");
  };
  return <div className="app-shell owner-shell">
    <TopBar back="/owner/dashboard" portal="owner" />
    <main className="page-content">{children}</main>
    <button className="logout-fab" onClick={handleLogout} title="تسجيل الخروج من المنشأة والعودة لمدخل البوابات"><LogOut /> خروج</button>
    <OwnerBottom />
  </div>;
}

function getOwnerOrdersList(): any[] {
  try {
    const estId = safeStorage.getItem("yafa-owner-est-id") || "";
    const raw = JSON.parse(safeStorage.getItem("yafa-orders") || "[]") as any[];
    if (!estId) return raw;
    return raw.filter((o) => !o.establishmentId || String(o.establishmentId) === String(estId) || String(o.establishmentId) === "1");
  } catch {
    return [];
  }
}

function OwnerDashboard({ setRole }: { setRole: (r: Role) => void }) {
  const [hydrated, setHydrated] = useState(false);
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [period, setPeriod] = useState("30");
  const [ownerEstName, setOwnerEstName] = useState("متجري الحالي في يافع");
  const [estApproved, setEstApproved] = useState<boolean | null>(null);

  useEffect(() => {
    setHydrated(true);
    const refresh = () => {
      setProducts(loadOwnerProducts());
      setOrders(getOwnerOrdersList());
      setOwnerEstName(safeStorage.getItem("yafa-draft-est-name") || "متجري الحالي في يافع");
    };
    refresh();
    window.addEventListener("yafa-owner-products", refresh);
    window.addEventListener("storage", refresh);

    const loadOwnerCloudData = async () => {
      let estId = safeStorage.getItem("yafa-owner-est-id") || "";
      if (auth.currentUser) {
        try {
          const estSnap = estId
            ? await getDoc(doc(db, "establishments", estId))
            : null;
          if (estSnap && estSnap.exists()) {
            const d = estSnap.data() as any;
            setEstApproved(d.approved === true);
            if (d.name) setOwnerEstName(d.name);
          } else {
            const qSnap = await getDocs(query(collection(db, "establishments"), where("ownerId", "==", auth.currentUser.uid)));
            if (!qSnap.empty) {
              const first = qSnap.docs[0];
              const d = first.data() as any;
              estId = first.id;
              safeStorage.setItem("yafa-owner-est-id", estId);
              if (d.name) {
                safeStorage.setItem("yafa-draft-est-name", d.name);
                setOwnerEstName(d.name);
              }
              setEstApproved(d.approved === true);
            }
          }
        } catch {}
      }

      if (estId) {
        getDocs(query(collection(db, "orders"), where("establishmentId", "==", estId)))
          .then((snap) => {
            if (!snap.empty) {
              const cloudOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
              setOrders((prev) => {
                const map = new Map(prev.map((o) => [String(o.id), o]));
                cloudOrders.forEach((o) => map.set(String(o.id), o));
                return Array.from(map.values());
              });
            }
          })
          .catch(() => {});
      }
    };

    loadOwnerCloudData();

    return () => {
      window.removeEventListener("yafa-owner-products", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const periodDays = Number(period) || 30;
  const cutoff = hydrated ? Date.now() - periodDays * 86400000 : 0;
  const periodOrders = orders.filter((o) => {
    if (!hydrated || (!o.date && !o.createdAt)) return true;
    const t = new Date(o.createdAt || o.date).getTime();
    return Number.isNaN(t) || t >= cutoff;
  });
  const totalSales = periodOrders.filter((o) => o.status !== "ملغي" && o.status !== "cancelled").reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const published = products.filter((product) => product.status === "منشور").length;

  return (
    <OwnerShell setRole={setRole}>
      <ScenicHero slotId="owner_dashboard_banner" title="لوحة صاحب المنشأة" subtitle="إدارة متجرك ومنتجاتك وأقسامك وطلباتك في مكان واحد" />
      <div className="owner-filters">
        <label>الفترة
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="7">آخر 7 أيام</option>
            <option value="30">آخر 30 يومًا</option>
            <option value="90">آخر 90 يومًا</option>
          </select>
        </label>
        <label>المنشأة
          <select><option>{ownerEstName}</option></select>
        </label>
      </div>

      {estApproved === false && (
        <div className="alert">
          <AlertTriangle /> منشأتك حالياً «قيد المراجعة من الإدارة». يمكنك تجهيز بياناتك ومنتجاتك وستظهر للزوار فور الاعتماد.
        </div>
      )}
      {estApproved === true && (
        <div className="alert success">
          <Check /> منشأتك معتمدة ونشطة للزوار في يافع ون · عمولة المنصة 0%.
        </div>
      )}

      <div className="alert">
        <LockKeyhole /> جميع المؤشرات تخص حساب المنشأة الحالي فقط. لا تظهر بيانات منشآت أخرى أو أرقام الإدارة العامة.
      </div>

      <div className="owner-stats owner-stats-3">
        <article>
          <Package />
          <span>إجمالي منتجاتي</span>
          <strong>{products.length}</strong>
          <small>{published} منشور</small>
        </article>
        <article>
          <ClipboardList />
          <span>طلبات متجري</span>
          <strong>{periodOrders.length}</strong>
          <small>{periodOrders.filter((o) => o.status === "قيد الانتظار" || o.status === "pending").length} قيد الانتظار</small>
        </article>
        <article>
          <CircleDollarSign />
          <span>مبيعات متجري</span>
          <strong>{totalSales.toLocaleString()} ر.ي</strong>
          <small>عمولة المنصة 0%</small>
        </article>
      </div>

      <section className="panel">
        <SectionTitle title="إدارة المتجر السريعة" />
        <div className="quick-grid">
          <Button onClick={() => route("/owner/product/new")}><Plus /> إضافة منتج</Button>
          <Button kind="outline" onClick={() => route("/owner/products")}><Package /> إدارة المنتجات</Button>
          <Button kind="outline" onClick={() => route("/owner/orders")}><ClipboardList /> إدارة الطلبات</Button>
          <Button kind="outline" onClick={() => route("/owner/chats")}><MessageCircle /> محادثات العملاء</Button>
          <Button kind="outline" onClick={() => route("/owner/sections")}><Menu /> إدارة الأقسام</Button>
          <Button kind="outline" onClick={() => route("/owner/setup")}><Store /> بيانات المنشأة</Button>
          <Button kind="outline" onClick={() => route("/owner/reports")}><BarChart3 /> التقارير والأداء</Button>
          <Button kind="outline" onClick={() => route("/owner/share")}><Share2 /> مشاركة المتجر</Button>
          <Button kind="gold" onClick={() => route("/owner/preview")}><Eye /> معاينة متجري</Button>
        </div>
      </section>

      <section className="panel owner-chart-panel">
        <div className="panel-heading">
          <div><BarChart3 /><h2>ملخص الطلبات والمخزون</h2></div>
          <span>آخر {period} يومًا</span>
        </div>
        {periodOrders.length ? (
          <div className="fake-chart">
            {[...Array(6)].map((_, idx) => {
              const c = periodOrders.filter((__, i) => i % 6 === idx).length;
              return <i key={idx} style={{ height: `${Math.max(18, Math.min(100, c * 30 + 20))}%` }} />;
            })}
          </div>
        ) : (
          <div className="owner-empty-chart">
            <BarChart3 />
            <p>لا توجد طلبات مسجلة خلال هذه الفترة بعد.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h2>أحدث طلبات متجري</h2>
          <Button kind="outline" onClick={() => route("/owner/orders")}>إدارة الطلبات</Button>
        </div>
        {orders.length ? (
          <div style={{ display: "grid", gap: "8px" }}>
            {orders.slice(0, 4).map((o) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#f8faf9", borderRadius: "10px", border: "1px solid #e5ece8" }}>
                <div>
                  <b>طلب #{o.id}</b>
                  <div style={{ fontSize: "12px", color: "#666" }}>{o.customerName || "زائر"} · {o.date}</div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <b>{Number(o.total || 0).toLocaleString()} ر.ي</b>
                  <div><span className="status">{o.status}</span></div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty compact-empty">
            <ClipboardList />
            <h3>لا توجد طلبات بعد</h3>
            <p>ستظهر هنا طلبات الزوار فور إنشائها من المتجر.</p>
          </div>
        )}
      </section>
    </OwnerShell>
  );
}

function OwnerProducts({ setRole }: { setRole: (r: Role) => void }) {
  const [items, setItems] = useState<OwnerProduct[]>([]);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"الكل" | "منشور" | "مسودة" | "نفد المخزون">("الكل");

  useEffect(() => {
    setItems(loadOwnerProducts());
    const loadFromCloud = async () => {
      let estId = safeStorage.getItem("yafa-owner-est-id");
      if (!estId && auth.currentUser) {
        try {
          const estSnap = await getDocs(query(collection(db, "establishments"), where("ownerId", "==", auth.currentUser.uid)));
          if (!estSnap.empty) {
            estId = estSnap.docs[0].id;
            safeStorage.setItem("yafa-owner-est-id", estId);
          }
        } catch {}
      }
      if (!estId) return;
      getDocs(query(collection(db, "products"), where("establishmentId", "==", estId)))
        .then((snap) => {
          if (!snap.empty) {
            const cloudItems: OwnerProduct[] = snap.docs.map((d) => {
              const data = d.data() as any;
              return {
                id: Number(d.id) || Number(data.id) || Date.now(),
                name: data.name || "منتج",
                mainCategory: data.mainCategory || "منتجات غذائية",
                subCategory: data.subCategory || "منتجات محلية",
                description: data.description || "",
                price: Number(data.price || 0),
                currency: data.currency || "YER",
                stock: Number(data.stock || 0),
                status: data.status || (data.active ? "منشور" : "مسودة"),
                images: Array.isArray(data.images) ? data.images : [],
              };
            });
            setItems((prev) => {
              const map = new Map(prev.map((p) => [p.id, p]));
              cloudItems.forEach((p) => map.set(p.id, p));
              const merged = Array.from(map.values());
              saveOwnerProducts(merged);
              return merged;
            });
          }
        })
        .catch(() => {});
    };
    loadFromCloud();
  }, []);

  const visible = items.filter((item) => item.name.includes(searchQuery) && (filter === "الكل" ? true : filter === "نفد المخزون" ? item.stock === 0 : item.status === filter));
  const remove = async (id: number) => {
    const next = items.filter((item) => item.id !== id);
    if (!saveOwnerProducts(next)) return toastMessage("تعذر تحديث البيانات");
    setItems(next);
    setDeleteId(null);
    if (auth.currentUser) {
      await deleteDoc(doc(db, "products", String(id))).catch((err) => logFirestoreError(err, OperationType.DELETE, `products/${id}`));
    }
    toastMessage("تم حذف المنتج بنجاح");
  };
  return <OwnerShell setRole={setRole}><ScenicHero slotId="owner_dashboard_banner" title="إدارة منتجات المنشأة" subtitle="أضف المنتجات وغيّر الصور والأسعار وتأكد من المخزون" /><div className="owner-stats owner-product-stats"><article><Package /><span>إجمالي المنتجات</span><strong>{items.length}</strong></article><article><Check /><span>المنشورة</span><strong>{items.filter((item) => item.status === "منشور").length}</strong></article><article><FileText /><span>المسودات</span><strong>{items.filter((item) => item.status === "مسودة").length}</strong></article><article><AlertTriangle /><span>نفد المخزون</span><strong>{items.filter((item) => item.stock === 0).length}</strong></article></div><Button className="owner-add-product" onClick={() => route("/owner/product/new")}><Plus /> إضافة منتج جديد</Button><div className="search-row"><Search /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ابحث عن منتج بالاسم" /></div><div className="owner-filter-tabs">{(["الكل", "منشور", "مسودة", "نفد المخزون"] as const).map((name) => <button className={filter === name ? "active" : ""} key={name} onClick={() => setFilter(name)}>{name}</button>)}</div>{visible.length ? visible.map((item) => <div className="product-row owner-product-row" key={item.id}>{item.images[0] ? <img className="owner-product-thumb" src={item.images[0]} alt="" /> : <div className="thumb"><Package /></div>}<div><h3>{item.name}</h3><p>{item.price.toLocaleString()} {item.currency} · مخزون {item.stock}</p><span className={`status ${item.stock === 0 ? "out" : ""}`}>{item.stock === 0 ? "نفد المخزون" : item.status}</span></div><div className="row-actions"><button aria-label="تعديل" onClick={() => route(`/owner/product/new?edit=${item.id}`)}><Pencil /></button><button aria-label="حذف" onClick={() => setDeleteId(item.id)}><Trash2 /></button></div></div>) : <Empty title={items.length ? "لا توجد نتائج مطابقة" : "لا توجد منتجات بعد"} action={() => items.length ? setFilter("الكل") : route("/owner/product/new")} />}{deleteId && <Modal title="تأكيد حذف المنتج" close={() => setDeleteId(null)}><p>سيُحذف المنتج نهائياً من متجرك. لا يمكن التراجع بعد التأكيد.</p><Button kind="danger" onClick={() => remove(deleteId)}>تأكيد الحذف</Button></Modal>}</OwnerShell>;
}

function ProductForm({ setRole }: { setRole: (r: Role) => void }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [mainCategory, setMainCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<"YER" | "SAR" | "USD">("YER");
  const [stock, setStock] = useState("1");
  const [status, setStatus] = useState<"منشور" | "مسودة">("منشور");
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [estId, setEstId] = useState("est-local");

  useEffect(() => {
    const idParam = Number(new URLSearchParams(window.location.search).get("edit"));
    const storedEstId = safeStorage.getItem("yafa-owner-est-id") || "est-local";
    setEstId(storedEstId);
    if (idParam) {
      const existing = loadOwnerProducts().find((product) => product.id === idParam);
      if (existing) {
        setEditingId(existing.id);
        setName(existing.name);
        setMainCategory(existing.mainCategory);
        setSubCategory(existing.subCategory);
        setDescription(existing.description);
        setPrice(String(existing.price));
        setCurrency(existing.currency);
        setStock(String(existing.stock));
        setStatus(existing.status);
        setImages(existing.images);
      }
    }
  }, []);

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    if (images.length + files.length > 6) return setImageError("يمكن إضافة 6 صور كحد أقصى للمنتج.");
    setProcessing(true); setImageError("");
    try {
      const uploaded = await Promise.all(
        files.map(async (f, idx) => {
          const res = await uploadImageWithFallback(f, `establishments/${estId}/products/${Date.now()}_${idx}_${f.name}`);
          return res.url;
        })
      );
      setImages((prev) => [...prev, ...uploaded]);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "فشل رفع أو تجهيز الصور");
    } finally {
      setProcessing(false);
      event.target.value = "";
    }
  };
  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images]; [next[index], next[target]] = [next[target], next[index]]; setImages(next);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !mainCategory || !subCategory || !description.trim() || !price || Number(price) <= 0) {
      return toastMessage("تحقق من الحقول المطلوبة والسعر الصحيح");
    }
    if (!images.length) return setImageError("أضف صورة واحدة على الأقل.");
    setSaving(true);
    try {
      let targetEstId = estId;
      if (targetEstId === "est-local" && auth.currentUser) {
        try {
          const snap = await getDocs(query(collection(db, "establishments"), where("ownerId", "==", auth.currentUser.uid)));
          if (!snap.empty) {
            targetEstId = snap.docs[0].id;
            setEstId(targetEstId);
            safeStorage.setItem("yafa-owner-est-id", targetEstId);
          }
        } catch {}
      }

      const all = loadOwnerProducts();
      const prodId = editingId || Date.now();
      const product: OwnerProduct = { id: prodId, name: name.trim(), mainCategory, subCategory, description: description.trim(), price: Number(price), currency, stock: Math.max(0, Number(stock)), status, images };
      const stored = saveOwnerProducts(editingId ? all.map((item) => item.id === editingId ? product : item) : [product, ...all]);
      if (!stored) {
        setSaving(false);
        return setImageError("مساحة التخزين لا تكفي. احذف بعض الصور أو استخدم صوراً أصغر.");
      }

      if (auth.currentUser && targetEstId !== "est-local") {
        const docPayload: Record<string, any> = {
          id: String(prodId),
          establishmentId: targetEstId,
          ownerId: auth.currentUser.uid,
          name: product.name,
          mainCategory: product.mainCategory,
          subCategory: product.subCategory,
          category: product.mainCategory,
          description: product.description,
          price: product.price,
          currency: product.currency,
          stock: product.stock,
          inStock: product.stock > 0,
          status: product.status,
          active: product.status === "منشور",
          images: product.images,
          updatedAt: new Date().toISOString(),
        };
        if (!editingId) {
          docPayload.approved = false;
          docPayload.createdAt = new Date().toISOString();
        }
        await setDoc(doc(db, "products", String(prodId)), docPayload, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, `products/${prodId}`));
      }

      setSaved(true);
      toastMessage(editingId ? "تم تحديث الصنف وحفظه بنجاح" : "تم حفظ الصنف وإرساله لمتجرك بنجاح");
      window.setTimeout(() => route("/owner/products"), 550);
    } finally {
      setSaving(false);
    }
  };
  return <OwnerShell setRole={setRole}><button className="owner-inline-back" onClick={() => route("/owner/products")}><ChevronLeft /> العودة إلى المنتجات</button><ScenicHero slotId="owner_dashboard_banner" title={editingId ? "تعديل الصنف" : "إضافة الأصناف"} subtitle="أضف منتجاتك بسهولة إلى متجرك في يافع ون" /><form className="panel form-panel owner-product-form" onSubmit={submit}>
    {saved && <div className="alert success"><Check /> تم الحفظ بنجاح ومزامنة بيانات الصنف.</div>}
    <label>اسم الصنف *<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عسل يافع الطبيعي" /></label>
    <div className="form-grid"><label>التصنيف الرئيسي *<select value={mainCategory} onChange={(event) => setMainCategory(event.target.value)}><option value="">اختر التصنيف</option><option>منتجات غذائية</option><option>ملابس ومنسوجات</option><option>إلكترونيات</option><option>حرف يدوية</option><option>مواد بناء</option><option>خدمات</option></select></label><label>التصنيف الفرعي *<select value={subCategory} onChange={(event) => setSubCategory(event.target.value)}><option value="">اختر التصنيف الفرعي</option><option>منتجات محلية</option><option>عسل وقهوة</option><option>أجهزة وملحقات</option><option>أخرى</option></select></label></div>
    <label>الوصف *<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="اكتب وصفاً مفصلاً عن المنتج" /></label>
    <div className="form-grid"><label>السعر *<input type="number" min="0" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></label><label>العملة<select value={currency} onChange={(event) => setCurrency(event.target.value as "YER" | "SAR" | "USD")}><option value="YER">ريال يمني YER</option><option value="SAR">ريال سعودي SAR</option><option value="USD">دولار USD</option></select></label></div>
    <div className="form-grid"><label>الكمية المتوفرة<input type="number" min="0" value={stock} onChange={(event) => setStock(event.target.value)} /></label><label>الحالة<select value={status} onChange={(event) => setStatus(event.target.value as "منشور" | "مسودة")}><option>منشور</option><option>مسودة</option></select></label></div>
    <label className="upload"><Upload /><b>{processing ? "جارٍ رفع وتجهيز الصور..." : "إضافة عدة صور"}</b><span>JPG أو PNG أو WebP · حتى 6 صور</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={pick} disabled={processing || saving} /></label>
    {imageError && <div className="alert error"><AlertTriangle />{imageError}</div>}
    {images.length > 0 && <div className="owner-image-grid">{images.map((image, index) => <figure key={`${image.slice(-20)}-${index}`}><img src={image} alt={`صورة المنتج ${index + 1}`} /><figcaption>{index === 0 ? "الصورة الرئيسية" : `صورة ${index + 1}`}</figcaption><div><button type="button" onClick={() => setImages(images.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button><button type="button" disabled={index === 0} onClick={() => moveImage(index, -1)}>يمين</button><button type="button" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)}>يسار</button></div></figure>)}</div>}
    <Button type="submit" disabled={processing || saving}><Check /> {saving ? "جارٍ الحفظ..." : editingId ? "حفظ التعديلات" : "حفظ الصنف"}</Button>
  </form></OwnerShell>;
}

function OwnerSetup({ setRole }: { setRole: (r: Role) => void }) {
  const [profile, setProfile] = useState({
    name: "",
    phone: "",
    district: "لبعوس",
    address: "",
    description: "",
    logo: "",
    coverImage: "",
    gallery: [] as string[],
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingField, setUploadingField] = useState<"logo" | "cover" | "gallery" | "">("");

  useEffect(() => {
    try {
      const parsed = JSON.parse(safeStorage.getItem("yafa-owner-profile") || "null");
      if (parsed) {
        setProfile({
          name: parsed.name || safeStorage.getItem("yafa-draft-est-name") || "",
          phone: parsed.phone && parsed.phone !== "770000000" ? parsed.phone : (safeStorage.getItem("yafa-owner-phone") || ""),
          district: parsed.district || "لبعوس",
          address: parsed.address || "",
          description: parsed.description || "",
          logo: parsed.logo || "",
          coverImage: parsed.coverImage || "",
          gallery: Array.isArray(parsed.gallery) ? parsed.gallery : [],
        });
      } else {
        setProfile((prev) => ({
          ...prev,
          name: safeStorage.getItem("yafa-draft-est-name") || "",
          phone: safeStorage.getItem("yafa-owner-phone") || "",
        }));
      }
    } catch {}

    const syncEstablishment = async () => {
      let estId = safeStorage.getItem("yafa-owner-est-id");
      if (!estId && auth.currentUser) {
        try {
          const snapQ = await getDocs(query(collection(db, "establishments"), where("ownerId", "==", auth.currentUser.uid)));
          if (!snapQ.empty) {
            estId = snapQ.docs[0].id;
            safeStorage.setItem("yafa-owner-est-id", estId);
          }
        } catch {}
      }
      if (!estId) return;
      getDoc(doc(db, "establishments", estId))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data() as any;
            setProfile((prev) => ({
              ...prev,
              name: data.name || prev.name,
              phone: (data.phone && data.phone !== "770000000" ? data.phone : prev.phone),
              district: data.district || prev.district,
              address: data.address || prev.address,
              description: data.description || prev.description,
              logo: data.logo || data.logoUrl || prev.logo,
              coverImage: data.coverImage || prev.coverImage,
              gallery: Array.isArray(data.gallery) ? data.gallery : prev.gallery || [],
            }));
          }
        })
        .catch(() => {});
    };
    syncEstablishment();
  }, []);

  const pickLogo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const estId = safeStorage.getItem("yafa-owner-est-id") || "est-local";
    setUploadingField("logo");
    try {
      const uploaded = await uploadImageWithFallback(file, `establishments/${estId}/logo_${Date.now()}.webp`);
      setProfile((p) => ({ ...p, logo: uploaded.url }));
      toastMessage("تم تحديث شعار المنشأة — اضغط حفظ لاعتماد التعديل");
    } catch (err: any) {
      toastMessage(err?.message || "تعذر رفع الشعار");
    } finally {
      setUploadingField("");
    }
  };

  const pickCover = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const estId = safeStorage.getItem("yafa-owner-est-id") || "est-local";
    setUploadingField("cover");
    try {
      const uploaded = await uploadImageWithFallback(file, `establishments/${estId}/cover_${Date.now()}.webp`);
      setProfile((p) => ({ ...p, coverImage: uploaded.url }));
      toastMessage("تم تحديث صورة غلاف متجرك — اضغط حفظ لاعتماد التعديل");
    } catch (err: any) {
      toastMessage(err?.message || "تعذر رفع صورة الغلاف");
    } finally {
      setUploadingField("");
    }
  };

  const pickGallery = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 6);
    if (!files.length) return;
    const estId = safeStorage.getItem("yafa-owner-est-id") || "est-local";
    setUploadingField("gallery");
    try {
      const urls: string[] = [];
      for (const file of files) {
        const uploaded = await uploadImageWithFallback(file, `establishments/${estId}/gallery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.webp`);
        urls.push(uploaded.url);
      }
      setProfile((p) => ({
        ...p,
        gallery: [...(Array.isArray(p.gallery) ? p.gallery : []), ...urls].slice(0, 10),
      }));
      toastMessage(`تمت إضافة ${urls.length} صورة لمتجرك — اضغط حفظ لاعتماد التعديل`);
    } catch (err: any) {
      toastMessage(err?.message || "تعذر رفع الصور الداخلية");
    } finally {
      setUploadingField("");
    }
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim()) return toastMessage("اسم المنشأة مطلوب");
    setSavingProfile(true);
    try {
      safeStorage.setItem("yafa-owner-profile", JSON.stringify(profile));
      safeStorage.setItem("yafa-draft-est-name", profile.name.trim());
      let estId = safeStorage.getItem("yafa-owner-est-id");
      if (auth.currentUser) {
        if (!estId) {
          estId = `EST-${Date.now().toString().slice(-5)}`;
          safeStorage.setItem("yafa-owner-est-id", estId);
          await setDoc(doc(db, "establishments", estId), {
            id: estId,
            ownerId: auth.currentUser.uid,
            name: profile.name.trim(),
            phone: profile.phone,
            district: profile.district,
            category: "متجر تجاري",
            address: profile.address,
            description: profile.description,
            logo: profile.logo,
            logoUrl: profile.logo,
            coverImage: profile.coverImage || "",
            gallery: Array.isArray(profile.gallery) ? profile.gallery : [],
            approved: false,
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }).catch((err) => logFirestoreError(err, OperationType.WRITE, `establishments/${estId}`));
        } else {
          await setDoc(doc(db, "establishments", estId), {
            name: profile.name.trim(),
            phone: profile.phone,
            district: profile.district,
            address: profile.address,
            description: profile.description,
            logo: profile.logo,
            logoUrl: profile.logo,
            coverImage: profile.coverImage || "",
            gallery: Array.isArray(profile.gallery) ? profile.gallery : [],
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, `establishments/${estId}`));
        }
      }
      toastMessage("تم حفظ بيانات وصور المنشأة بنجاح");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <OwnerShell setRole={setRole}>
      <ScenicHero slotId="owner_dashboard_banner" title="إدارة بيانات المنشأة" subtitle="تحديث معلومات المتجر والشعار والغلاف والصور الداخلية لمتجرك فقط" />
      <form className="panel form-panel" onSubmit={saveProfile} style={{ marginBottom: "14px" }}>
        <h2 style={{ marginTop: 0 }}>البيانات الأساسية وصور المنشأة</h2>
        <label>اسم المنشأة *<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required /></label>
        <div className="form-grid">
          <label>رقم الهاتف / واتساب<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="77xxxxxxx" /></label>
          <label>المديرية<select value={profile.district} onChange={(e) => setProfile({ ...profile, district: e.target.value })}>{yafaDistricts.map((d) => <option key={d}>{d}</option>)}</select></label>
        </div>
        <label>العنوان التفصيلي<input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="الشارع العام..." /></label>
        <label>نبذة عن المتجر<textarea value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></label>

        <div className="form-grid">
          <div>
            <label className="upload"><Upload /><b>{uploadingField === "logo" ? "جارٍ رفع الشعار..." : "تحديث شعار المتجر"}</b><input type="file" accept="image/*" onChange={pickLogo} disabled={Boolean(uploadingField)} /></label>
            {profile.logo && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                <img src={profile.logo} alt="شعار المتجر" style={{ width: "72px", height: "72px", borderRadius: "12px", objectFit: "cover", border: "1px solid var(--line)" }} />
                <Button type="button" kind="outline" onClick={() => setProfile((p) => ({ ...p, logo: "" }))}><Trash2 /> إزالة</Button>
              </div>
            )}
          </div>
          <div>
            <label className="upload"><Upload /><b>{uploadingField === "cover" ? "جارٍ رفع الغلاف..." : "تحديث صورة غلاف المتجر"}</b><input type="file" accept="image/*" onChange={pickCover} disabled={Boolean(uploadingField)} /></label>
            {profile.coverImage && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                <img src={profile.coverImage} alt="غلاف المتجر" style={{ width: "120px", height: "72px", borderRadius: "12px", objectFit: "cover", border: "1px solid var(--line)" }} />
                <Button type="button" kind="outline" onClick={() => setProfile((p) => ({ ...p, coverImage: "" }))}><Trash2 /> إزالة</Button>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="upload"><Upload /><b>{uploadingField === "gallery" ? "جارٍ رفع الصور..." : "إضافة صور داخلية للمتجر (حتى 10 صور)"}</b><input type="file" multiple accept="image/*" onChange={pickGallery} disabled={Boolean(uploadingField)} /></label>
          {Array.isArray(profile.gallery) && profile.gallery.length > 0 && (
            <div className="owner-image-grid" style={{ marginTop: "8px" }}>
              {profile.gallery.map((gUrl: string, idx: number) => (
                <figure key={`${idx}-${gUrl.slice(-14)}`}>
                  <img src={gUrl} alt={`صورة داخلية ${idx + 1}`} />
                  <figcaption>صورة {idx + 1}</figcaption>
                  <div>
                    <button type="button" onClick={() => setProfile((p) => ({ ...p, gallery: p.gallery.filter((_: string, i: number) => i !== idx) }))}><Trash2 /></button>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="quick-grid">
          <Button type="submit" kind="gold" disabled={savingProfile || Boolean(uploadingField)}><Check /> {savingProfile ? "جارٍ الحفظ..." : "حفظ بيانات المنشأة"}</Button>
          <Button type="button" kind="outline" onClick={() => route("/owner/preview")}><Eye /> معاينة متجري</Button>
        </div>
      </form>
    </OwnerShell>
  );
}

function OwnerSections({ setRole }: { setRole: (r: Role) => void }) {
  const defaults = ["البنرات", "الأقسام", "المنتجات المميزة", "أحدث المنتجات", "معلومات المتجر"];
  const [sections, setSections] = useState<string[]>(defaults);
  const [newSection, setNewSection] = useState("");
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(safeStorage.getItem(ownerSectionsStorageKey) || "null");
      if (Array.isArray(saved) && saved.length) setSections(saved);
    } catch {}
  }, []);

  const drop = (e: DragEvent, index: number) => { e.preventDefault(); if (drag === null) return; const next = [...sections]; const [item] = next.splice(drag, 1); next.splice(index, 0, item); setSections(next); setDrag(null); };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections]; [next[index], next[target]] = [next[target], next[index]]; setSections(next);
  };
  const addCustomSection = (e: FormEvent) => {
    e.preventDefault();
    if (!newSection.trim()) return;
    if (sections.includes(newSection.trim())) return toastMessage("هذا القسم موجود مسبقاً");
    const next = [...sections, newSection.trim()];
    setSections(next);
    setNewSection("");
    toastMessage("تمت إضافة القسم، اضغط حفظ الترتيب لاعتماده");
  };
  const removeSection = (name: string) => {
    if (sections.length <= 1) return toastMessage("يجب الإبقاء على قسم واحد على الأقل");
    setSections(sections.filter((s) => s !== name));
  };
  const save = async () => {
    safeStorage.setItem(ownerSectionsStorageKey, JSON.stringify(sections));
    const estId = safeStorage.getItem("yafa-owner-est-id");
    if (estId && auth.currentUser) {
      await setDoc(doc(db, "establishments", estId), { sections, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    }
    toastMessage("تم حفظ ترتيب وأقسام المتجر بنجاح");
  };
  return <OwnerShell setRole={setRole}><ScenicHero slotId="owner_dashboard_banner" title="ترتيب المتجر والأقسام" subtitle="اسحب مكونات متجرك أو أضف أقساماً خاصة ثم احفظ" /><div className="panel owner-sections-panel"><Button kind="outline" onClick={() => route("/owner/preview")}><Eye /> معاينة المتجر</Button>
    <form onSubmit={addCustomSection} style={{ display: "flex", gap: "8px", margin: "10px 0" }}>
      <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="إضافة قسم جديد داخل متجرك..." style={{ flex: 1 }} />
      <Button type="submit" kind="gold"><Plus /> إضافة</Button>
    </form>
    {sections.map((section, index) => <div className="drag-row" draggable onDragStart={() => setDrag(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, index)} key={section}><Menu /><b>{index + 1}</b><span>{section}</span><div className="drag-actions"><button disabled={index === 0} onClick={() => move(index, -1)} aria-label="تحريك لأعلى">أعلى</button><button disabled={index === sections.length - 1} onClick={() => move(index, 1)} aria-label="تحريك لأسفل">أسفل</button><button onClick={() => removeSection(section)} aria-label="حذف القسم"><Trash2 /></button></div></div>)}<Button onClick={save}><Check /> حفظ الترتيب</Button></div></OwnerShell>;
}

function OwnerShare({ setRole }: { setRole: (r: Role) => void }) {
  const [origin, setOrigin] = useState("");
  const [estId, setEstId] = useState("1");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    setEstId(safeStorage.getItem("yafa-owner-est-id") || "1");
  }, []);
  const publicLink = `${origin}/visitor/store/${estId}`;
  const storeCode = `YAFA-${String(estId).replace(/[^A-Za-z0-9]/g, "").slice(-6).toUpperCase() || "STORE1"}`;
  const copy = async () => { await shareOrCopy("متجري في يافع ون", "تصفح متجري في منصة يافع ون", publicLink); };
  const copyCode = async () => { await shareOrCopy("كود المتجر", `كود متجري في يافع ون: ${storeCode}`, storeCode); };
  const whatsapp = () => route(`https://wa.me/?text=${encodeURIComponent(`تصفح متجري في يافع ون: ${publicLink} (كود المتجر: ${storeCode})`)}`);
  return <OwnerShell setRole={setRole}><ScenicHero slotId="owner_dashboard_banner" title="مشاركة المتجر وكود الدخول" subtitle="شارك رابط متجرك العام وكود الدخول السريع مع عملائك" /><section className="panel owner-share-card"><h2>رابط المتجر المباشر</h2><div className="copy-field"><code>{publicLink}</code><Button onClick={copy}>نسخ الرابط</Button></div><div className="share-actions"><Button kind="outline" onClick={whatsapp}><MessageCircle /> واتساب</Button><Button kind="outline" onClick={copy}><Share2 /> تطبيقات أخرى</Button><Button kind="outline" onClick={() => route("/owner/preview")}><Eye /> معاينة</Button></div></section><section className="panel access-code"><KeyRound /><h2>كود الدخول السريع للمتجر</h2><strong>{storeCode}</strong><p>يمكن للعملاء استخدام هذا الكود للوصول المباشر لمتجرك في يافع ون.</p><Button kind="gold" onClick={copyCode}>نسخ الكود</Button></section></OwnerShell>;
}

function OwnerOrders({ setRole }: { setRole: (r: Role) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState("الكل");
  const [estId, setEstId] = useState("");

  useEffect(() => {
    setOrders(getOwnerOrdersList());
    const storedId = safeStorage.getItem("yafa-owner-est-id") || "";
    setEstId(storedId);
    if (!storedId) return;
    getDocs(query(collection(db, "orders"), where("establishmentId", "==", storedId)))
      .then((snap) => {
        if (!snap.empty) {
          const cloudOrders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setOrders((prev) => {
            const map = new Map(prev.map((o) => [String(o.id), o]));
            cloudOrders.forEach((o) => map.set(String(o.id), o));
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  const updateOrderStatus = async (orderId: string, nextStatus: string) => {
    let allLocal: any[] = [];
    try { allLocal = JSON.parse(safeStorage.getItem("yafa-orders") || "[]"); } catch {}
    const updatedAll = allLocal.map((o) => String(o.id) === String(orderId) ? { ...o, status: nextStatus } : o);
    safeStorage.setItem("yafa-orders", JSON.stringify(updatedAll));
    setOrders((prev) => prev.map((o) => String(o.id) === String(orderId) ? { ...o, status: nextStatus } : o));

    const adminOrders = loadAdminSectionData("orders").map((it) => it.id === orderId ? { ...it, status: nextStatus === "مكتمل" ? "نشط" : nextStatus === "ملغي" ? "متوقف" : "قيد المراجعة" as AdminRecordItem["status"] } : it);
    saveAdminSectionData("orders", adminOrders);

    if (auth.currentUser) {
      await setDoc(doc(db, "orders", String(orderId)), { status: nextStatus, updatedAt: new Date().toISOString() }, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, `orders/${orderId}`));
    }
    toastMessage(`تم تحديث حالة الطلب #${orderId} إلى "${nextStatus}"`);
  };

  const visible = orders.filter((o) => filter === "الكل" || o.status === filter);

  return <OwnerShell setRole={setRole}><ScenicHero slotId="owner_dashboard_banner" title="طلبات متجري" subtitle="تتبع طلبات منشأتك وتحديث حالاتها للعملاء" />
    <div className="owner-filter-tabs" style={{ marginBottom: "12px" }}>
      {["الكل", "قيد الانتظار", "قيد التجهيز", "جاري التوصيل", "مكتمل", "ملغي"].map((st) => (
        <button key={st} className={filter === st ? "active" : ""} onClick={() => setFilter(st)}>{st}</button>
      ))}
    </div>
    <section className="panel">{visible.length ? <div style={{ display: "grid", gap: "12px" }}>{visible.map((o) => (
      <article key={o.id} style={{ padding: "14px", borderRadius: "14px", border: "1px solid #e5ece8", background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <b>طلب #{o.id}</b>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "3px" }}>العميل: {o.customerName || "زائر"} {o.customerPhone ? `· ${o.customerPhone}` : ""}</div>
            {o.address && <div style={{ fontSize: "12px", color: "#666" }}>العنوان: {o.address} · الدفع: {o.paymentMethod || "نقدي"}</div>}
            <div style={{ fontSize: "11px", color: "#888" }}>{o.date} · {o.itemsCount || 1} أصناف</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <strong style={{ color: "var(--forest)", fontSize: "15px" }}>{Number(o.total || 0).toLocaleString()} ر.ي</strong>
            <div style={{ marginTop: "4px" }}><span className="status">{o.status}</span></div>
          </div>
        </div>
        {o.status !== "مكتمل" && o.status !== "ملغي" && o.status !== "completed" && o.status !== "cancelled" && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #f0f2f1" }}>
            {(o.status === "قيد الانتظار" || o.status === "pending") && <Button kind="gold" onClick={() => updateOrderStatus(o.id, "قيد التجهيز")}>تأكيد وتجهيز</Button>}
            {(o.status === "قيد الانتظار" || o.status === "قيد التجهيز" || o.status === "pending") && <Button kind="outline" onClick={() => updateOrderStatus(o.id, "جاري التوصيل")}>تحويل للتوصيل</Button>}
            <Button kind="outline" onClick={() => updateOrderStatus(o.id, "مكتمل")}>إكمال التسليم</Button>
            <Button kind="danger" onClick={() => updateOrderStatus(o.id, "ملغي")}>إلغاء</Button>
          </div>
        )}
      </article>
    ))}</div> : <div className="empty"><ClipboardList /><h3>لا توجد طلبات مطابقة</h3><p>ستظهر طلبات الزوار لمتجرك هنا فور إتمام الشراء.</p></div>}</section>
  </OwnerShell>;
}


function OwnerReports({ setRole }: { setRole: (r: Role) => void }) {
  const [currency, setCurrency] = useState<"YER" | "SAR" | "USD">("YER");
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [rates, setRates] = useState<ExchangeRateData>(DEFAULT_EXCHANGE_RATES);

  useEffect(() => {
    setProducts(loadOwnerProducts());
    setOrders(getOwnerOrdersList());
    setRates(loadExchangeRates());
  }, []);

  const convertAmount = (yerAmount: number) => {
    if (currency === "SAR") return Math.round((yerAmount / Math.max(1, rates.rates.SAR.sell)) * 100) / 100;
    if (currency === "USD") return Math.round((yerAmount / Math.max(1, rates.rates.USD.sell)) * 100) / 100;
    return Math.round(yerAmount);
  };

  const rawInventoryYer = products.reduce((sum, p) => {
    const mult = p.currency === "SAR" ? rates.rates.SAR.sell : p.currency === "USD" ? rates.rates.USD.sell : 1;
    return sum + p.price * p.stock * mult;
  }, 0);
  const rawSalesYer = orders.filter((o) => o.status !== "ملغي" && o.status !== "cancelled").reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const displayInventory = convertAmount(rawInventoryYer);
  const displaySales = convertAmount(rawSalesYer);

  const exportRows = [
    ["#", "اسم المنتج", "السعر", "العملة", "المخزون", "الحالة"],
    ...products.map((p, idx) => [String(idx + 1), p.name, String(p.price), p.currency, String(p.stock), p.status]),
    ["—", "إجمالي الطلبات", String(orders.length), "طلب", "المبيعات", `${displaySales} ${currency}`],
  ];

  return <OwnerShell setRole={setRole}>
    <ScenicHero slotId="owner_dashboard_banner" title="تقارير متجري ومؤشرات الأداء" subtitle="تحليلات مبيعات ومخزون منشأتك الفعلية في يافع ون" />
    <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <Button kind="gold" onClick={() => downloadReport("pdf", exportRows, "تقرير متجري - يافع ون")}><Download /> تصدير / طباعة PDF</Button>
        <Button kind="outline" onClick={() => downloadReport("excel", exportRows, "yafa-owner-report")}><FileSpreadsheet /> تصدير Excel</Button>
      </div>
      <select value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
        <option value="YER">الريال اليمني YER</option>
        <option value="SAR">الريال السعودي SAR</option>
        <option value="USD">الدولار الأمريكي USD</option>
      </select>
    </div>
    <div className="owner-stats">
      <article><CircleDollarSign /><span>قيمة المخزون التقديرية</span><strong>{displayInventory.toLocaleString()} {currency}</strong></article>
      <article><Package /><span>الأصناف المسجلة</span><strong>{products.length}</strong><small>{products.filter(p => p.status === 'منشور').length} منشور</small></article>
      <article><CircleDollarSign /><span>إجمالي المبيعات</span><strong>{displaySales.toLocaleString()} {currency}</strong><small>عمولة 0%</small></article>
      <article><ClipboardList /><span>الطلبات المستلمة</span><strong>{orders.length}</strong><small>{orders.filter(o => o.status === "مكتمل" || o.status === "completed").length} مكتمل</small></article>
    </div>
    <section className="panel">
      <div className="panel-heading">
        <div><BarChart3 /><h2>أداء الأصناف في المتجر</h2></div>
      </div>
      {products.length ? (
        <div className="data-table">
          <div className="table-head">
            <b>#</b><b>اسم المنتج</b><b>السعر</b><b>المخزون</b><b>الحالة</b>
          </div>
          {products.map((p, idx) => (
            <div className="table-row" key={p.id}>
              <span>{idx + 1}</span>
              <span>{p.name}</span>
              <span>{p.price.toLocaleString()} {p.currency}</span>
              <span>{p.stock}</span>
              <span className="status">{p.status}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty compact-empty"><Package /><h3>لا توجد أصناف مسجلة بعد</h3></div>
      )}
    </section>
  </OwnerShell>;
}

function OwnerChats({ setRole }: { setRole: (r: Role) => void }) {
  const [threads, setThreads] = useState<Array<{ docId: string; visitorName: string; storeId: string; storeName: string; messages: Array<{ id: string; sender: "visitor" | "store"; text: string; time: string }> }>>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const estId = safeStorage.getItem("yafa-owner-est-id") || "";
    const localThreads: typeof threads = [];
    try {
      const cached = JSON.parse(safeStorage.getItem("yafa-chats") || "[]") as ChatThread[];
      cached
        .filter((t) => !estId || String(t.storeId) === String(estId))
        .forEach((t) => localThreads.push({
          docId: t.id,
          visitorName: "عميل في يافع ون",
          storeId: t.storeId,
          storeName: t.storeName,
          messages: t.messages || [],
        }));
    } catch {}
    setThreads(localThreads);

    if (auth.currentUser) {
      getDocs(query(collection(db, "chats"), where("ownerId", "==", auth.currentUser.uid)))
        .then((snap) => {
          if (!snap.empty) {
            const cloud = snap.docs.map((d) => {
              const data = d.data() as any;
              return {
                docId: d.id,
                visitorName: data.visitorName || "عميل في يافع ون",
                storeId: String(data.storeId || data.establishmentId || estId),
                storeName: data.storeName || "متجري",
                messages: Array.isArray(data.messages) ? data.messages : [],
              };
            });
            setThreads(cloud);
          }
        })
        .catch(() => {});
    }
  }, []);

  const activeThread = threads.find((t) => t.docId === activeDocId) || null;

  const sendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeThread || !replyText.trim()) return;
    setSending(true);
    const msg = {
      id: `msg-${Date.now()}`,
      sender: "store" as const,
      text: replyText.trim(),
      time: new Intl.DateTimeFormat("ar-YE", { timeStyle: "short" }).format(new Date()),
    };
    const nextMessages = [...activeThread.messages, msg];
    setThreads((prev) => prev.map((t) => t.docId === activeThread.docId ? { ...t, messages: nextMessages } : t));
    setReplyText("");

    try {
      if (auth.currentUser) {
        await setDoc(doc(db, "chats", activeThread.docId), {
          messages: nextMessages,
          lastMessage: msg.text,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
      try {
        const localChats = JSON.parse(safeStorage.getItem("yafa-chats") || "[]") as ChatThread[];
        const updatedLocal = localChats.map((t) =>
          t.id === activeThread.docId || String(t.storeId) === String(activeThread.storeId)
            ? { ...t, messages: nextMessages }
            : t
        );
        safeStorage.setItem("yafa-chats", JSON.stringify(updatedLocal));
      } catch {}
    } finally {
      setSending(false);
    }
  };

  return (
    <OwnerShell setRole={setRole}>
      <ScenicHero slotId="owner_dashboard_banner" title="محادثات العملاء" subtitle="استقبل استفسارات وطلبات العملاء ورد عليها مباشرة" />
      {activeThread ? (
        <section className="panel" style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #eee", paddingBottom: "8px" }}>
            <button type="button" className="text-link" onClick={() => setActiveDocId(null)}>← كل المحادثات</button>
            <b>{activeThread.visitorName}</b>
          </div>
          <div style={{ display: "grid", gap: "8px", maxHeight: "340px", overflowY: "auto", padding: "4px" }}>
            {activeThread.messages.map((m) => (
              <div key={m.id} style={{
                justifySelf: m.sender === "store" ? "start" : "end",
                background: m.sender === "store" ? "#064b3d" : "#f1f5f9",
                color: m.sender === "store" ? "white" : "#0f172a",
                padding: "8px 12px",
                borderRadius: "12px",
                maxWidth: "80%",
                fontSize: "13px",
              }}>
                <div>{m.text}</div>
                <small style={{ opacity: 0.7, fontSize: "10px", display: "block", marginTop: "3px" }}>{m.time}</small>
              </div>
            ))}
          </div>
          <form onSubmit={sendReply} style={{ display: "flex", gap: "8px" }}>
            <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="اكتب ردك للعميل..." style={{ flex: 1 }} required />
            <Button type="submit" kind="gold" disabled={sending}>{sending ? "جارٍ الإرسال..." : "إرسال"}</Button>
          </form>
        </section>
      ) : (
        <section className="panel" style={{ display: "grid", gap: "10px" }}>
          {threads.length ? threads.map((t) => (
            <div key={t.docId} className="list-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <b>{t.visitorName}</b>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#666" }}>{t.messages[t.messages.length - 1]?.text || "رسالة جديدة"}</p>
              </div>
              <Button kind="gold" onClick={() => setActiveDocId(t.docId)}>فتح الرد</Button>
            </div>
          )) : (
            <div className="empty compact-empty">
              <MessageCircle />
              <h3>لا توجد محادثات عملاء بعد</h3>
              <p>عندما يتواصل الزوار مع متجرك ستظهر محادثاتهم هنا للرد المباشر.</p>
            </div>
          )}
        </section>
      )}
    </OwnerShell>
  );
}

function OwnerPreview() {
  const [products, setProducts] = useState<OwnerProduct[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [sections, setSections] = useState<string[]>([]);

  useEffect(() => {
    setProducts(loadOwnerProducts().filter((product) => product.status === "منشور"));
    try {
      setProfile(JSON.parse(safeStorage.getItem("yafa-owner-profile") || "null"));
    } catch {}
    try {
      setSections(JSON.parse(safeStorage.getItem(ownerSectionsStorageKey) || "[]"));
    } catch {}
  }, []);

  const storeTitle = profile?.name || "معاينة متجري";
  const storeSubtitle = profile?.district ? `يافع · ${profile.district}${profile.address ? ` — ${profile.address}` : ""}` : "هذه معاينة لمتجرك كما يظهر للزوار في يافع ون";

  return (
    <div className="owner-preview-page">
      <button className="preview-back" onClick={() => route("/owner/dashboard")}><ChevronLeft /> العودة لبوابة المالك</button>
      <TopBar back="/owner/dashboard" portal="owner" />
      <ScenicHero slotId="owner_dashboard_banner" title={storeTitle} subtitle={storeSubtitle} image={profile?.coverImage || undefined} />
      <main className="page-content">
        {profile?.description && <div className="panel" style={{ marginBottom: "12px" }}><p style={{ margin: 0 }}>{profile.description}</p></div>}
        {sections.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            {sections.map((s) => <span key={s} className="badge">{s}</span>)}
          </div>
        )}
        <SectionTitle title="منتجات المتجر" />
        {products.length ? (
          <div className="product-grid">
            {products.map((product) => (
              <article className="product-card" key={product.id}>
                {product.images[0] ? <img src={product.images[0]} alt={product.name} /> : <div className="thumb"><Package /></div>}
                <h3>{product.name}</h3>
                <strong>{product.price.toLocaleString()} {product.currency}</strong>
                <span className="status">{product.stock > 0 ? "متوفر" : "نفد المخزون"}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <Package />
            <h3>لا توجد منتجات منشورة</h3>
            <p>أضف منتجًا وانشره ليظهر في هذه المعاينة.</p>
            <Button onClick={() => route("/owner/product/new")}>إضافة منتج</Button>
          </div>
        )}
        <div className="prototype-note"><Eye /> وضع المعاينة السريعة لصاحب المنشأة.</div>
      </main>
    </div>
  );
}

function SignupFlow({ setRole }: { setRole: (r: Role) => void }) {
  const [ownerName, setOwnerName] = useState("");
  const [establishmentName, setEstablishmentName] = useState("");
  const [district, setDistrict] = useState("لبعوس");
  const [activity, setActivity] = useState("متجر تجاري");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  useEffect(() => {
    setOwnerName(safeStorage.getItem("yafa-draft-owner-name") || "");
    setEstablishmentName(safeStorage.getItem("yafa-draft-est-name") || "");
  }, []);

  const sendOwnerOtp = async () => {
    if (!phone.trim()) return setError("أدخل رقم الجوال اليمني أولاً.");
    setError("");
    setInfoMsg("");
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({ role: "owner", phone: phone.trim(), purpose: "register" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        return setError(json?.error || "تعذر إرسال رمز واتساب OTP.");
      }
      setOtpSent(true);
      setInfoMsg("تم إرسال رمز التحقق إلى رقم جوالك عبر واتساب.");
      toastMessage("تم إرسال رمز التحقق عبر واتساب");
    } catch {
      setError("تعذر الاتصال بخادم التحقق.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleSignupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ownerName.trim() || !establishmentName.trim() || !phone.trim() || password.length < 6 || !otp.trim()) {
      return setError("يرجى ملء جميع الحقول وإكمال التحقق برمز واتساب OTP.");
    }
    setError("");
    setInfoMsg("");
    setSubmitting(true);
    try {
      const regRes = await fetch("/api/auth/phone-register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
        body: JSON.stringify({
          role: "owner",
          name: ownerName.trim(),
          phone: phone.trim(),
          password,
          otp: otp.trim(),
        }),
      });
      const regJson = await regRes.json().catch(() => null);
      if (!regRes.ok || !regJson?.success) {
        throw new Error(regJson?.error || "تعذر إنشاء حساب صاحب المنشأة.");
      }

      const normalizedPhone = regJson.user?.phone || phone.trim();
      const fbUser = await syncFirebaseBridgeClient(regJson.fbBridgeEmail, regJson.fbBridgeSecret);
      const uid = fbUser?.uid || "";

      if (uid) {
        await setDoc(doc(db, "users", uid), {
          uid,
          name: ownerName.trim(),
          phoneNumber: normalizedPhone,
          role: "owner",
          status: "active",
          createdAt: new Date().toISOString(),
        }, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, `users/${uid}`));
      }

      const estTitle = establishmentName.trim() || "منشأة جديدة";
      const oName = ownerName.trim() || "صاحب المنشأة";
      const estId = `EST-${Date.now().toString().slice(-5)}`;

      const newEst: AdminRecordItem = {
        id: estId,
        title: estTitle,
        detail: `${district} · ${activity} · المالك: ${oName}`,
        status: "قيد المراجعة",
        date: new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date()),
      };

      const existing = loadAdminSectionData("establishments");
      saveAdminSectionData("establishments", [newEst, ...existing]);

      safeStorage.setItem("yafa-owner-est-id", estId);
      safeStorage.setItem("yafa-owner-phone", normalizedPhone);
      safeStorage.setItem("yafa-draft-owner-name", oName);
      safeStorage.setItem("yafa-draft-est-name", estTitle);
      safeStorage.setItem("yafa-owner-profile", JSON.stringify({
        id: estId,
        name: estTitle,
        ownerName: oName,
        district,
        activity,
        address: `يافع · ${district}`,
        description: estTitle,
        phone: normalizedPhone,
      }));

      if (auth.currentUser) {
        await setDoc(doc(db, "establishments", estId), {
          id: estId,
          name: estTitle,
          ownerId: auth.currentUser.uid,
          ownerName: oName,
          phone: normalizedPhone,
          category: activity,
          activity,
          district,
          address: `يافع · ${district}`,
          description: estTitle,
          approved: false,
          active: true,
          createdAt: new Date().toISOString(),
        }, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, `establishments/${estId}`));
      }

      setRole("owner");
      safeStorage.setItem("yafa-role", "owner");
      if (typeof document !== "undefined") {
        document.cookie = "yafa-role=owner; path=/; max-age=2592000; SameSite=Lax";
      }

      toastMessage("تم إنشاء حساب المنشأة بنجاح والانتقال للوحة التحكم");
      route("/owner/dashboard");
    } catch (err: any) {
      setError(err?.message || "تعذر إتمام التسجيل.");
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="auth-page">
    <TopBar back="/auth/owner-login" />
    <div className="auth-shell">
      <Brand />
      <h1>إنشاء حساب صاحب منشأة</h1>
      <p>تسجيل منشأتك في يافع مجاني 100% وبرقم الجوال وكلمة المرور</p>
      {error && <div className="alert error"><AlertTriangle />{error}</div>}
      {infoMsg && <div className="alert success"><Check />{infoMsg}</div>}
      <form onSubmit={handleSignupSubmit}>
        <label>اسم صاحب المنشأة *<input required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="مثال: صالح اليافعي" /></label>
        <label>اسم المنشأة أو المتجر *<input required value={establishmentName} onChange={(e) => setEstablishmentName(e.target.value)} placeholder="مثال: عسل يافع الطبيعي" /></label>
        <div className="form-grid">
          <label>المديرية *
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              {yafaDistricts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label>النشاط التجاري *
            <select value={activity} onChange={(e) => setActivity(e.target.value)}>
              <option value="متجر تجاري">متجر تجاري عام</option>
              {homeActivities.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <label>رقم الجوال *<input type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="77xxxxxxx أو 9677xxxxxxxx" /></label>
        <label>كلمة المرور (6 أحرف على الأقل) *<input type="password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></label>
        <Button type="button" kind="outline" disabled={otpLoading} onClick={sendOwnerOtp}>
          {otpLoading ? "جارٍ الإرسال..." : otpSent ? "إعادة إرسال رمز واتساب" : "إرسال رمز التحقق عبر واتساب"}
        </Button>
        {otpSent && (
          <label>رمز التحقق المرسل عبر واتساب (6 أرقام) *<input type="text" inputMode="numeric" maxLength={6} required value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" /></label>
        )}
        <Button type="submit" disabled={submitting || !otpSent}>{submitting ? "جارٍ التنفيذ..." : "إنشاء الحساب والدخول للوحة التحكم"}</Button>
      </form>
    </div>
  </main>;
}

// -------------------------------------------------------------
// Yafa One - General Administration Portal (بوابة الإدارة العامة)
// Reference UI: screen_f214a15d.png & WhatsApp_Image_2026-10-24_at_8.06.32_PM_1acf2ae4.jpeg
// -------------------------------------------------------------

export type AdminAuditEntry = {
  id: string;
  action: string;
  section: string;
  target: string;
  admin: string;
  timestamp: string;
};

export type AdminRecordItem = {
  id: string;
  title: string;
  detail: string;
  status: "نشط" | "قيد المراجعة" | "معلق" | "متوقف" | "معتمدة" | "مرفوضة";
  date: string;
  category?: string;
  extra?: Record<string, any>;
};

export type CityItem = {
  id: string;
  name: string;
  districts: string[];
  active: boolean;
  localManager: string;
  storesCount: number;
};

const initialCitiesList: CityItem[] = [
  {
    id: "yafa",
    name: "يافع",
    districts: ["لبعوس", "رصد", "الحد", "يهر", "المفلحي", "سرار", "سباح"],
    active: true,
    localManager: "ماجد التركي (المدير العام)",
    storesCount: 582,
  },
  {
    id: "aden",
    name: "عدن",
    districts: ["المنصورة", "الشيخ عثمان", "كريتر", "المعلا", "التواهي", "خور مكسر", "البريقة", "دار سعد"],
    active: false,
    localManager: "بانتظار التعيين",
    storesCount: 0,
  },
  {
    id: "hadhramout",
    name: "حضرموت",
    districts: ["المكلا", "سيئون", "تريم", "الشحر", "القطن"],
    active: false,
    localManager: "بانتظار التعيين",
    storesCount: 0,
  },
];

function loadAdminCities(): CityItem[] {
  try {
    const raw = safeStorage.getItem("yafa-admin-cities");
    return raw ? JSON.parse(raw) : initialCitiesList;
  } catch {
    return initialCitiesList;
  }
}

function saveAdminCities(cities: CityItem[]) {
  try {
    safeStorage.setItem("yafa-admin-cities", JSON.stringify(cities));
    if (typeof window !== "undefined") window.dispatchEvent(new Event("yafa-cities-changed"));
  } catch {}
}

function recordAdminAudit(action: string, section: string, target: string, admin = "ماجد التركي (Super Admin)") {
  void recordAdminAuditFirestore({ action, section, target, admin });
}

const defaultAdminSectionsData: Record<string, AdminRecordItem[]> = {
  establishments: [
    { id: "EST-101", title: "عسل يافع الطبيعي", detail: "لبعوس · منتجات غذائية وعسل", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "EST-102", title: "مطعم القمة السياحي", detail: "رصد · مأكولات ومقاهي", status: "قيد المراجعة", date: "23 أكتوبر 2026" },
    { id: "EST-103", title: "تقنية يافع للإلكترونيات", detail: "الحد · جوالات وأجهزة", status: "نشط", date: "22 أكتوبر 2026" },
    { id: "EST-104", title: "أناقة يافع للملابس", detail: "يهر · ملابس وأقمشة", status: "نشط", date: "20 أكتوبر 2026" },
    { id: "EST-105", title: "مواد بناء السعدي", detail: "المفلحي · مواد بناء وأدوات", status: "متوقف", date: "18 أكتوبر 2026" },
  ],
  users: [
    { id: "USR-01", title: "ماجد التركي", detail: "مدير عام النظام · Super Admin", status: "نشط", date: "دائم" },
    { id: "USR-02", title: "أحمد صالح اليافعي", detail: "owner@yafa.test · صاحب متجر", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "USR-03", title: "منى علي القعيطي", detail: "visitor@yafa.test · زائر معتمد", status: "نشط", date: "23 أكتوبر 2026" },
    { id: "USR-04", title: "خالد سالم النقيب", detail: "owner2@yafa.test · طلب منشأة جديد", status: "معلق", date: "21 أكتوبر 2026" },
    { id: "USR-05", title: "ياسر فضل المشوشي", detail: "staff@yafa.test · مشرف محتوى محلي", status: "نشط", date: "19 أكتوبر 2026" },
  ],
  categories: [
    { id: "CAT-01", title: "المطاعم والمقاهي", detail: "16 منشأة · ترتيب: 1", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "CAT-02", title: "التموينات والمواد الغذائية", detail: "32 منشأة · ترتيب: 2", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "CAT-03", title: "الملابس والأحذية", detail: "24 منشأة · ترتيب: 3", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "CAT-04", title: "الجوالات والإلكترونيات", detail: "18 منشأة · ترتيب: 4", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "CAT-05", title: "مواد البناء والألمنيوم", detail: "21 منشأة · ترتيب: 5", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "CAT-06", title: "السيارات والعقارات", detail: "45 إعلاناً · ترتيب: 6", status: "نشط", date: "24 أكتوبر 2026" },
  ],
  products: [
    { id: "PRD-201", title: "عسل سدر دوعني يافعي فاخر", detail: "عسل يافع · 12,000 ر.ي · مخزون 45", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "PRD-202", title: "بن يافعي قمة أصيل محمص", detail: "قهوة يافع · 6,500 ر.ي · مخزون 80", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "PRD-203", title: "هاتف ذكي بضمان سنة", detail: "تقنية يافع · 425,000 ر.ي · مخزون 12", status: "نشط", date: "23 أكتوبر 2026" },
    { id: "PRD-204", title: "طقم ألمنيوم دبل جلاس", detail: "ورشة الأمل · 85,000 ر.ي · مخزون 10", status: "نشط", date: "22 أكتوبر 2026" },
  ],
  orders: [
    { id: "ORD-1068", title: "طلب تموينات وسلة منزلية", detail: "متجر القمة · العميل: منى علي · 97,000 ر.ي", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "ORD-1067", title: "طلب عسل سدر ملكي", detail: "عسل يافع · العميل: عبد الرحمن · 24,000 ر.ي", status: "قيد المراجعة", date: "24 أكتوبر 2026" },
    { id: "ORD-1066", title: "طلب أجهزة وملحقات", detail: "تقنية يافع · العميل: طارق · 15,000 ر.ي", status: "متوقف", date: "23 أكتوبر 2026" },
  ],
  ads: [
    { id: "AD-01", title: "حملة موسم عسل السدر الطبيعي", detail: "الرئيسية · مدة 24 ساعة · بنر ذهبي", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "AD-02", title: "عروض البن اليافعي الفاخر", detail: "قسم الغذاء · مدة 7 أيام", status: "نشط", date: "23 أكتوبر 2026" },
    { id: "AD-03", title: "تخفيضات مواد البناء والدهانات", detail: "قسم مواد البناء · ينتهي قريباً", status: "متوقف", date: "21 أكتوبر 2026" },
  ],
  notifications: [
    { id: "NOTIF-01", title: "تحديث أسعار الصرف الرسمية", detail: "تم اعتماد أسعار سوق عدن: SAR 411/413, USD 1568/1579", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "NOTIF-02", title: "اعتماد 3 متاجر جديدة في لبعوس ورصد", detail: "تمت مراجعة المنشآت وتفعيل ظهورها للزوار", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "NOTIF-03", title: "تذكير: عمولة المنصة 0% لجميع الطلبات", detail: "إشعار عام لجميع أصحاب المنشآت في يافع ون", status: "نشط", date: "22 أكتوبر 2026" },
  ],
  payments: [
    { id: "PAY-01", title: "سياسة عمولة المنصة", detail: "النسبة: 0% · استقطاع: 0 ريال يمني", status: "نشط", date: "دائم" },
    { id: "PAY-02", title: "الدفع عند الاستلام (نقدي)", detail: "متاح لجميع المتاجر والطلبات في يافع", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "PAY-03", title: "التحويل المالي المباشر عبر الصرافة", detail: "الكريمي / النجم / العمقي / بنك القطيبي", status: "نشط", date: "24 أكتوبر 2026" },
  ],
  used: [
    { id: "USD-01", title: "هاتف آيفون 13 برو مستعمل نظيف", detail: "لبعوس · السعر: 290,000 ر.ي · معتمد", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "USD-02", title: "طقم كنب مجلس عربي فاخر", detail: "رصد · السعر: 180,000 ر.ي · قيد الفحص", status: "قيد المراجعة", date: "24 أكتوبر 2026" },
    { id: "USD-03", title: "ماكينة لحام كهربائية مستعملة", detail: "الحد · السعر: 50,000 ر.ي · معتمد", status: "نشط", date: "23 أكتوبر 2026" },
  ],
  vehicles: [
    { id: "VEH-01", title: "تويوتا لاندكروزر شاص 2022", detail: "معرض يافع للسيارات · وارد بازرعة · نظيف", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "VEH-02", title: "أرض سكنية تجارية على الشارع العام", detail: "لبعوس · مساحة 6 قصب · بصيرة شرعية", status: "نشط", date: "23 أكتوبر 2026" },
    { id: "VEH-03", title: "هايلوكس غمارتين دبل 2020", detail: "معرض رصد · فحص كامل", status: "نشط", date: "22 أكتوبر 2026" },
  ],
  referrals: [
    { id: "REF-01", title: "مكافأة إحالة متجر عسل يافع", detail: "المستفيد: صالح اليافعي · 1,000 ر.ي مستحقة", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "REF-02", title: "مكافأة إحالة ورشة الأمل", detail: "المستفيد: عمر فضل · قيد المراجعة والتحقق", status: "قيد المراجعة", date: "23 أكتوبر 2026" },
  ],
  roles: [
    { id: "ROL-01", title: "مدير عام النظام (Super Admin)", detail: "ماجد التركي · جميع الصلاحيات التشغيلية والخادم", status: "نشط", date: "دائم" },
    { id: "ROL-02", title: "مدير فرع / مدينة محلي", detail: "إدارة منشآت وطلبات مدينة معينة", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "ROL-03", title: "مشرف مراجعة الإعلانات والمحتوى", detail: "مراجعة المنشورات والشكاوى", status: "نشط", date: "24 أكتوبر 2026" },
  ],
  complaints: [
    { id: "CMP-01", title: "استفسار بخصوص توقيت التوصيل في لبعوس", detail: "العميل: منى علي · تم الرد والتنسيق مع المتجر", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "CMP-02", title: "بلاغ عن خطأ في رقم هاتف منشأة", detail: "المتجر: تقنية الحد · جاري التحديث", status: "قيد المراجعة", date: "23 أكتوبر 2026" },
  ],
  backup: [
    { id: "BKP-01", title: "نسخة سحابية تلقائية كاملة", detail: "قواعد البيانات وسجلات التدقيق وملفات النظام", status: "نشط", date: "اليوم 04:00 ص" },
    { id: "BKP-02", title: "تصدير محلي لبيانات المنشآت والأسعار", detail: "ملف مشفر بصيغة JSON/CSV", status: "نشط", date: "أمس 11:30 م" },
  ],
  settings: [
    { id: "SET-01", title: "نسبة عمولة المنصة", detail: "0% (صفر ريال يمني) · لا استقطاع على المبيعات", status: "نشط", date: "دائم" },
    { id: "SET-02", title: "المدينة التشغيلية الحالية", detail: "يافع (مفعلة) · جاهزية التوسع لعدن وحضرموت", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "SET-03", title: "مرجعية أسعار الصرف", detail: "سوق عدن المالي الرسمي (جنوب اليمن)", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "SET-04", title: "حالة تسجيل المنشآت والمستخدمين", detail: "مفتوح ومتاح للجميع مع مراجعة الإدارة", status: "نشط", date: "24 أكتوبر 2026" },
  ],
  stores: [
    { id: "STR-01", title: "سوق القمة للمواد الغذائية والتموينات", detail: "لبعوس · تموينات ومواد غذائية واستهلاكية", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "STR-02", title: "متجر يافع للتقنية والجوالات", detail: "رصد · جوالات وإلكترونيات وصيانة", status: "نشط", date: "23 أكتوبر 2026" },
    { id: "STR-03", title: "معرض الأناقة للملابس والأقمشة اليافعية", detail: "الحد · أزياء رجالية ونسائية وأقمشة", status: "نشط", date: "22 أكتوبر 2026" },
    { id: "STR-04", title: "ورشة الأمل للألمنيوم والزجاج", detail: "يهر · أبواب ونوافذ وواجهات", status: "نشط", date: "20 أكتوبر 2026" },
    { id: "STR-05", title: "صيدلية يافع النموذجية", detail: "المفلحي · أدوية ومستلزمات طبية", status: "نشط", date: "19 أكتوبر 2026" },
  ],
  media: [
    { id: "MED-01", title: "شعار وهوية يافع ون الرسمية", detail: "أصول الشعار عالية النقاء (PNG/SVG) للتطبيق", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "MED-02", title: "بنرات عروض موسم قطاف البن اليافعي", detail: "بنر رئيسي 16:9 مخصص للحملات والصفحة الرئيسية", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "MED-03", title: "خلفيات الأنشطة التجارية لمديريات يافع", detail: "صور عالية الجودة لكافة أقسام السوق", status: "نشط", date: "23 أكتوبر 2026" },
  ],
  settlements: [
    { id: "SETTL-01", title: "تسوية مبيعات متجر عسل يافع (عمولة 0%)", detail: "إجمالي المبيعات: 185,000 ر.ي · عمولة المنصة: 0 ر.ي", status: "نشط", date: "24 أكتوبر 2026" },
    { id: "SETTL-02", title: "تسوية متجر القمة السياحي (عمولة 0%)", detail: "إجمالي المبيعات: 112,000 ر.ي · عمولة المنصة: 0 ر.ي", status: "نشط", date: "23 أكتوبر 2026" },
  ],
};

function loadAdminSectionData(section: string): AdminRecordItem[] {
  if (section === "audit") {
    try {
      const rawLogs = safeStorage.getItem("yafa-audit-logs");
      const logs: AdminAuditEntry[] = rawLogs ? JSON.parse(rawLogs) : [];
      return logs.map((l) => ({
        id: l.id,
        title: `${l.action} — ${l.section}`,
        detail: `${l.target} · بواسطة: ${l.admin}`,
        status: "نشط",
        date: l.timestamp ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(l.timestamp)) : "الآن",
      }));
    } catch { return []; }
  }
  try {
    const raw = safeStorage.getItem(`yafa-admin-data-${section}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  if (section === "analytics") return defaultAdminSectionsData.reports || [];
  if (section === "promotions") return defaultAdminSectionsData.ads || [];
  return defaultAdminSectionsData[section] || [];
}

function saveAdminSectionData(section: string, items: AdminRecordItem[]) {
  try {
    safeStorage.setItem(`yafa-admin-data-${section}`, JSON.stringify(items));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(`yafa-admin-data-${section}`));
  } catch {}
}

const adminMeta: Record<string, [string, string]> = {
  dashboard: ["الإدارة العامة", "لوحة تحكم شاملة لإدارة المنصة"],
  establishments: ["إدارة المنشآت والمتاجر", "مراجعة المنشآت والموافقة عليها وإدارة بياناتها وفروعها"],
  users: ["إدارة المستخدمين والحسابات", "البحث والتصفية وإدارة حالات حسابات العملاء وأصحاب المنشآت"],
  cities: ["إدارة المدن والمناطق", "نظام إدارة التوسع للمحافظات والمديريات وتعيين المديرين المحليين"],
  categories: ["إدارة الأقسام والأنشطة", "تنظيم الأنشطة وترتيبها وتفعيلها والصور الخاصة بها"],
  stores: ["إدارة المتاجر والفئات التجارية", "دليل المتاجر وتصنيف الأنشطة وحالات التوثيق في يافع"],
  products: ["إدارة المنتجات والأسعار", "إدارة قوائم السلع والأسعار والمخزون وحالات النشر"],
  orders: ["إدارة الطلبات وحالاتها", "متابعة الطلبات وحالات التنفيذ والتسليم والعمولة"],
  ads: ["إدارة الإعلانات والبنرات", "الإعلانات المدفوعة وإعلانات 24 ساعة وتثبيت المتاجر"],
  "exchange-rates": ["إدارة أسعار الصرف", "نشر أسعار موثقة لسوق عدن المالي مع المصدر ووقت التحديث"],
  payments: ["إدارة طرق الدفع والعمولة", "عمولة المنصة 0 ريال (0%) وبوابات الدفع والتسويات"],
  used: ["إدارة حراج المستعمل", "مراجعة إعلانات المستعمل والتأكد من ملاءمتها واعتمادها"],
  vehicles: ["إدارة السيارات والعقارات", "إعلانات معارض السيارات والأراضي والعقارات في يافع"],
  notifications: ["إدارة الإشعارات", "إنشاء الإشعارات وجدولتها ومراجعة سجل الإرسال"],
  referrals: ["برنامج شارك واربح", "متابعة الإحالات المؤهلة وصرف المكافآت المعتمدة"],
  reports: ["التقارير والإحصائيات", "مؤشرات الأداء الفعلية والعمليات المالية والتصدير"],
  analytics: ["الإحصائيات والتحليلات", "مؤشرات الأداء الحية لمنصة يافع ون"],
  promotions: ["العروض والبونصات", "إدارة الحملات الترويجية والعروض الخاصة"],
  roles: ["الموظفون والصلاحيات", "تحديد صلاحيات العرض والإضافة والتعديل والحذف والتصدير"],
  complaints: ["إدارة الشكاوى والبلاغات", "متابعة بلاغات المستخدمين والمتاجر ومعالجتها فوراً"],
  backup: ["النسخ الاحتياطي والأمان", "تصدير نسخ احتياطية لقاعدة البيانات وسجلات التدقيق والحماية"],
  audit: ["سجل التدقيق والأمان", "متابعة جميع العمليات الإدارية المسجلة في النظام"],
  settings: ["إعدادات التطبيق العامة", "العمولة 0%، العملات المعتمدة، سياسات التوسع ونطاق الخدمة"],
  carousel: ["إدارة الإعلانات المتحركة", "تحرير الصور الست وترتيبها وجدولة ظهورها للزوار"],
  media: ["مكتبة صور المنصة", "رفع الصور والبنرات وترتيبها ونشرها وإيقافها"],
  "activity-images": ["صور الأنشطة التجارية", "تغيير صورة كل نشاط في الصفحة الرئيسية للزائر"],
  "app-images": ["إدارة صور التطبيق", "إضافة وتعديل وحذف وقص وتحسين وترتيب جميع صور صفحات التطبيق من مكان واحد"],
  professionals: ["إدارة أصحاب المهن", "مراجعة طلبات الحرفيين والمهنيين واعتمادها ونشرها للزوار"],
  settlements: ["التسويات والتتبع المالي", "متابعة المبيعات وعمولة المنصة 0%"],
  appearance: ["إدارة المظهر والمحتوى الحي", "تخصيص الألوان والسمات، الشعار، البنرات، وترتيب أقسام التطبيق دون إعادة بناء"],
};

function AdminBottomNav({ setRole }: { setRole?: (r: Role) => void }) {
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
  const handleAdminLogout = async () => {
    await clearServerAndFirebaseSession();
    if (setRole) setRole(null);
    safeStorage.removeItem("yafa-role");
    if (typeof document !== "undefined") {
      document.cookie = "yafa-role=; path=/; max-age=0; SameSite=Lax";
    }
    toastMessage("تم تسجيل الخروج بنجاح من بوابة الإدارة");
    route("/entry");
  };

  return (
    <nav className="absolute bottom-0 inset-x-0 bg-[#072b20] text-white/70 py-2 px-3 border-t border-[#0c3829]/30 rounded-t-[26px] shadow-2xl z-50 flex items-center justify-around select-none">
      <button
        type="button"
        className={`flex flex-col items-center justify-center gap-1 flex-1 text-center ${currentPath === "/admin/dashboard" ? "text-[#eedab0]" : "text-white/70 hover:text-white"}`}
        onClick={() => route("/admin/dashboard")}
      >
        <Home className="w-4 h-4" />
        <span className="text-[10px] font-semibold">الرئيسية</span>
      </button>

      <button
        type="button"
        className={`flex flex-col items-center justify-center gap-1 flex-1 text-center ${currentPath === "/admin/establishments" ? "text-[#eedab0]" : "text-white/70 hover:text-white"}`}
        onClick={() => route("/admin/establishments")}
      >
        <Store className="w-4 h-4" />
        <span className="text-[10px] font-semibold">المنشآت</span>
      </button>

      <button
        type="button"
        className="flex flex-col items-center flex-1"
        onClick={() => route("/admin/dashboard")}
      >
        <div className="bg-[#eedab0] text-[#0e3b2b] w-16 py-1.5 rounded-2xl flex flex-col items-center justify-center shadow-md">
          <Grid2X2 className="w-4 h-4 text-[#0e3b2b]" />
          <span className="text-[10.5px] font-black text-[#0e3b2b] mt-0.5">الإدارة العامة</span>
        </div>
      </button>

      <button
        type="button"
        className={`flex flex-col items-center justify-center gap-1 flex-1 text-center ${currentPath === "/admin/reports" ? "text-[#eedab0]" : "text-white/70 hover:text-white"}`}
        onClick={() => route("/admin/reports")}
      >
        <BarChart3 className="w-4 h-4" />
        <span className="text-[10px] font-semibold">التقارير</span>
      </button>

      <button
        type="button"
        className="flex flex-col items-center justify-center gap-1 text-rose-300 hover:text-rose-100 transition-colors flex-1 text-center"
        onClick={handleAdminLogout}
        title="تسجيل الخروج والعودة لمدخل البوابات"
      >
        <LogOut className="w-4 h-4" />
        <span className="text-[10px] font-semibold">خروج</span>
      </button>
    </nav>
  );
}

// -------------------------------------------------------------
// Component: AdminGeneralPortal
// Faithful reproduction of reference screenshot screen_f214a15d.png
// -------------------------------------------------------------
function AdminGeneralPortal({ setRole }: { setRole: (r: Role) => void }) {
  const appImages = useAppImages();
  const adminHeroImg = resolveSlotPrimaryImage(appImages, "admin_header_banner", hero);
  const [cities, setCities] = useState<CityItem[]>(initialCitiesList);
  const [activeCityId, setActiveCityId] = useState("yafa");
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [adminProfileOpen, setAdminProfileOpen] = useState(false);
  const [showMoreModules, setShowMoreModules] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [newDistricts, setNewDistricts] = useState("");
  const [newManager, setNewManager] = useState("");

  useEffect(() => {
    setCities(loadAdminCities());
    setActiveCityId(safeStorage.getItem("yafa-active-city") || "yafa");
  }, []);

  const activeCity = useMemo(() => {
    return cities.find((c) => c.id === activeCityId)?.name || "يافع";
  }, [cities, activeCityId]);

  const switchActiveCity = (cityId: string) => {
    setActiveCityId(cityId);
    safeStorage.setItem("yafa-active-city", cityId);
    const target = cities.find((c) => c.id === cityId);
    toastMessage(`تم تغيير المدينة الحالية إلى ${target?.name || cityId}`);
    recordAdminAudit("تغيير المدينة الحالية", "إدارة المدن", `تعيين ${target?.name || cityId} كمدينة تشغيلية`);
    setCityModalOpen(false);
  };

  const handleAddCity = (e: FormEvent) => {
    e.preventDefault();
    if (!newCityName.trim()) return toastMessage("يرجى إدخال اسم المدينة");
    const dList = newDistricts.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean);
    const newCity: CityItem = {
      id: `city-${Date.now()}`,
      name: newCityName.trim(),
      districts: dList.length ? dList : ["المركز الرئيسي"],
      active: true,
      localManager: newManager.trim() || "بانتظار التعيين",
      storesCount: 0,
    };
    const next = [...cities, newCity];
    setCities(next);
    saveAdminCities(next);
    recordAdminAudit("إضافة مدينة جديدة", "إدارة المدن", `إضافة مدينة ${newCity.name} مع ${newCity.districts.length} مديرية`);
    toastMessage(`تمت إضافة مدينة ${newCity.name} بنجاح إلى نظام المناطق`);
    setNewCityName("");
    setNewDistricts("");
    setNewManager("");
  };

  const toggleCityActive = (cityId: string) => {
    if (cityId === "yafa") return toastMessage("لا يمكن تعطيل مدينة يافع (المركز الرئيسي)");
    const next = cities.map((c) => (c.id === cityId ? { ...c, active: !c.active } : c));
    setCities(next);
    saveAdminCities(next);
    const cObj = cities.find((c) => c.id === cityId);
    recordAdminAudit(cObj?.active ? "تعطيل مدينة" : "تفعيل مدينة", "إدارة المدن", `تعديل حالة مدينة ${cObj?.name}`);
    toastMessage(`تم تحديث حالة مدينة ${cObj?.name}`);
  };

  const handlePillClick = (sectionPath: string, actionType: string, e: React.MouseEvent) => {
    e.stopPropagation();
    route(`/admin/${sectionPath}?action=${actionType}`);
  };

  return (
    <div className="min-h-screen bg-[#121615] flex items-center justify-center p-0 md:p-6 text-slate-800 antialiased font-sans select-none" dir="rtl">
      {/* Device Frame */}
      <div className="relative w-full max-w-[420px] min-h-screen md:min-h-[915px] md:h-[915px] bg-[#f5f8f5] overflow-y-auto overflow-x-hidden md:rounded-[52px] shadow-2xl flex flex-col justify-between border-4 border-black/40">
        
        {/* Top iOS Status Bar */}
        <header className="relative z-40 pt-3 px-7 flex items-center justify-between text-white text-xs font-semibold select-none shrink-0 bg-[#0c3829]">
          <span className="w-12 text-center text-sm font-bold tracking-tight">9:41</span>
          <div className="w-28 h-6 bg-black rounded-full mx-auto flex items-center justify-end px-2 space-x-1 space-x-reverse">
            <div className="w-2.5 h-2.5 rounded-full bg-[#101c26] border border-blue-900/40"></div>
          </div>
          <div className="w-14 flex items-center justify-end gap-1.5" style={{ direction: "ltr" }}>
            <span className="text-[10px] font-bold">100%</span>
            <div className="w-4 h-2.5 border border-white/80 rounded-xs p-0.5 flex items-center">
              <div className="w-full h-full bg-white rounded-xs"></div>
            </div>
          </div>
        </header>

        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-28 relative">
          
          {/* Hero Header with Arch Shape */}
          <section
            className="relative bg-[#0c3829] text-white pt-5 pb-7 px-5 shadow-md overflow-hidden"
            style={{ borderBottomLeftRadius: "38px", borderBottomRightRadius: "38px" }}
          >
            <div
              className="absolute inset-0 opacity-20 mix-blend-luminosity bg-cover bg-center pointer-events-none"
              style={{ backgroundImage: `url(${adminHeroImg})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0c3829]/80 via-[#0c3829]/95 to-[#0c3829]" />
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-[#e4c485] tracking-tight">يافع ون</span>
                  <span className="text-white/40 font-light text-base">|</span>
                  <span className="text-lg font-bold text-white tracking-wide">Yafa One</span>
                </div>
                <p className="text-[12px] text-[#e4c485]/90 mt-0.5 font-medium">منصتك لخدمات أسهل</p>
              </div>

              {/* Logo Emblem (3 bars) */}
              <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-sm px-3 py-1.5 rounded-2xl border border-[#cfa45b]/30">
                <span className="w-2.5 h-7 bg-[#cfa45b] rounded-full block transform rotate-6"></span>
                <span className="w-2.5 h-5 bg-white/80 rounded-full block transform rotate-6"></span>
                <span className="w-2.5 h-3 bg-[#e4c485] rounded-full block transform rotate-6"></span>
              </div>
            </div>
          </section>

          {/* Main Body */}
          <div className="px-3.5 pt-3.5 space-y-3.5">
            
            {/* Title Section */}
            <section className="flex items-center justify-between px-1.5">
              <div className="flex flex-col">
                <h1 className="text-[20px] font-extrabold text-[#0c3829] tracking-tight leading-tight">الإدارة العامة</h1>
                <p className="text-[11.5px] text-slate-500 font-medium">لوحة تحكم شاملة لإدارة المنصة</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#fbf3de] border border-[#cfa45b]/25 flex items-center justify-center text-[#0c3829] shadow-sm">
                <ShieldCheck className="w-5 h-5 text-[#0c3829]" />
              </div>
            </section>

            {/* Admin Profile Card */}
            <section
              className="bg-[#0e3b2b] text-white rounded-[22px] p-3.5 shadow-md flex items-center justify-between relative overflow-hidden cursor-pointer"
              onClick={() => setAdminProfileOpen(true)}
            >
              <div className="absolute -left-6 -bottom-6 w-20 h-20 bg-white/5 rounded-full blur-sm pointer-events-none"></div>
              
              <div className="flex items-center gap-3 z-10">
                <div className="w-12 h-12 rounded-full bg-[#f6ebd4] flex items-center justify-center text-[#0e3b2b] shadow-inner shrink-0">
                  <UserRound className="w-6 h-6 text-[#0e3b2b]" />
                </div>
                <div>
                  <h2 className="text-[14.5px] font-bold text-white tracking-wide">المدير: ماجد التركي</h2>
                  <p className="text-[11px] text-[#e4c485] font-medium">الصلاحية: مدير عام النظام</p>
                </div>
              </div>

              {/* Gold Crown Badge */}
              <div className="bg-[#eedab0] text-[#0e3b2b] text-[10.5px] font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm border border-[#cfa45b]/40 z-10">
                <Crown className="w-3.5 h-3.5 text-amber-800" />
                <span>مدير عام النظام</span>
              </div>
            </section>

            {/* Quick Status Cards (Commission & City) */}
            <section className="grid grid-cols-2 gap-2.5">
              
              {/* Commission Card (0 YER / 0%) */}
              <div className="bg-[#fbf4e5] border border-[#f1dfba] rounded-2xl p-2.5 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#fae8c6] text-amber-800 flex items-center justify-center shrink-0">
                    <CircleDollarSign className="w-5 h-5 text-amber-800" />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-slate-800">العمولة: 0 ريال</p>
                    <p className="text-[10px] text-slate-500 font-medium">لا يتم استقطاع أي عمولة</p>
                  </div>
                </div>
              </div>

              {/* Current City Card */}
              <div
                className="bg-[#f2f7f4] border border-[#d9e7df] rounded-2xl p-2.5 flex items-center justify-between shadow-xs cursor-pointer hover:bg-[#ebf4ee] transition-colors"
                onClick={() => setCityModalOpen(true)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#e0eee6] text-[#0c3829] flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-[#0c3829]" />
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#0c3829] leading-tight">
                      المدينة الحالية: <span className="text-emerald-700 font-extrabold">{activeCity}</span>
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium">قابل للتوسع لمدن أخرى</p>
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 pl-0.5" />
              </div>
            </section>

            {/* Admin Modules Grid (2 Columns) Matching Reference Image */}
            <section className="grid grid-cols-2 gap-2.5">
              
              {/* Item 1: إدارة المنشآت */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 transition-colors"
                onClick={() => route("/admin/establishments")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#fdf5e8] text-amber-800 flex items-center justify-center text-sm font-semibold border border-amber-100">
                      <Store className="w-4 h-4 text-amber-800" />
                    </div>
                    <h3 className="text-[12px] font-bold text-slate-800">إدارة المنشآت</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("establishments", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("establishments", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("establishments", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("establishments", "toggle", e)}>تفعيل</span>
                </div>
              </div>

              {/* Item 2: إدارة المستخدمين */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-300 transition-colors"
                onClick={() => route("/admin/users")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#edf6f2] text-[#0c3829] flex items-center justify-center text-sm font-semibold border border-emerald-100">
                      <UsersRound className="w-4 h-4 text-[#0c3829]" />
                    </div>
                    <h3 className="text-[12px] font-bold text-slate-800">إدارة المستخدمين</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("users", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("users", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("users", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("users", "toggle", e)}>تفعيل</span>
                </div>
              </div>

              {/* Item 3: إدارة المدن والمناطق */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 transition-colors"
                onClick={() => route("/admin/cities")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#fdf5e8] text-amber-800 flex items-center justify-center text-sm font-semibold border border-amber-100">
                      <MapPin className="w-4 h-4 text-amber-800" />
                    </div>
                    <h3 className="text-[11.5px] font-bold text-slate-800">إدارة المدن والمناطق</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("cities", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("cities", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("cities", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("cities", "toggle", e)}>تفعيل</span>
                </div>
              </div>

              {/* Item 4: إدارة الأقسام */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-300 transition-colors"
                onClick={() => route("/admin/categories")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#edf6f2] text-[#0c3829] flex items-center justify-center text-sm font-semibold border border-emerald-100">
                      <Grid2X2 className="w-4 h-4 text-[#0c3829]" />
                    </div>
                    <h3 className="text-[12px] font-bold text-slate-800">إدارة الأقسام</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("categories", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("categories", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("categories", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("categories", "toggle", e)}>تفعيل</span>
                </div>
              </div>

              {/* Item 5: الإعلانات */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 transition-colors"
                onClick={() => route("/admin/ads")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#fdf5e8] text-amber-800 flex items-center justify-center text-sm font-semibold border border-amber-100">
                      <Megaphone className="w-4 h-4 text-amber-800" />
                    </div>
                    <h3 className="text-[12px] font-bold text-slate-800">الإعلانات</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("ads", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("ads", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("ads", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("ads", "toggle", e)}>تفعيل</span>
                </div>
              </div>

              {/* Item 6: أسعار الصرف */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-300 transition-colors"
                onClick={() => route("/admin/exchange-rates")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#edf6f2] text-[#0c3829] flex items-center justify-center text-sm font-semibold border border-emerald-100">
                      <Landmark className="w-4 h-4 text-[#0c3829]" />
                    </div>
                    <h3 className="text-[12px] font-bold text-slate-800">أسعار الصرف</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("exchange-rates", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("exchange-rates", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("exchange-rates", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("exchange-rates", "toggle", e)}>تفعيل</span>
                </div>
              </div>

              {/* Item 7: الإشعارات */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-300 transition-colors"
                onClick={() => route("/admin/notifications")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#fdf5e8] text-amber-800 flex items-center justify-center text-sm font-semibold border border-amber-100">
                      <Bell className="w-4 h-4 text-amber-800" />
                    </div>
                    <h3 className="text-[12px] font-bold text-slate-800">الإشعارات</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("notifications", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("notifications", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("notifications", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("notifications", "toggle", e)}>تفعيل</span>
                </div>
              </div>

              {/* Item 8: التقارير */}
              <div
                className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-emerald-300 transition-colors"
                onClick={() => route("/admin/reports")}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-[#edf6f2] text-[#0c3829] flex items-center justify-center text-sm font-semibold border border-emerald-100">
                      <FileText className="w-4 h-4 text-[#0c3829]" />
                    </div>
                    <h3 className="text-[12px] font-bold text-slate-800">التقارير</h3>
                  </div>
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                  <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("reports", "add", e)}>إضافة</span>
                  <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("reports", "edit", e)}>تعديل</span>
                  <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("reports", "delete", e)}>حذف</span>
                  <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("reports", "toggle", e)}>تفعيل</span>
                </div>
              </div>
            </section>

            {/* Featured Full-Width Card: إدارة صور التطبيق */}
            <section
              className="bg-gradient-to-l from-[#0c3829] to-[#064b3d] text-white rounded-2xl p-3 border border-[#cfa45b]/50 shadow-md flex items-center justify-between gap-2 cursor-pointer hover:brightness-105 transition-all"
              onClick={() => route("/admin/app-images")}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#eedab0] text-[#0c3829] flex items-center justify-center shrink-0 shadow-xs">
                  <Image className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-[13px] font-black text-white">إدارة صور التطبيق</h3>
                  <p className="text-[10.5px] text-[#e4c485] font-medium">
                    تغيير، إضافة، حذف، قص وتحسين صور جميع صفحات التطبيق من مكان واحد
                  </p>
                </div>
              </div>
              <div className="bg-[#eedab0] text-[#0c3829] text-[10px] font-black px-2.5 py-1 rounded-lg shrink-0 flex items-center gap-1">
                <span>فتح</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </div>
            </section>

            {/* Item 9: Full-Width Card: إعدادات التطبيق */}
            <section
              className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col gap-2 cursor-pointer hover:border-amber-300 transition-colors"
              onClick={() => route("/admin/settings")}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#fdf5e8] text-amber-800 flex items-center justify-center text-sm font-semibold border border-amber-100">
                    <Settings className="w-4 h-4 text-amber-800" />
                  </div>
                  <h3 className="text-[12.5px] font-bold text-slate-800">إعدادات التطبيق العامة</h3>
                </div>
                <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="flex items-center justify-end gap-1 text-[9px] font-bold">
                <span className="bg-[#edf6f0] text-emerald-800 px-3 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick("settings", "add", e)}>إضافة</span>
                <span className="bg-[#eaf3f8] text-sky-800 px-3 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick("settings", "edit", e)}>تعديل</span>
                <span className="bg-[#fdeeed] text-rose-700 px-3 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick("settings", "delete", e)}>حذف</span>
                <span className="bg-[#fcf5e5] text-amber-800 px-3 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick("settings", "toggle", e)}>تفعيل</span>
              </div>
            </section>

            {/* Toggle Button to reveal all other departments */}
            <div className="pt-1">
              <button
                type="button"
                className="w-full py-2 px-3 rounded-xl bg-[#eaf3ee] hover:bg-[#dfebe3] text-[#0c3829] text-[11px] font-bold flex items-center justify-center gap-2 border border-[#cee2d7] transition-colors"
                onClick={() => setShowMoreModules(!showMoreModules)}
              >
                <span>{showMoreModules ? "إخفاء الأقسام الإضافية ▲" : "عرض باقي الأقسام الإدارية (10 أقسام إضافية) ▼"}</span>
              </button>
            </div>

            {/* Extended modules */}
            {showMoreModules && (
              <section className="grid grid-cols-2 gap-2.5 pt-1 animate-fadeIn">
                {[
                  { name: "إدارة المنتجات والأسعار", path: "products", Icon: Package, tone: "amber" },
                  { name: "إدارة الطلبات وحالاتها", path: "orders", Icon: ShoppingCart, tone: "emerald" },
                  { name: "إدارة أصحاب المهن", path: "professionals", Icon: Wrench, tone: "amber" },
                  { name: "طرق الدفع والعمولة 0%", path: "payments", Icon: CircleDollarSign, tone: "emerald" },
                  { name: "إدارة حراج المستعمل", path: "used", Icon: Box, tone: "amber" },
                  { name: "السيارات والعقارات", path: "vehicles", Icon: Car, tone: "emerald" },
                  { name: "برنامج شارك واربح", path: "referrals", Icon: Gift, tone: "amber" },
                  { name: "الموظفون والصلاحيات", path: "roles", Icon: ShieldCheck, tone: "emerald" },
                  { name: "الشكاوى والبلاغات", path: "complaints", Icon: MessageCircle, tone: "amber" },
                  { name: "النسخ الاحتياطي والأمان", path: "backup", Icon: ClipboardList, tone: "emerald" },
                  { name: "إدارة صور التطبيق", path: "app-images", Icon: Image, tone: "gold" },
                  { name: "إدارة المظهر والمحتوى الحي", path: "appearance", Icon: Palette, tone: "emerald" },
                ].map(({ name, path, Icon, tone }) => (
                  <div
                    key={path}
                    className="bg-white rounded-2xl p-2.5 border border-[#e8ece7] shadow-sm flex flex-col justify-between cursor-pointer hover:border-slate-300"
                    onClick={() => route(`/admin/${path}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl ${tone === "amber" ? "bg-[#fdf5e8] text-amber-800 border-amber-100" : "bg-[#edf6f2] text-[#0c3829] border-emerald-100"} flex items-center justify-center text-sm font-semibold border`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <h3 className="text-[11px] font-bold text-slate-800 leading-tight">{name}</h3>
                      </div>
                      <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[9px] text-center font-bold">
                      <span className="bg-[#edf6f0] text-emerald-800 py-0.5 rounded-md hover:bg-emerald-100" onClick={(e) => handlePillClick(path, "add", e)}>إضافة</span>
                      <span className="bg-[#eaf3f8] text-sky-800 py-0.5 rounded-md hover:bg-sky-100" onClick={(e) => handlePillClick(path, "edit", e)}>تعديل</span>
                      <span className="bg-[#fdeeed] text-rose-700 py-0.5 rounded-md hover:bg-rose-100" onClick={(e) => handlePillClick(path, "delete", e)}>حذف</span>
                      <span className="bg-[#fcf5e5] text-amber-800 py-0.5 rounded-md hover:bg-amber-100" onClick={(e) => handlePillClick(path, "toggle", e)}>تفعيل</span>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {/* Security Notice */}
            <div className="p-3 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl text-[10.5px] text-emerald-950 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <strong>نظام محمي برتبة Super Admin:</strong>
                <p className="mt-0.5 text-emerald-800 leading-relaxed">
                  الحساب موثق باسم المدير العام <b>ماجد التركي</b>. جميع عمليات الإضافة والتعديل والحذف والتفعيل تسجل بالكامل في سجل التدقيق (Audit Logs) مع حفظ الخادم.
                </p>
              </div>
            </div>

          </div>
        </main>

        {/* Bottom Navigation Bar */}
        <AdminBottomNav setRole={setRole} />

        {/* Modal: City Expansion System (Requirement #6) */}
        {cityModalOpen && (
          <Modal title="نظام إدارة المدن والتوسع (محافظات ومديريات)" close={() => setCityModalOpen(false)}>
            <div className="space-y-3.5 text-right" dir="rtl">
              <div className="p-2.5 bg-[#f0f7f3] border border-[#d2e5da] rounded-xl text-[11px] text-[#0c3829]">
                <strong>المدينة الحالية النشطة في التطبيق:</strong>
                <span className="block font-black text-[13px] text-emerald-800 mt-0.5">{activeCity}</span>
                <small className="text-slate-500">يافع هي المنطقة الافتراضية المفعلة مع جاهزية التوسع لكافة المدن والمناطق دون إعادة بناء التطبيق.</small>
              </div>

              <div className="space-y-2">
                <b className="text-[12px] text-slate-800 block">قائمة المدن المسجلة:</b>
                {cities.map((city) => (
                  <div
                    key={city.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between text-[11px] ${
                      city.id === activeCityId ? "bg-emerald-50 border-emerald-300" : "bg-white border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-[12px]">{city.name}</strong>
                        {city.id === activeCityId && <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.2 rounded-md">المدينة الحالية</span>}
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-md ${city.active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                          {city.active ? "نشطة" : "متوقفة"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">المديريات: {city.districts.join("، ")}</p>
                      <p className="text-[9.5px] text-slate-400">المدير المحلي: {city.localManager}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {city.id !== activeCityId && city.active && (
                        <button
                          type="button"
                          className="bg-[#0c3829] text-white text-[10px] px-2 py-1 rounded-lg font-bold"
                          onClick={() => switchActiveCity(city.id)}
                        >
                          تعيين كحالية
                        </button>
                      )}
                      {city.id !== "yafa" && (
                        <button
                          type="button"
                          className={`text-[9.5px] px-2 py-0.5 rounded-lg border font-bold ${
                            city.active ? "border-rose-300 text-rose-700 bg-rose-50" : "border-emerald-300 text-emerald-700 bg-emerald-50"
                          }`}
                          onClick={() => toggleCityActive(city.id)}
                        >
                          {city.active ? "تعطيل" : "تفعيل"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Form to Add New City */}
              <form onSubmit={handleAddCity} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 mt-3">
                <b className="text-[11.5px] text-slate-800 block">إضافة مدينة / محافظة جديدة:</b>
                <input
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  placeholder="اسم المدينة (مثال: شبوة، المهرة، تعز)"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  required
                />
                <textarea
                  value={newDistricts}
                  onChange={(e) => setNewDistricts(e.target.value)}
                  placeholder="المديريات التابعة (افصل بينها بفواصل أو أسطر)"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 h-14"
                />
                <input
                  value={newManager}
                  onChange={(e) => setNewManager(e.target.value)}
                  placeholder="المدير المحلي المعين (اختياري)"
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
                <Button type="submit" kind="gold" className="w-full text-xs py-1.5">
                  <Plus className="w-4 h-4" /> حفظ وإضافة المدينة
                </Button>
              </form>
            </div>
          </Modal>
        )}

        {/* Modal: Admin Profile & Verification */}
        {adminProfileOpen && (
          <Modal title="معلومات مدير عام النظام (Super Admin)" close={() => setAdminProfileOpen(false)}>
            <div className="space-y-3 text-right" dir="rtl">
              <div className="text-center p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                <div className="w-14 h-14 rounded-full bg-[#eedab0] mx-auto flex items-center justify-center text-[#0e3b2b] mb-2 shadow-sm">
                  <Crown className="w-7 h-7 text-[#0e3b2b]" />
                </div>
                <h3 className="text-base font-bold text-[#0c3829]">المدير: ماجد التركي</h3>
                <p className="text-xs text-emerald-800 font-semibold mt-0.5">الصلاحية: مدير عام النظام (Super Admin)</p>
                <span className="inline-block bg-emerald-200 text-emerald-900 text-[10px] px-2.5 py-0.5 rounded-full font-bold mt-1.5">
                  موثق في Firebase Authentication
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div><b>البريد المعتمد:</b> <span className="font-mono text-slate-700">majdaltrki8@gmail.com</span></div>
                <div><b>معرّف الخادم (UID):</b> <span className="font-mono text-[10px] text-slate-500">{auth.currentUser?.uid || "جلسة إدارية موثقة"}</span></div>
                <div><b>العمولة المعتمدة:</b> <span className="text-emerald-700 font-bold">0 ريال يمني (0%)</span></div>
                <div><b>المدينة التشغيلية:</b> <span className="text-[#0c3829] font-bold">{activeCity}</span></div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button kind="outline" className="flex-1 text-xs" onClick={() => { setAdminProfileOpen(false); route("/admin/audit"); }}>
                  <ClipboardList className="w-4 h-4" /> سجل التدقيق
                </Button>
                <Button
                  kind="danger"
                  className="flex-1 text-xs"
                  onClick={async () => {
                    await clearServerAndFirebaseSession();
                    setRole(null);
                    safeStorage.removeItem("yafa-role");
                    if (typeof document !== "undefined") {
                      document.cookie = "yafa-role=; path=/; max-age=0; SameSite=Lax";
                    }
                    toastMessage("تم تسجيل الخروج بنجاح");
                    setAdminProfileOpen(false);
                    route("/entry");
                  }}
                >
                  <LogOut className="w-4 h-4" /> تسجيل الخروج
                </Button>
              </div>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Component: AdminSectionDetailView
// Dedicated mobile & desktop view for all 18 sections
// With real Add, Edit, Delete (safe confirm), Toggle, Search, Sort & Audit logging
// -------------------------------------------------------------
const sectionFirestoreMap: Record<string, string> = {
  establishments: "establishments",
  users: "users",
  products: "products",
  orders: "orders",
  ads: "advertisements",
  used: "usedAds",
  notifications: "notifications",
  categories: "categories",
  cities: "cities",
  roles: "roles",
  complaints: "complaints",
  referrals: "referrals",
  professionals: "professionals",
  audit: "auditLogs",
};

function AdminSectionDetailView({ section, setRole }: { section: string; setRole: (r: Role) => void }) {
  const [items, setItems] = useState<AdminRecordItem[]>([]);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("الكل");
  const [sortBy, setSortBy] = useState<"name" | "date" | "status">("date");
  const [activeModal, setActiveModal] = useState<"add" | "edit" | "delete" | null>(null);
  const [selectedItem, setSelectedItem] = useState<AdminRecordItem | null>(null);
  const [actionHint, setActionHint] = useState("");

  // Form states for Add / Edit
  const [formTitle, setFormTitle] = useState("");
  const [formDetail, setFormDetail] = useState("");
  const [formStatus, setFormStatus] = useState<AdminRecordItem["status"]>("نشط");

  const [metaTitle, metaSubtitle] = adminMeta[section] || [section, "إدارة سجلات المنصة"];
  const fsCollection = sectionFirestoreMap[section];

  // Sync live Firestore documents on section load
  useEffect(() => {
    setItems(loadAdminSectionData(section));
    if (!fsCollection) return;
    getDocs(collection(db, fsCollection))
      .then((snap) => {
        if (snap.empty) return;
        const cloudRows: AdminRecordItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          const statusVal: AdminRecordItem["status"] =
            data.status === "متوقف" || data.status === "مرفوضة" || data.approved === false
              ? (data.approved === false && !data.status ? "قيد المراجعة" : data.status || "قيد المراجعة")
              : data.status || "نشط";
          return {
            id: d.id,
            title: data.title || data.name || data.customerName || d.id,
            detail: data.detail || [data.district, data.activity, data.email, data.price ? `${data.price} ر.ي` : ""].filter(Boolean).join(" · ") || "سجل متزامن مع Firestore",
            status: statusVal,
            date: data.date || (data.createdAt ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date(data.createdAt)) : "اليوم"),
          };
        });
        setItems((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          cloudRows.forEach((r) => map.set(r.id, r));
          const merged = Array.from(map.values());
          if (section !== "audit") saveAdminSectionData(section, merged);
          return merged;
        });
      })
      .catch(() => {});
  }, [section, fsCollection]);

  // Check URL params for action (add / edit / delete / toggle)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      const action = search.get("action");
      setActionHint("");
      if (action === "add") {
        setFormTitle("");
        setFormDetail("");
        setFormStatus("نشط");
        setActiveModal("add");
      } else if (action === "edit") {
        setActionHint("اختر أي سجل أدناه ثم اضغط زر «تعديل» لحفظ التعديلات.");
      } else if (action === "delete") {
        setActionHint("اختر أي سجل أدناه ثم اضغط زر «حذف» لإزالته بشكل آمن.");
      } else if (action === "toggle") {
        setActionHint("اختر أي سجل أدناه ثم اضغط «تفعيل / اعتماد» أو «تعطيل».");
      }
    }
  }, [section]);

  const filteredAndSortedItems = useMemo(() => {
    return items
      .filter((item) => {
        const matchesQuery =
          !queryText.trim() ||
          item.title.toLowerCase().includes(queryText.toLowerCase()) ||
          item.detail.toLowerCase().includes(queryText.toLowerCase()) ||
          item.id.toLowerCase().includes(queryText.toLowerCase());
        const matchesStatus = statusFilter === "الكل" || item.status === statusFilter;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.title.localeCompare(b.title);
        if (sortBy === "status") return a.status.localeCompare(b.status);
        return b.id.localeCompare(a.id);
      });
  }, [items, queryText, statusFilter, sortBy]);

  const syncRecordToFirestore = async (item: AdminRecordItem, op: "save" | "delete", approvedFlag?: boolean) => {
    if (!fsCollection || !auth.currentUser) return;
    if (op === "delete") {
      await deleteDoc(doc(db, fsCollection, item.id)).catch((err) => logFirestoreError(err, OperationType.DELETE, `${fsCollection}/${item.id}`));
    } else {
      const payload: Record<string, any> = {
        id: item.id,
        title: item.title,
        name: item.title,
        detail: item.detail,
        status: item.status,
        active: item.status === "نشط" || item.status === "معتمدة",
        updatedAt: new Date().toISOString(),
      };
      if (typeof approvedFlag === "boolean") payload.approved = approvedFlag;
      await setDoc(doc(db, fsCollection, item.id), payload, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, `${fsCollection}/${item.id}`));
    }
  };

  const handleSaveAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return toastMessage("يرجى إدخال العنوان");
    const newItem: AdminRecordItem = {
      id: `${section.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
      title: formTitle.trim(),
      detail: formDetail.trim() || "بيانات معتمدة من الإدارة العامة",
      status: formStatus,
      date: new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date()),
    };
    const next = [newItem, ...items];
    setItems(next);
    saveAdminSectionData(section, next);
    await syncRecordToFirestore(newItem, "save", newItem.status === "نشط" || newItem.status === "معتمدة");
    recordAdminAudit("إضافة سجل جديد", metaTitle, `إضافة: ${newItem.title} (${newItem.id})`);
    toastMessage(`تمت إضافة ${newItem.title} بنجاح`);
    setActiveModal(null);
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !formTitle.trim()) return;
    const updatedItem: AdminRecordItem = {
      ...selectedItem,
      title: formTitle.trim(),
      detail: formDetail.trim() || selectedItem.detail,
      status: formStatus,
      date: new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date()),
    };
    const next = items.map((it) => (it.id === selectedItem.id ? updatedItem : it));
    setItems(next);
    saveAdminSectionData(section, next);
    await syncRecordToFirestore(updatedItem, "save", updatedItem.status === "نشط" || updatedItem.status === "معتمدة");
    recordAdminAudit("تعديل سجل", metaTitle, `تعديل: ${formTitle.trim()} (${selectedItem.id})`);
    toastMessage(`تم حفظ تعديلات ${formTitle.trim()} بنجاح`);
    setActiveModal(null);
    setSelectedItem(null);
  };

  const handleConfirmDelete = async () => {
    if (!selectedItem) return;
    const next = items.filter((it) => it.id !== selectedItem.id);
    setItems(next);
    saveAdminSectionData(section, next);
    await syncRecordToFirestore(selectedItem, "delete");
    recordAdminAudit("حذف آمن لسجل", metaTitle, `حذف: ${selectedItem.title} (${selectedItem.id})`);
    toastMessage(`تم حذف ${selectedItem.title} بشكل آمن`);
    setActiveModal(null);
    setSelectedItem(null);
  };

  const handleToggleStatus = async (item: AdminRecordItem) => {
    const nextStatus: AdminRecordItem["status"] = item.status === "نشط" || item.status === "معتمدة" ? "متوقف" : "نشط";
    const updatedItem = { ...item, status: nextStatus };
    const next = items.map((it) => (it.id === item.id ? updatedItem : it));
    setItems(next);
    saveAdminSectionData(section, next);
    await syncRecordToFirestore(updatedItem, "save", nextStatus === "نشط");
    recordAdminAudit(nextStatus === "نشط" ? "تفعيل سجل" : "تعطيل سجل", metaTitle, `تغيير حالة: ${item.title} إلى ${nextStatus}`);
    toastMessage(`تم ${nextStatus === "نشط" ? "تفعيل" : "تعطيل"} ${item.title}`);
  };

  const handleApproveReject = async (item: AdminRecordItem, approve: boolean) => {
    const nextStatus: AdminRecordItem["status"] = approve ? "معتمدة" : "مرفوضة";
    const updatedItem = { ...item, status: nextStatus };
    const next = items.map((it) => (it.id === item.id ? updatedItem : it));
    setItems(next);
    saveAdminSectionData(section, next);
    await syncRecordToFirestore(updatedItem, "save", approve);
    recordAdminAudit(approve ? "اعتماد رسمي" : "رفض طلب", metaTitle, `${approve ? "اعتماد" : "رفض"}: ${item.title} (${item.id})`);
    toastMessage(approve ? `تم اعتماد ${item.title} ونشره` : `تم رفض ${item.title}`);
  };

  const openEdit = (item: AdminRecordItem) => {
    setSelectedItem(item);
    setFormTitle(item.title);
    setFormDetail(item.detail);
    setFormStatus(item.status);
    setActiveModal("edit");
  };

  const openDelete = (item: AdminRecordItem) => {
    setSelectedItem(item);
    setActiveModal("delete");
  };

  const exportSectionCSV = () => {
    const header = ["المعرف", "العنوان", "التفاصيل", "الحالة", "التاريخ"];
    const rows = items.map((it) => [it.id, it.title, it.detail, it.status, it.date]);
    const csvContent = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `yafaone-${section}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toastMessage(`تم تصدير سجلات ${metaTitle} بنجاح`);
  };

  return (
    <div className="min-h-screen bg-[#121615] flex items-center justify-center p-0 md:p-6 text-slate-800 antialiased font-sans select-none" dir="rtl">
      <div className="relative w-full max-w-[430px] min-h-screen md:min-h-[915px] md:h-[915px] bg-[#f5f8f5] overflow-y-auto overflow-x-hidden md:rounded-[52px] shadow-2xl flex flex-col justify-between border-4 border-black/40">
        
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-[#0c3829] text-white p-3.5 shadow-md flex items-center justify-between">
          <button
            type="button"
            className="flex items-center gap-1 text-[#e4c485] font-bold text-xs hover:text-white"
            onClick={() => route("/admin/dashboard")}
          >
            <ChevronLeft className="w-4 h-4 transform rotate-180" />
            <span>لوحة الإدارة</span>
          </button>
          <div className="text-center">
            <h1 className="text-sm font-extrabold text-white">{metaTitle}</h1>
            <span className="text-[10px] text-[#e4c485]">المدير: ماجد التركي</span>
          </div>
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
            onClick={() => route("/admin/dashboard")}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-3.5 pb-28 space-y-3">
          
          {/* Subtitle & Badge */}
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] text-slate-500 font-medium max-w-[70%]">{metaSubtitle}</p>
            <span className="bg-[#fcf5e5] text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-lg">
              {filteredAndSortedItems.length} سجل
            </span>
          </div>

          {/* Action hint banner when opened from dashboard pill */}
          {actionHint && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-semibold flex items-center justify-between gap-2">
              <span>{actionHint}</span>
              <button type="button" onClick={() => setActionHint("")}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={`البحث في ${metaTitle}...`}
              className="w-full text-xs pr-9 pl-3 py-2 bg-white rounded-xl border border-slate-200 shadow-xs focus:border-[#0c3829] outline-none"
            />
          </div>

          {/* Action Bar (Add, Sort, Export) */}
          <div className="flex items-center justify-between gap-2">
            <Button
              kind="gold"
              className="flex-1 text-xs py-1.5 h-9"
              onClick={() => {
                setFormTitle("");
                setFormDetail("");
                setFormStatus("نشط");
                setActiveModal("add");
              }}
            >
              <Plus className="w-4 h-4" /> إضافة جديد
            </Button>
            <div className="flex gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-[10.5px] font-bold p-1.5 rounded-xl border border-slate-200 bg-white"
              >
                <option value="date">الأحدث</option>
                <option value="name">الاسم</option>
                <option value="status">الحالة</option>
              </select>
              <button
                type="button"
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 text-[10px]"
                onClick={exportSectionCSV}
                title="تصدير CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 text-[10px] font-bold">
            {["الكل", "نشط", "قيد المراجعة", "معتمدة", "معلق", "متوقف", "مرفوضة"].map((st) => (
              <button
                key={st}
                type="button"
                className={`px-2.5 py-1 rounded-lg border shrink-0 transition-colors ${
                  statusFilter === st
                    ? "bg-[#0c3829] text-white border-[#0c3829]"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Records List */}
          <div className="space-y-2">
            {filteredAndSortedItems.length ? (
              filteredAndSortedItems.map((item) => (
                <article
                  key={item.id}
                  className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-xs text-slate-900">{item.title}</strong>
                        <span className="text-[9px] font-mono text-slate-400">({item.id})</span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 mt-0.5">{item.detail}</p>
                      <small className="text-[9px] text-slate-400 block mt-1">تاريخ: {item.date}</small>
                    </div>
                    <span
                      className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        item.status === "نشط" || item.status === "معتمدة"
                          ? "bg-emerald-100 text-emerald-800"
                          : item.status === "قيد المراجعة" || item.status === "معلق"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-slate-100">
                    {(section === "establishments" || section === "used" || section === "referrals") && item.status !== "معتمدة" && (
                      <button
                        type="button"
                        className="px-2.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 flex items-center gap-1"
                        onClick={() => handleApproveReject(item, true)}
                      >
                        <Check className="w-3 h-3" />
                        <span>اعتماد</span>
                      </button>
                    )}
                    {(section === "establishments" || section === "used" || section === "referrals") && item.status !== "مرفوضة" && (
                      <button
                        type="button"
                        className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-bold hover:bg-amber-100 flex items-center gap-1"
                        onClick={() => handleApproveReject(item, false)}
                      >
                        <X className="w-3 h-3" />
                        <span>رفض</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="px-2.5 py-0.5 rounded-md bg-[#edf6f0] text-emerald-800 text-[10px] font-bold hover:bg-emerald-100 flex items-center gap-1"
                      onClick={() => handleToggleStatus(item)}
                    >
                      <Check className="w-3 h-3" />
                      <span>{item.status === "نشط" || item.status === "معتمدة" ? "تعطيل" : "تفعيل"}</span>
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-0.5 rounded-md bg-[#eaf3f8] text-sky-800 text-[10px] font-bold hover:bg-sky-100 flex items-center gap-1"
                      onClick={() => openEdit(item)}
                    >
                      <Pencil className="w-3 h-3" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      className="px-2.5 py-0.5 rounded-md bg-[#fdeeed] text-rose-700 text-[10px] font-bold hover:bg-rose-100 flex items-center gap-1"
                      onClick={() => openDelete(item)}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>حذف</span>
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 space-y-2">
                <Box className="w-8 h-8 text-amber-600 mx-auto" />
                <h4 className="text-xs font-bold">لا توجد سجلات مطابقة</h4>
                <p className="text-[10px]">يمكنك إضافة سجل جديد أو مسح معايير البحث.</p>
                <Button kind="outline" className="text-xs mx-auto" onClick={() => { setQueryText(""); setStatusFilter("الكل"); }}>
                  عرض جميع السجلات
                </Button>
              </div>
            )}
          </div>
        </main>

        {/* Bottom Navigation */}
        <AdminBottomNav setRole={setRole} />

        {/* Modal: Add Record */}
        {activeModal === "add" && (
          <Modal title={`إضافة سجل جديد في ${metaTitle}`} close={() => setActiveModal(null)}>
            <form onSubmit={handleSaveAdd} className="space-y-3 text-right" dir="rtl">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">الاسم أو العنوان *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="مثال: منشأة جديدة / صنف جديد"
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">التفاصيل أو الوصف *</label>
                <textarea
                  value={formDetail}
                  onChange={(e) => setFormDetail(e.target.value)}
                  placeholder="أدخل التفاصيل والمنطقة والبيانات التوضيحية"
                  className="w-full text-xs p-2 rounded-xl border border-slate-300 h-16"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">الحالة الإدارية</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                >
                  <option value="نشط">نشط (مفعل للجميع)</option>
                  <option value="قيد المراجعة">قيد المراجعة</option>
                  <option value="معلق">معلق</option>
                  <option value="متوقف">متوقف</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" kind="gold" className="flex-1 text-xs">
                  <Check className="w-4 h-4" /> حفظ وإضافة السجل
                </Button>
                <Button type="button" kind="outline" className="text-xs" onClick={() => setActiveModal(null)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Edit Record */}
        {activeModal === "edit" && selectedItem && (
          <Modal title={`تعديل السجل (${selectedItem.id})`} close={() => setActiveModal(null)}>
            <form onSubmit={handleSaveEdit} className="space-y-3 text-right" dir="rtl">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">الاسم أو العنوان *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">التفاصيل أو الوصف *</label>
                <textarea
                  value={formDetail}
                  onChange={(e) => setFormDetail(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300 h-16"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">الحالة الإدارية</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                >
                  <option value="نشط">نشط</option>
                  <option value="قيد المراجعة">قيد المراجعة</option>
                  <option value="معلق">معلق</option>
                  <option value="متوقف">متوقف</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" kind="gold" className="flex-1 text-xs">
                  <Check className="w-4 h-4" /> حفظ التعديلات
                </Button>
                <Button type="button" kind="outline" className="text-xs" onClick={() => setActiveModal(null)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: Safe Delete Confirmation */}
        {activeModal === "delete" && selectedItem && (
          <Modal title="تأكيد الحذف الآمن" close={() => setActiveModal(null)}>
            <div className="space-y-3 text-right" dir="rtl">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 mb-1" />
                <p>هل أنت متأكد من حذف هذا السجل بشكل دائم؟</p>
                <strong className="block mt-1 font-bold">{selectedItem.title} ({selectedItem.id})</strong>
                <p className="text-[10px] text-rose-700 mt-1">سيتم توثيق عملية الحذف في سجل التدقيق باسم المدير العام.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" kind="danger" className="flex-1 text-xs" onClick={handleConfirmDelete}>
                  <Trash2 className="w-4 h-4" /> نعم، احذف السجل
                </Button>
                <Button type="button" kind="outline" className="text-xs" onClick={() => setActiveModal(null)}>
                  إلغاء
                </Button>
              </div>
            </div>
          </Modal>
        )}

      </div>
    </div>
  );
}

function AdminPage({ type, setRole }: { type: string; setRole: (r: Role) => void }) {
  if (type === "dashboard") return <AdminGeneralPortal setRole={setRole} />;
  if (type === "exchange-rates") {
    return (
      <div className="min-h-screen bg-[#121615] flex items-center justify-center p-0 md:p-6 text-slate-800 antialiased font-sans" dir="rtl">
        <div className="relative w-full max-w-[430px] min-h-screen md:min-h-[915px] md:h-[915px] bg-[#f5f8f5] overflow-y-auto overflow-x-hidden md:rounded-[52px] shadow-2xl flex flex-col justify-between border-4 border-black/40">
          <header className="sticky top-0 z-40 bg-[#0c3829] text-white p-3.5 shadow-md flex items-center justify-between">
            <button type="button" className="flex items-center gap-1 text-[#e4c485] font-bold text-xs" onClick={() => route("/admin/dashboard")}>
              <ChevronLeft className="w-4 h-4 transform rotate-180" />
              <span>لوحة الإدارة</span>
            </button>
            <h1 className="text-sm font-extrabold text-white">إدارة أسعار الصرف (سوق عدن)</h1>
            <button type="button" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white" onClick={() => route("/admin/dashboard")}>
              <X className="w-4 h-4" />
            </button>
          </header>
          <main className="flex-1 p-3 pb-28">
            <ExchangeRateAdmin />
          </main>
          <AdminBottomNav setRole={setRole} />
        </div>
      </div>
    );
  }
  if (type === "carousel") {
    return (
      <div className="min-h-screen bg-[#121615] flex items-center justify-center p-0 md:p-6 text-slate-800 antialiased font-sans" dir="rtl">
        <div className="relative w-full max-w-[430px] min-h-screen md:min-h-[915px] md:h-[915px] bg-[#f5f8f5] overflow-y-auto overflow-x-hidden md:rounded-[52px] shadow-2xl flex flex-col justify-between border-4 border-black/40">
          <header className="sticky top-0 z-40 bg-[#0c3829] text-white p-3.5 shadow-md flex items-center justify-between">
            <button type="button" className="flex items-center gap-1 text-[#e4c485] font-bold text-xs" onClick={() => route("/admin/dashboard")}>
              <ChevronLeft className="w-4 h-4 transform rotate-180" />
              <span>لوحة الإدارة</span>
            </button>
            <h1 className="text-sm font-extrabold text-white">إدارة الإعلانات المتحركة</h1>
            <button type="button" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white" onClick={() => route("/admin/dashboard")}>
              <X className="w-4 h-4" />
            </button>
          </header>
          <main className="flex-1 p-3 pb-28">
            <CarouselAdmin />
          </main>
          <AdminBottomNav setRole={setRole} />
        </div>
      </div>
    );
  }
  if (type === "activity-images") {
    return (
      <div className="min-h-screen bg-[#121615] flex items-center justify-center p-0 md:p-6 text-slate-800 antialiased font-sans" dir="rtl">
        <div className="relative w-full max-w-[430px] min-h-screen md:min-h-[915px] md:h-[915px] bg-[#f5f8f5] overflow-y-auto overflow-x-hidden md:rounded-[52px] shadow-2xl flex flex-col justify-between border-4 border-black/40">
          <header className="sticky top-0 z-40 bg-[#0c3829] text-white p-3.5 shadow-md flex items-center justify-between">
            <button type="button" className="flex items-center gap-1 text-[#e4c485] font-bold text-xs" onClick={() => route("/admin/dashboard")}>
              <ChevronLeft className="w-4 h-4 transform rotate-180" />
              <span>لوحة الإدارة</span>
            </button>
            <h1 className="text-sm font-extrabold text-white">صور وبنرات الأنشطة</h1>
            <button type="button" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white" onClick={() => route("/admin/dashboard")}>
              <X className="w-4 h-4" />
            </button>
          </header>
          <main className="flex-1 p-3 pb-28">
            <ActivityImageAdmin />
          </main>
          <AdminBottomNav setRole={setRole} />
        </div>
      </div>
    );
  }
  return <AdminSectionDetailView key={type} section={type} setRole={setRole} />;
}

function ExchangeRateAdmin() {
  const [current, setCurrent] = useState<ExchangeRateData>(DEFAULT_EXCHANGE_RATES);
  const [source, setSource] = useState(DEFAULT_EXCHANGE_RATES.source || "سوق عدن المالي - جنوب اليمن (معتمد رسمياً)");
  const [adminName, setAdminName] = useState(DEFAULT_EXCHANGE_RATES.adminName || "المدير العام ماجد التركي");
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(DEFAULT_EXCHANGE_RATES.autoUpdateEnabled ?? false);
  const [values, setValues] = useState({
    sarBuy: String(DEFAULT_EXCHANGE_RATES.rates.SAR.buy),
    sarSell: String(DEFAULT_EXCHANGE_RATES.rates.SAR.sell),
    usdBuy: String(DEFAULT_EXCHANGE_RATES.rates.USD.buy),
    usdSell: String(DEFAULT_EXCHANGE_RATES.rates.USD.sell),
  });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(DEFAULT_EXCHANGE_RATES.history || []);

  useEffect(() => {
    const localRates = loadExchangeRates();
    setCurrent(localRates);
    setSource(localRates.source || "سوق عدن المالي - جنوب اليمن (معتمد رسمياً)");
    setAdminName(localRates.adminName || "المدير العام ماجد التركي");
    setAutoUpdateEnabled(Boolean(localRates.autoUpdateEnabled));
    setValues({
      sarBuy: String(localRates.rates.SAR.buy),
      sarSell: String(localRates.rates.SAR.sell),
      usdBuy: String(localRates.rates.USD.buy),
      usdSell: String(localRates.rates.USD.sell),
    });
    setHistory(localRates.history || []);

    fetch("/api/exchange-rates")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data) {
          const d = json.data as ExchangeRateData;
          setCurrent(d);
          setSource(d.source);
          setAdminName(d.adminName || "المدير العام ماجد التركي");
          setAutoUpdateEnabled(Boolean(d.autoUpdateEnabled));
          setValues({
            sarBuy: String(d.rates.SAR.buy),
            sarSell: String(d.rates.SAR.sell),
            usdBuy: String(d.rates.USD.buy),
            usdSell: String(d.rates.USD.sell),
          });
          setHistory(d.history || []);
          safeStorage.setItem(exchangeRateStorageKey, JSON.stringify(d));
        }
      })
      .catch(() => {});
  }, []);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    const numeric = Object.values(values).map(Number);
    if (!source.trim()) return toastMessage("يجب اختيار أو كتابة اسم المصدر الموثوق");
    if (!adminName.trim()) return toastMessage("يجب إدخال اسم المسؤول");
    if (!numeric.every((value) => Number.isFinite(value) && value > 0)) return toastMessage("جميع أسعار الشراء والبيع مطلوبة ويجب أن تكون أكبر من صفر");
    setSaving(true);
    try {
      const payloadData = {
        rates: {
          SAR: { buy: numeric[0], sell: numeric[1] },
          USD: { buy: numeric[2], sell: numeric[3] },
        },
        source: source.trim(),
        adminName: adminName.trim(),
        autoUpdateEnabled,
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch("/api/exchange-rates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
        credentials: "include",
        body: JSON.stringify(payloadData),
      });
      const ct = res.headers.get("content-type");
      const json = ct && ct.includes("application/json") ? await res.json() : null;
      if (res.ok && json && json.success) {
        setCurrent(json.data);
        safeStorage.setItem(exchangeRateStorageKey, JSON.stringify(json.data));
        setHistory(json.data.history || []);
        if (auth.currentUser) {
          await setDoc(doc(db, "settings", "exchangeRates"), json.data, { merge: true }).catch(() => {});
        }
        window.dispatchEvent(new Event("yafa-exchange-rates-updated"));
        recordAdminAudit("نشر أسعار الصرف", "إدارة أسعار الصرف", `SAR ${numeric[0]}/${numeric[1]} · USD ${numeric[2]}/${numeric[3]}`);
        toastMessage("تم اعتماد ونشر أسعار الصرف رسمياً لجميع المستخدمين بنجاح");
      } else {
        toastMessage(json?.error || "فشل نشر الأسعار في الخادم: غير مصرح");
      }
    } catch {
      toastMessage("حدث خطأ في الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  };

  const approvedSources = [
    "سوق عدن المالي - جنوب اليمن (معتمد رسمياً)",
    "موقع بوقش (Boqash)",
    "موقع يمن إيس (Yeces)",
    "موقع اليمن الغد (Alyemenalghad)",
    "مصدر مصرفي محلي خاص",
  ];

  return <div className="admin-card exchange-admin-shell" style={{ display: "grid", gap: "20px" }}>
    <form className="exchange-admin-form" onSubmit={publish} style={{ display: "grid", gap: "14px" }}>
      <div className="alert"><LockKeyhole /> قسم إدارة أسعار الصرف حصرياً للمدير العام (<b>المدير العام ماجد التركي</b>). يتم حفظ السجل والمسؤول والمصدر وتوقيت التعديل في النظام.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <label>اسم المسؤول (المدير العام)<input value={adminName} onChange={(event) => setAdminName(event.target.value)} required /></label>
        <label>المصدر المعتمد
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {approvedSources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <b>التحديث التلقائي (كل 15 دقيقة)</b>
          <p style={{ fontSize: "12px", color: "#666", margin: "2px 0 0 0" }}>جلب التحديثات من المصدر المعتمد تلقائياً أو الاعتماد على التحديث اليدوي</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
          <input type="checkbox" checked={autoUpdateEnabled} onChange={(e) => setAutoUpdateEnabled(e.target.checked)} style={{ width: "18px", height: "18px" }} />
          <span>{autoUpdateEnabled ? "مفعل (تلقائي)" : "معطل (يدوي معتمد)"}</span>
        </label>
      </div>

      <div className="admin-rate-grid">
        <fieldset><legend>الريال السعودي SAR</legend><label>شراء مقابل YER<input type="number" inputMode="decimal" min="1" step="any" value={values.sarBuy} onChange={(event) => setValues({ ...values, sarBuy: event.target.value })} required /></label><label>بيع مقابل YER<input type="number" inputMode="decimal" min="1" step="any" value={values.sarSell} onChange={(event) => setValues({ ...values, sarSell: event.target.value })} required /></label></fieldset>
        <fieldset><legend>الدولار الأمريكي USD</legend><label>شراء مقابل YER<input type="number" inputMode="decimal" min="1" step="any" value={values.usdBuy} onChange={(event) => setValues({ ...values, usdBuy: event.target.value })} required /></label><label>بيع مقابل YER<input type="number" inputMode="decimal" min="1" step="any" value={values.usdSell} onChange={(event) => setValues({ ...values, usdSell: event.target.value })} required /></label></fieldset>
      </div>

      {current && <div className="alert success"><Check /> آخر اعتماد: {new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(current.updatedAt))} — بواسطة: {current.adminName || "المدير العام ماجد التركي"}</div>}
      <Button type="submit" disabled={saving}>{saving ? <><span className="spinner" /> جارٍ النشر...</> : <><Check /> حفظ ونشر الأسعار رسمياً لجميع المستخدمين</>}</Button>
    </form>

    <section className="panel" style={{ marginTop: "10px" }}>
      <div className="panel-heading"><div><ClipboardList /><h2>سجل تغيرات أسعار الصرف (Audit Log)</h2></div></div>
      <div className="data-table" style={{ marginTop: "10px" }}>
        <div className="table-head" style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 2fr", background: "#f1f5f9", padding: "8px 12px", borderRadius: "6px", fontWeight: 700 }}>
          <span>التاريخ والوقت</span><span>المسؤول</span><span>ملخص التعديل والمصدر</span>
        </div>
        {history.length ? history.map((item: any, idx: number) => (
          <div className="table-row" key={`${item.timestamp}-${idx}`} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 2fr", padding: "10px 12px", borderBottom: "1px solid #eee", fontSize: "13px" }}>
            <span>{new Intl.DateTimeFormat("ar-YE", { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.timestamp))}</span>
            <b>{item.adminName}</b>
            <span>{item.summary} ({item.source})</span>
          </div>
        )) : <div style={{ padding: "16px", textAlign: "center", color: "#666" }}>لا توجد سجلات تعديل سابقة مسجلة.</div>}
      </div>
    </section>
  </div>;
}

function ReferralAdmin() {
  const [items, setItems] = useState<AdminRecordItem[]>(() => loadAdminSectionData("referrals"));

  useEffect(() => {
    getDocs(collection(db, "referrals"))
      .then((snap) => {
        if (!snap.empty) {
          const cloud: AdminRecordItem[] = snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              title: data.establishmentName ? `مكافأة إحالة ${data.establishmentName}` : d.id,
              detail: `كود: ${data.referralCode || "—"} · ${data.rewardYer || 1000} ر.ي`,
              status: data.status || "قيد المراجعة",
              date: data.createdAt ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date(data.createdAt)) : "اليوم",
            };
          });
          setItems((prev) => {
            const map = new Map(prev.map((p) => [p.id, p]));
            cloud.forEach((c) => map.set(c.id, c));
            const merged = Array.from(map.values());
            saveAdminSectionData("referrals", merged);
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  const updateRef = async (id: string, approve: boolean) => {
    const nextStatus: AdminRecordItem["status"] = approve ? "معتمدة" : "مرفوضة";
    const next = items.map((it) => it.id === id ? { ...it, status: nextStatus } : it);
    setItems(next);
    saveAdminSectionData("referrals", next);
    if (auth.currentUser) {
      await setDoc(doc(db, "referrals", id), { status: nextStatus, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    }
    recordAdminAudit(approve ? "صرف مكافأة إحالة" : "رفض إحالة", "برنامج شارك واربح", `${id} -> ${nextStatus}`);
    toastMessage(approve ? "تم اعتماد وصرف مكافأة 1,000 ر.ي" : "تم رفض طلب الإحالة");
  };

  const approvedCount = items.filter((i) => i.status === "معتمدة" || i.status === "نشط").length;
  const pendingCount = items.filter((i) => i.status === "قيد المراجعة").length;

  return <div className="referral-admin"><div className="admin-stats"><Stat label="الإحالات المسجلة" value={String(items.length)} /><Stat label="قيد المراجعة" value={String(pendingCount)} /><Stat label="المؤهلة والمعتمدة" value={String(approvedCount)} /><Stat label="المدفوعات المعتمدة" value={`${(approvedCount * 1000).toLocaleString()} ر.ي`} /></div><section className="admin-card"><h2>قاعدة الاستحقاق المعتمدة</h2><div className="referral-rule"><Gift /><div><b>1,000 ريال يمني فقط</b><p>بعد تسجيل منشأة من رابط الإحالة، واعتمادها من الإدارة، ثم نشر أول منتج صالح. تُحتسب مرة واحدة لكل منشأة.</p></div></div></section><section className="admin-card"><div className="panel-heading"><div><ClipboardList /><h2>طلبات الإحالات والمدفوعات</h2></div><span>{items.length} سجل</span></div>{items.length ? <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>{items.map((it) => <article key={it.id} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #e5ece8", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}><div><b>{it.title}</b><div style={{ fontSize: "12px", color: "#555" }}>{it.detail} · {it.date}</div></div><div style={{ display: "flex", gap: "6px", alignItems: "center" }}><span className="status">{it.status}</span>{it.status === "قيد المراجعة" && <><Button kind="gold" onClick={() => updateRef(it.id, true)}>اعتماد 1,000 ر.ي</Button><Button kind="outline" onClick={() => updateRef(it.id, false)}>رفض</Button></>}</div></article>)}</div> : <div className="empty compact-empty"><AlertTriangle /><h3>لا توجد طلبات إحالات بعد</h3></div>}</section></div>;
}

function ActivityImageAdmin() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bannerDrafts, setBannerDrafts] = useState<Record<string, string>>({});
  const [remittanceImageUrl, setRemittanceImageUrl] = useState<string>("/assets/activity-banners/exchange.jpg");
  const [uploadingRemittance, setUploadingRemittance] = useState(false);
  const [uploadingActivity, setUploadingActivity] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrafts(loadActivityImages());
    setBannerDrafts(loadActivityBanners());
    async function loadImagesFromFirestore() {
      try {
        const docSnap = await getDoc(doc(db, "settings", "remittanceHero"));
        if (docSnap.exists() && docSnap.data()?.imageUrl) {
          setRemittanceImageUrl(docSnap.data().imageUrl);
        }
        const actSnap = await getDoc(doc(db, "settings", "activityImages"));
        if (actSnap.exists()) {
          const data = actSnap.data() as any;
          if (data.cards) setDrafts((prev) => ({ ...prev, ...data.cards }));
          if (data.banners) setBannerDrafts((prev) => ({ ...prev, ...data.banners }));
        }
      } catch (err) {
        console.error("Failed to load activity images:", err);
      }
    }
    loadImagesFromFirestore();
  }, []);

  const handleRemittanceImagePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toastMessage("اختر ملف صورة صالحًا");
    if (file.size > 15_000_000) return toastMessage("حجم الصورة يتجاوز 15MB");

    setUploadingRemittance(true);
    try {
      const storageRef = ref(storage, `remittance/hero_${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      await setDoc(doc(db, "settings", "remittanceHero"), {
        imageUrl: downloadUrl,
        updatedAt: new Date().toISOString(),
        adminEmail: "majdaltrki8@gmail.com",
      }, { merge: true });

      setRemittanceImageUrl(downloadUrl);
      toastMessage("تم رفع وتغيير الصورة الرئيسية لقسم الاستعلام عن الحوالات وحفظها في Firebase بنجاح");
    } catch (err: any) {
      toastMessage(`فشل رفع الصورة: ${err.message || "خطأ غير معروف"}`);
    } finally {
      setUploadingRemittance(false);
    }
  };

  const pick = async (id: string, target: "card" | "banner", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toastMessage("اختر ملف صورة صالحًا");
    if (file.size > 8_000_000) return toastMessage("الحد الأقصى 8MB للصورة");
    setUploadingActivity(`${target}-${id}`);
    try {
      const res = await uploadImageWithFallback(file, `brand/activities/${target}_${id}_${Date.now()}_${file.name}`);
      if (target === "card") setDrafts((current) => ({ ...current, [id]: res.url }));
      else setBannerDrafts((current) => ({ ...current, [id]: res.url }));
      toastMessage(res.cloud ? "تم رفع الصورة على Firebase Storage. اضغط حفظ لنشرها." : "تم تجهيز الصورة. اضغط حفظ لنشرها.");
    } catch (err: any) {
      toastMessage(err?.message || "تعذر تجهيز الصورة");
    } finally {
      setUploadingActivity("");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      safeStorage.setItem(activityImageStorageKey, JSON.stringify(drafts));
      safeStorage.setItem(activityBannerStorageKey, JSON.stringify(bannerDrafts));
      if (auth.currentUser) {
        await setDoc(doc(db, "settings", "activityImages"), {
          cards: drafts,
          banners: bannerDrafts,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, "settings/activityImages"));
      }
      window.dispatchEvent(new Event("yafa-activity-images"));
      window.dispatchEvent(new Event("yafa-activity-banners"));
      recordAdminAudit("تحديث صور الأنشطة", "إدارة الصور", "نشر صور بطاقات وبنرات الأنشطة للزوار");
      toastMessage("تم نشر صور البطاقات والبنرات لجميع الزوار بنجاح");
    } catch {
      toastMessage("فشل الحفظ: مساحة التخزين غير كافية");
    } finally {
      setSaving(false);
    }
  };

  return <div className="activity-admin">
    <div className="alert success"><ShieldCheck /> لوحة إدارة صور الأنشطة وقسم الحوالات متصلة بـ Firebase Storage & Firestore.</div>

    <article style={{ background: "white", border: "2px solid var(--gold)", borderRadius: "18px", padding: "18px", marginBottom: "20px", boxShadow: "0 8px 24px rgba(6,75,61,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "17px", color: "var(--forest)", fontWeight: 800 }}>قسم الاستعلام عن الحوالات (الصورة الرئيسية)</h2>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: "11px" }}>ارفع صورة جديدة بجودة عالية (تظهر بزوايا دائرية وبعرض القسم بالكامل دون قص مشوه)</p>
        </div>
        <label className="btn btn-gold" style={{ cursor: uploadingRemittance ? "wait" : "pointer" }}>
          <Upload /> {uploadingRemittance ? "جارٍ الرفع..." : "تغيير الصورة"}
          <input hidden type="file" accept="image/*" onChange={handleRemittanceImagePick} disabled={uploadingRemittance} />
        </label>
      </div>
      <div style={{ width: "100%", height: "180px", borderRadius: "14px", overflow: "hidden", position: "relative", border: "1px solid #ddd", background: "#f2f5f3" }}>
        <img src={remittanceImageUrl} alt="معاينة قسم الاستعلام عن الحوالات" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </article>

    <div className="carousel-admin-toolbar"><div><b>صور بطاقات وبنرات الأنشطة</b><p>صورة البطاقة وصورة البنر مستقلتان، وتُنشر للزوار فور الضغط على حفظ.</p></div><Button onClick={save} disabled={saving}>{saving ? <><span className="spinner" /> جارٍ الحفظ...</> : <><Check /> حفظ ونشر الصور</>}</Button></div>
    <div className="activity-admin-grid">{homeActivities.map((activity) => <article key={activity.id}><div className="activity-admin-previews"><figure><img src={drafts[activity.id] || activity.image} alt={`معاينة بطاقة ${activity.name}`} /><figcaption>صورة البطاقة</figcaption><label className="btn btn-outline"><Upload /> {uploadingActivity === `card-${activity.id}` ? "جارٍ الرفع..." : "تغيير"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => pick(activity.id, "card", event)} /></label></figure><figure className="banner-preview"><img src={bannerDrafts[activity.id] || activity.banner} alt={`معاينة بنر ${activity.name}`} /><figcaption>بنر 16:9</figcaption><label className="btn btn-outline"><Upload /> {uploadingActivity === `banner-${activity.id}` ? "جارٍ الرفع..." : "تغيير البنر"}<input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => pick(activity.id, "banner", event)} /></label></figure></div><div><b>{activity.name}</b><code>{activity.path}</code></div></article>)}</div>
  </div>;
}

function CarouselAdmin() {
  const [drafts, setDrafts] = useState<CarouselAd[]>(() => [...defaultCarouselAds].sort((a, b) => a.order - b.order));
  const [publishing, setPublishing] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  useEffect(() => {
    setDrafts(loadPublishedAds().sort((a, b) => a.order - b.order));
  }, []);
  const update = (id: number, patch: Partial<CarouselAd>) => setDrafts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= drafts.length) return;
    const next = [...drafts];
    [next[index], next[destination]] = [next[destination], next[index]];
    setDrafts(next.map((item, itemIndex) => ({ ...item, order: itemIndex + 1 })));
  };
  const addAd = () => {
    const newId = Date.now();
    const newAd: CarouselAd = {
      id: newId,
      title: `إعلان جديد ${drafts.length + 1}`,
      description: "عروض ومنتجات حصرية في يافع ون",
      image: hero,
      route: "/visitor/stores",
      active: true,
      order: drafts.length + 1,
      startsAt: "",
      endsAt: "",
    };
    setDrafts([...drafts, newAd]);
    toastMessage("تمت إضافة موضع إعلان جديد، يمكنك الآن تعديل بياناته ونشره");
  };
  const removeAd = (id: number) => {
    if (drafts.length <= 1) return toastMessage("يجب الإبقاء على إعلان واحد على الأقل");
    setDrafts(drafts.filter((item) => item.id !== id).map((item, idx) => ({ ...item, order: idx + 1 })));
    toastMessage("تم حذف موضع الإعلان من المسودة");
  };
  const upload = async (id: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toastMessage("فشل الرفع: اختر ملف صورة صالحاً");
    if (file.size > 8_000_000) return toastMessage("فشل الرفع: الحد الأقصى للصورة 8MB");
    setUploadingId(id);
    try {
      const res = await uploadImageWithFallback(file, `brand/carousel/ad_${id}_${Date.now()}_${file.name}`);
      update(id, { image: res.url });
      toastMessage("تم تحديث صورة الإعلان. اضغط «حفظ ونشر التغييرات» لاعتماده للزوار");
    } catch (err: any) {
      toastMessage(err?.message || "تعذرت قراءة أو رفع الصورة");
    } finally {
      setUploadingId(null);
    }
  };
  const publish = async () => {
    if (drafts.some((ad) => !safeAdRoutes.some(([, path]) => path === ad.route))) return toastMessage("فشل النشر: يوجد رابط غير آمن للزائر");
    if (drafts.some((ad) => ad.startsAt && ad.endsAt && ad.startsAt > ad.endsAt)) return toastMessage("فشل النشر: تاريخ النهاية يسبق تاريخ البداية");
    setPublishing(true);
    try {
      safeStorage.setItem(carouselStorageKey, JSON.stringify(drafts));
      if (auth.currentUser) {
        await setDoc(doc(db, "settings", "carousel"), {
          items: drafts,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch((err) => logFirestoreError(err, OperationType.WRITE, "settings/carousel"));
      }
      window.dispatchEvent(new Event("yafa-carousel-published"));
      recordAdminAudit("نشر الإعلانات المتحركة", "الإعلانات المتحركة", `نشر ${drafts.length} إعلانات على الصفحة الرئيسية`);
      toastMessage("تم نشر الإعلانات وإظهارها للزوار بنجاح");
    } catch {
      toastMessage("فشل النشر: مساحة التخزين غير كافية");
    } finally {
      setPublishing(false);
    }
  };
  return <div className="carousel-admin">
    <div className="alert success"><ShieldCheck /> النشر يحفظ السلايدر في Firebase Firestore والتخزين المحلي ليظهر فوراً لجميع الزوار.</div>
    <div className="carousel-admin-toolbar">
      <div><b>{drafts.length} مواضع إعلانية</b><p>لن تُطبق المسودات على واجهة الزائر حتى الضغط على نشر.</p></div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Button kind="gold" onClick={addAd}><Plus /> إضافة موضع إعلان</Button>
        <Button onClick={publish} disabled={publishing}>{publishing ? <><span className="spinner" /> جارٍ النشر...</> : <><Check /> حفظ ونشر التغييرات</>}</Button>
      </div>
    </div>
    {drafts.map((ad, index) => <article className="carousel-editor" key={ad.id}>
      <div className="carousel-editor-preview"><img src={ad.image} alt={`معاينة ${ad.title}`} /><label className="btn btn-outline"><Upload /> {uploadingId === ad.id ? "جارٍ الرفع..." : "تغيير الصورة"}<input hidden type="file" accept="image/*" onChange={(event) => upload(ad.id, event)} disabled={uploadingId === ad.id} /></label></div>
      <div className="carousel-editor-fields">
        <div className="editor-title"><b>الإعلان {index + 1}</b><label className="toggle"><input type="checkbox" checked={ad.active} onChange={(event) => update(ad.id, { active: event.target.checked })} /><span />{ad.active ? "مفعّل" : "متوقف"}</label></div>
        <label>العنوان<input value={ad.title} onChange={(event) => update(ad.id, { title: event.target.value })} /></label>
        <label>الوصف<input value={ad.description} onChange={(event) => update(ad.id, { description: event.target.value })} /></label>
        <label>القسم المرتبط<select value={ad.route} onChange={(event) => update(ad.id, { route: event.target.value })}>{safeAdRoutes.map(([name, path]) => <option key={path} value={path}>{name} — {path}</option>)}</select></label>
        <div className="form-grid"><label>تاريخ البداية<input type="date" value={ad.startsAt} onChange={(event) => update(ad.id, { startsAt: event.target.value })} /></label><label>تاريخ النهاية<input type="date" value={ad.endsAt} onChange={(event) => update(ad.id, { endsAt: event.target.value })} /></label></div>
        <div className="reorder-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button kind="outline" onClick={() => move(index, -1)} disabled={index === 0}>تحريك للأعلى</Button>
          <Button kind="outline" onClick={() => move(index, 1)} disabled={index === drafts.length - 1}>تحريك للأسفل</Button>
          <Button kind="outline" onClick={() => removeAd(ad.id)} disabled={drafts.length <= 1}><Trash2 /> حذف</Button>
        </div>
      </div>
    </article>)}
  </div>;
}

function AdminHeader({ title, subtitle }: { title: string; subtitle: string }) { return <div className="admin-header"><span className="eyebrow">لوحة الإدارة العامة · يافع ون</span><h1>{title}</h1><p>{subtitle}</p></div>; }
function AdminTable({ rows, onAction }: { rows: string[][]; onAction: () => void }) { return <div className="data-table"><div className="table-head"><b>#</b><b>الاسم / الرقم</b><b>التفاصيل</b><b>النوع</b><b>الحالة</b><b>الإجراء</b></div>{rows.map((row, i) => <div className="table-row" key={i}><span>{String(i + 1).padStart(2, "0")}</span>{row.map((cell, x) => <span key={x} className={x === row.length - 1 ? "status" : ""}>{cell}</span>)}<span className="row-actions"><button onClick={() => toastMessage("تم فتح التفاصيل")}><Eye /></button><button onClick={onAction}><Pencil /></button><button onClick={() => toastMessage("فشل الإجراء: يتطلب تأكيداً وصلاحية خلفية")}><Trash2 /></button></span></div>)}</div>; }
function Charts() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    let localOrders: any[] = [];
    try {
      localOrders = JSON.parse(safeStorage.getItem("yafa-orders") || "[]");
    } catch {
      localOrders = [];
    }
    const adminOrders = loadAdminSectionData("orders");
    if (localOrders.length) setOrders(localOrders);
    else if (adminOrders.length) setOrders(adminOrders);

    if (auth.currentUser) {
      getDocs(collection(db, "orders"))
        .then((snap) => {
          if (!snap.empty) {
            setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          }
        })
        .catch(() => {});
    }
  }, []);

  const totalOrders = orders.length;
  const cashCount = orders.filter((o) => String(o.paymentMethod || o.detail || "").includes("نقد")).length;
  const electronicCount = Math.max(0, totalOrders - cashCount);
  const cashPct = totalOrders > 0 ? Math.round((cashCount / totalOrders) * 100) : 0;
  const elecPct = totalOrders > 0 ? 100 - cashPct : 0;

  const bars = useMemo(() => {
    if (!totalOrders) return [0, 0, 0, 0, 0, 0];
    const completed = orders.filter((o) => o.status === "مكتمل" || o.status === "completed" || o.status === "نشط").length;
    const pending = orders.filter((o) => o.status === "قيد الانتظار" || o.status === "pending" || o.status === "قيد المراجعة").length;
    const preparing = orders.filter((o) => o.status === "قيد التجهيز").length;
    const delivering = orders.filter((o) => o.status === "جاري التوصيل").length;
    const cancelled = orders.filter((o) => o.status === "ملغي" || o.status === "cancelled" || o.status === "متوقف").length;
    const counts = [totalOrders, pending, preparing, delivering, completed, cancelled];
    const max = Math.max(1, ...counts);
    return counts.map((c) => Math.max(8, Math.round((c / max) * 100)));
  }, [orders, totalOrders]);

  return (
    <section className="chart-grid">
      <div className="admin-card">
        <h2>إحصائيات الطلبات الفعلية</h2>
        {totalOrders > 0 ? (
          <div className="fake-chart">
            {bars.map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-6 text-center">لا توجد طلبات مسجلة لعرض الرسم البياني بعد.</p>
        )}
      </div>
      <div className="admin-card">
        <h2>توزيع طرق الدفع</h2>
        <div className="donut">
          <span>
            {totalOrders.toLocaleString()}
            <small>طلب</small>
          </span>
        </div>
        <div className="legend">
          <span>نقدي {cashPct}%</span>
          <span>إلكتروني {elecPct}%</span>
        </div>
      </div>
    </section>
  );
}
function downloadReport(type: "pdf" | "excel", rows?: string[][], filenameBase = "yafa-one-report") {
  if (type === "pdf") {
    if (typeof window !== "undefined") {
      toastMessage("جارٍ فتح نافذة الطباعة وحفظ PDF...");
      window.print();
    }
    return;
  }
  const safeRows = rows && rows.length ? rows : [["#", "البند", "القيمة"], ["1", "إجمالي المنتجات", String(loadOwnerProducts().length)]];
  const csv = safeRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toastMessage("تم تصدير التقرير بصيغة Excel/CSV بنجاح");
}

const crosswalk = [
  ["01", "1", "مدخل الأدوار", "/entry", "مكتمل"], ["01", "2", "تسجيل الدخول العام", "/auth/owner-login", "جوال وكلمة مرور + واتساب OTP"], ["01", "3", "دخول صاحب المنشأة", "/auth/owner-login", "مكتمل"], ["01", "4", "إنشاء حساب مالك", "/owner/signup", "مكتمل"], ["01", "5", "بيانات المنشأة", "/owner/establishment", "مكتمل"], ["01", "6", "تم إرسال الطلب", "/owner/submitted", "مكتمل"],
  ["02", "1", "لوحة المالك", "/owner/dashboard", "مكيّف لبيانات متجره"], ["02", "2", "منتجات المنشأة", "/owner/products", "مكتمل"], ["02", "3", "إضافة صنف", "/owner/product/new", "مكتمل"], ["02", "4", "بيانات المنشأة", "/owner/setup", "مكتمل"], ["02", "5", "ترتيب المتجر", "/owner/sections", "مكتمل"], ["02", "6", "مشاركة المتجر", "/owner/share", "مكتمل"],
  ["03", "1", "لوحة الإدارة", "/admin/dashboard", "مكتمل"], ["03", "2", "المستخدمون", "/admin/users", "مكتمل"], ["03", "3", "المتاجر والأقسام", "/admin/stores", "مكتمل"], ["03", "4", "الطلبات - جوال", "/admin/orders", "مكتمل"], ["03", "5", "إحصائيات الإدارة", "/admin/reports", "مكتمل"], ["03", "6", "المستخدمون - واسع", "/admin/users", "متجاوب"], ["03", "7", "المنشآت - واسع", "/admin/establishments", "متجاوب"], ["03", "8", "الأدوار والإعدادات", "/admin/roles", "مكتمل"], ["03", "9", "مكتبة صور التطبيق", "/admin/media", "مكتمل"], ["03", "10", "الطلبات - واسع", "/admin/orders", "متجاوب"], ["03", "11", "الصرف والتسويات", "/admin/settlements", "مكتمل"], ["03", "12", "التقارير والتصدير", "/admin/reports", "مكتمل"], ["03", "13", "الإعلانات", "/admin/ads", "مكتمل"],
  ["04", "1", "الرئيسية", "/visitor/home", "مكتمل"], ["04", "2", "دليل المتاجر", "/visitor/stores", "مكتمل"], ["04", "3", "الغذاء والبقالة", "/visitor/groceries", "مكتمل"], ["04", "4", "المطاعم", "/visitor/restaurants", "مكتمل"], ["04", "5", "الإلكترونيات", "/visitor/electronics", "مكتمل"], ["04", "6", "الموضة", "/visitor/fashion", "مكتمل"], ["04", "7", "الأثاث", "/visitor/furniture", "مكتمل"], ["04", "8", "مواد البناء", "/visitor/building", "مكتمل"], ["04", "9", "الألمنيوم والزجاج", "/visitor/aluminum", "مكتمل"], ["04", "10", "الخدمات", "/visitor/services", "مكتمل"], ["04", "11", "السيارات والعقارات", "/visitor/vehicles", "مكتمل"], ["04", "12", "معارض السيارات", "/visitor/dealers", "مكتمل"], ["04", "13", "العقارات والأراضي", "/visitor/property", "مكتمل"], ["04", "14", "شارك واربح", "/visitor/share", "مكيّف لقاعدة 1,000 ر.ي"], ["04", "15", "الوقود والخريطة", "/visitor/fuel", "مكتمل"],
] as const;

function Audit() {
  return <main className="audit-page"><TopBar back="/" /><AdminHeader title="خريطة الشاشات والمسارات" subtitle="تدقيق جميع صفحات ملفات PDF الأربعة بالترتيب — 40 من 40" /><div className="alert success"><Check /> لم يتم تخطي أي صفحة مرجعية. أضيفت أيضاً مسارات السلة والطلبات والمفضلة والإشعارات لتغطية المتطلبات الوظيفية.</div><div className="audit-grid">{crosswalk.map(([pdf, page, name, path, status]) => <button key={`${pdf}-${page}`} onClick={() => route(path)}><b>PDF {pdf} · صفحة {page}</b><strong>{name}</strong><code>{path}</code><span>{status}</span></button>)}</div><section className="panel qa"><h2>قائمة QA اليدوية</h2>{["393×852: لا يوجد تمرير أفقي وأهداف اللمس 44px على الأقل", "كل أزرار التنقل والفلاتر والحوارات والإضافة والتعديل والحذف لها سلوك ظاهر", "الزائر لا يصل إلى /admin أو /owner؛ المالك لا يرى بيانات منصة أو منشآت أخرى", "رجوع معاينة المالك إلى /owner/dashboard والخروج إلى /auth/owner-login", "الدخول برقم الجوال وكلمة المرور مع التحقق بواتساب OTP عند التسجيل واستعادة كلمة المرور", "رفع صورة المنتج يعرض معاينة؛ ترتيب الأقسام يدعم السحب والإفلات", "حالات التحميل والفارغ والنجاح والفشل وغير المصرح تظهر في النموذج", "العمولة 0% (مجاناً)؛ تتبع نقدي/إلكتروني؛ YER/SAR/USD في التقارير", "مكافأة الإحالة 1,000 YER بعد الاعتماد ونشر أول منتج صالح فقط", "أفعال الإدارة موسومة بوضوح بأنها تحتاج صلاحيات خلفية في الإنتاج"].map(x => <label key={x}><input type="checkbox" />{x}</label>)}</section></main>;
}

function PortalGate({ portal, path }: { portal: "owner" | "admin"; path: string }) {
  const isOwner = portal === "owner";
  const loginPath = isOwner ? `/auth/owner-login?return=${encodeURIComponent(path)}` : `/auth/admin-login?return=${encodeURIComponent(path)}`;
  return <main className="state-page" style={{ padding: "40px 20px", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
    <div style={{ background: "rgba(199, 148, 44, 0.12)", color: "#c7942c", width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
      <ShieldCheck style={{ width: "32px", height: "32px" }} />
    </div>
    <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "8px" }}>
      {isOwner ? "بوابة صاحب المنشأة محمية" : "بوابة الإدارة العامة محمية"}
    </h1>
    <p style={{ color: "#666", lineHeight: 1.6, marginBottom: "24px" }}>
      {isOwner
        ? "للوصول إلى لوحة تحكم المنشأة وإدارة المنتجات والطلبات، يرجى تسجيل الدخول بحساب مالك معتمد."
        : "منطقة مخصصة للإدارة العامة للمنصة فقط. تتطلب صلاحيات وصول إدارية مؤكدة."}
    </p>
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      <Button kind="gold" onClick={() => route(loginPath)}>
        <LockKeyhole /> {isOwner ? "تسجيل دخول صاحب منشأة" : "تسجيل دخول الإدارة"}
      </Button>
      {isOwner && <Button kind="outline" onClick={() => route("/owner/signup")}>
        <Store /> تسجيل حساب منشأة جديدة
      </Button>}
      <Button kind="ghost" onClick={() => route("/")}>
        <ChevronLeft /> العودة لبوابة الزائر الرئيسية
      </Button>
    </div>
  </main>;
}
function Unauthorized() { return <main className="state-page"><LockKeyhole /><h1>غير مصرح</h1><p>هذا المسار محمي بدور مختلف. التوجيه في المعاينة محلي فقط.</p><Button onClick={() => route("/")}>العودة إلى الدخول</Button></main>; }
function Empty({ title, action }: { title: string; action: () => void }) { return <div className="empty"><Box /><h3>{title}</h3><p>هذه حالة فارغة تجريبية.</p><Button kind="outline" onClick={action}>استعادة البيانات</Button></div>; }
function Loading() { return <div className="empty"><span className="spinner dark" /><h3>جارٍ التحميل...</h3></div>; }
function Modal({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) { return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={close}><X /></button><h2>{title}</h2>{children}</div></div>; }

const reviewGroups = [
  {
    title: "تسجيل الدخول والتهيئة",
    role: null,
    screens: [
      ["01", "مدخل البوابات", "/entry"],
      ["02", "دخول الزائر الاختياري", "/auth/visitor-login"],
      ["03", "دخول صاحب المنشأة", "/auth/owner-login"],
      ["04", "دخول الإدارة", "/auth/admin-login"],
      ["05", "إنشاء حساب منشأة", "/owner/signup"],
      ["06", "بيانات المنشأة", "/owner/establishment"],
      ["07", "مراجعة الطلب", "/owner/submitted"],
    ],
  },
  {
    title: "بوابة الزائر",
    role: null,
    screens: [
      ["08", "الرئيسية", "/visitor/home"],
      ["09", "دليل المتاجر", "/visitor/stores"],
      ["10", "الغذاء والبقالة", "/visitor/groceries"],
      ["11", "المطاعم والمقاهي", "/visitor/restaurants"],
      ["12", "الإلكترونيات", "/visitor/electronics"],
      ["13", "الملابس والأحذية", "/visitor/fashion"],
      ["14", "الأثاث والمفروشات", "/visitor/furniture"],
      ["15", "مواد البناء", "/visitor/building"],
      ["16", "الألمنيوم والزجاج", "/visitor/aluminum"],
      ["17", "الخدمات", "/visitor/services"],
      ["18", "الصحة", "/visitor/health"],
      ["19", "الصيدليات", "/visitor/pharmacies"],
      ["20", "مكاتب الخدمات", "/visitor/offices"],
      ["21", "الورش والصيانة", "/visitor/maintenance"],
      ["22", "الصرافة والتحويلات", "/visitor/exchange"],
      ["23", "السيارات والعقارات", "/visitor/vehicles"],
      ["24", "معارض السيارات", "/visitor/dealers"],
      ["25", "العقارات والأراضي", "/visitor/property"],
      ["26", "السوق المستعمل", "/visitor/used"],
      ["27", "إنشاء إعلان مستعمل", "/visitor/used/new"],
      ["28", "أسعار الصرف", "/visitor/exchange-rates"],
      ["29", "الاستعلام عن الحوالات", "/visitor/remittance"],
      ["30", "الوقود والخريطة", "/visitor/fuel"],
      ["31", "شارك واربح", "/visitor/share"],
      ["32", "البحث والتصفية", "/visitor/search?q=يافع"],
      ["33", "السلة", "/visitor/cart"],
      ["34", "الطلبات", "/visitor/orders"],
      ["35", "المفضلة", "/visitor/favorites"],
      ["36", "المحادثات", "/visitor/chats"],
      ["37", "الإشعارات", "/visitor/notifications"],
      ["38", "تفاصيل متجر", "/visitor/store/1"],
      ["39", "تفاصيل منتج", "/visitor/product/1"],
    ],
  },
  {
    title: "بوابة صاحب المنشأة",
    role: "owner",
    screens: [
      ["40", "لوحة المنشأة", "/owner/dashboard"],
      ["41", "المنتجات", "/owner/products"],
      ["42", "إضافة وتعديل منتج", "/owner/product/new"],
      ["43", "بيانات المنشأة", "/owner/setup"],
      ["44", "ترتيب الأقسام", "/owner/sections"],
      ["45", "مشاركة المتجر", "/owner/share"],
      ["46", "طلبات المتجر", "/owner/orders"],
      ["47", "معاينة المتجر", "/owner/preview"],
      ["48", "تقارير المنشأة ومؤشرات الأداء", "/owner/reports"],
    ],
  },
  {
    title: "بوابة الإدارة",
    role: "admin",
    screens: [
      ["50", "لوحة الإدارة", "/admin/dashboard"],
      ["51", "المستخدمون", "/admin/users"],
      ["52", "المنشآت", "/admin/establishments"],
      ["53", "المتاجر والفئات", "/admin/stores"],
      ["54", "الطلبات", "/admin/orders"],
      ["55", "الإعلانات", "/admin/ads"],
      ["56", "الإعلانات المتحركة", "/admin/carousel"],
      ["57", "مكتبة الصور", "/admin/media"],
      ["58", "صور الأنشطة", "/admin/activity-images"],
      ["59", "الأدوار والصلاحيات", "/admin/roles"],
      ["60", "التسويات المالية", "/admin/settlements"],
      ["61", "إدارة أسعار الصرف", "/admin/exchange-rates"],
      ["62", "التقارير والتحليلات", "/admin/reports"],
      ["63", "الإشعارات", "/admin/notifications"],
      ["64", "الإحالات والمكافآت", "/admin/referrals"],
      ["65", "الإعدادات العامة للسياسات والعمولة", "/admin/settings"],
      ["66", "النسخ الاحتياطي وسجلات الأمان", "/admin/backup"],
      ["67", "إدارة صور التطبيق", "/admin/app-images"],
    ],
  },
] as const;

function ReviewBoard() {
  const [token, setToken] = useState("static-review-token");
  useEffect(() => {
    setToken(crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }, []);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    return reviewGroups
      .filter((g) => selectedGroup === "all" || g.title === selectedGroup)
      .map((g) => {
        const screens = g.screens.filter(
          ([num, name, screenPath]) =>
            !query.trim() ||
            num.includes(query) ||
            name.toLowerCase().includes(query.toLowerCase()) ||
            screenPath.toLowerCase().includes(query.toLowerCase())
        );
        return { ...g, screens };
      })
      .filter((g) => g.screens.length > 0);
  }, [selectedGroup, query]);

  const handleOpenPage = (screenPath: string, targetRole: Role) => {
    if (targetRole) {
      safeStorage.setItem("yafa-role", targetRole);
      if (typeof document !== "undefined") {
        document.cookie = `yafa-role=${targetRole}; path=/; SameSite=Lax`;
      }
    }
    route(screenPath);
  };

  return <main className="review-board" dir="rtl">
    <header className="review-board-header">
      <div>
        <span className="eyebrow">وضع المراجعة الشاملة</span>
        <h1>لوحة جميع صفحات يافع ون (61 شاشة)</h1>
        <p>معاينة لكافة شاشات وبوابات المنصة. يمكنك تصفية الشاشات بحسب البوابة أو فتح أي شاشة واختبارها مباشرة في وضع ملء الشاشة.</p>
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <Button kind="gold" onClick={() => route("/")}>
          <ChevronLeft /> العودة لتطبيق الزائر
        </Button>
      </div>
    </header>

    <div style={{ margin: "16px 0", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button
          className={`btn ${selectedGroup === "all" ? "btn-gold" : "btn-outline"}`}
          onClick={() => setSelectedGroup("all")}
          style={{ padding: "6px 14px", fontSize: "12px" }}
        >
          الكل (61)
        </button>
        {reviewGroups.map((g) => (
          <button
            key={g.title}
            className={`btn ${selectedGroup === g.title ? "btn-gold" : "btn-outline"}`}
            onClick={() => setSelectedGroup(g.title)}
            style={{ padding: "6px 14px", fontSize: "12px" }}
          >
            {g.title} ({g.screens.length})
          </button>
        ))}
      </div>
      <div style={{ minWidth: "240px", flex: 1, maxWidth: "380px" }}>
        <div className="search-row" style={{ margin: 0 }}>
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث برقم الشاشة أو الاسم أو المسار..."
          />
        </div>
      </div>
    </div>

    {filteredGroups.length ? (
      filteredGroups.map((group) => (
        <section className="review-group" key={group.title}>
          <div className="review-group-title">
            <h2>{group.title}</h2>
            <span>{group.screens.length} شاشات</span>
          </div>
          <div className="review-phone-grid">
            {group.screens.map(([number, name, screenPath]) => {
              const source = screenPath;
              return (
                <article className="review-card" key={number}>
                  <div className="review-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                    <div>
                      <b>{number}</b>
                      <span>{name}</span>
                      <code>{screenPath}</code>
                    </div>
                    <button
                      className="btn btn-outline"
                      style={{ padding: "4px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      onClick={() => handleOpenPage(screenPath, group.role as Role)}
                    >
                      <Eye style={{ width: "13px", height: "13px" }} /> فتح واختبار
                    </button>
                  </div>
                  <div className="review-phone">
                    <div className="review-speaker" />
                    <iframe
                      title={`${number} — ${name}`}
                      src={source}
                      loading="lazy"
                      tabIndex={-1}
                      sandbox="allow-scripts allow-same-origin allow-forms"
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))
    ) : (
      <div className="empty" style={{ margin: "40px auto", maxWidth: "400px" }}>
        <Box />
        <h3>لا توجد شاشات مطابقة لبحثك</h3>
        <p>جرب البحث بكلمة أخرى أو قم بإلغاء التصفية.</p>
        <Button kind="outline" onClick={() => { setQuery(""); setSelectedGroup("all"); }}>عرض جميع الشاشات</Button>
      </div>
    )}
  </main>;
}

function VisitorNotificationsPage() {
  const [notifications, setNotifications] = useState<AdminRecordItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    setNotifications(
      loadAdminSectionData("notifications").filter((n) => n.status === "نشط" || n.status === "معتمدة"),
    );
    try {
      setOrders(JSON.parse(safeStorage.getItem("yafa-orders") || "[]"));
    } catch {
      setOrders([]);
    }
    getDocs(collection(db, "notifications"))
      .then((snap) => {
        if (!snap.empty) {
          const cloud: AdminRecordItem[] = snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              title: data.title || "إشعار",
              detail: data.detail || data.body || "",
              status: data.status || "نشط",
              date: data.date || "اليوم",
            };
          });
          setNotifications((prev) => {
            const map = new Map(prev.map((n) => [n.id, n]));
            cloud.forEach((n) => map.set(n.id, n));
            return Array.from(map.values()).filter((n) => n.status === "نشط" || n.status === "معتمدة");
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <VisitorShell>
      <ScenicHero slotId="notifications_banner" title="الإشعارات" subtitle="آخر تحديثات الطلبات والعروض وأسعار الصرف" />
      <div className="panel" style={{ display: "grid", gap: "10px" }}>
        {orders.slice(0, 3).map((o) => (
          <div className="alert" key={o.id} style={{ cursor: "pointer" }} onClick={() => route("/visitor/orders")}>
            <Package />
            <div>
              <b>تحديث طلب #{o.id}</b>
              <div style={{ fontSize: "12px" }}>الحالة الحالية: {o.status} · الإجمالي: {Number(o.total || 0).toLocaleString()} ر.ي</div>
            </div>
          </div>
        ))}
        {notifications.length ? notifications.map((n) => (
          <div className="alert success" key={n.id}>
            <Bell />
            <div>
              <b>{n.title}</b>
              <div style={{ fontSize: "12px" }}>{n.detail}</div>
              <small style={{ fontSize: "11px", opacity: 0.75 }}>{n.date}</small>
            </div>
          </div>
        )) : (
          <div className="empty compact-empty">
            <Bell />
            <h3>لا توجد إشعارات جديدة</h3>
            <p>ستظهر هنا التنبيهات الرسمية والعروض المعتمدة.</p>
          </div>
        )}
      </div>
    </VisitorShell>
  );
}

const DEFAULT_PROFESSIONAL_SPECIALTIES = [
  "كهربائي",
  "سباك",
  "نجار",
  "حداد",
  "ميكانيكي",
  "دهان ومليس",
  "بناء ومقاولات",
  "فني تكييف وتبريد",
  "أخرى",
];

function VisitorProfessionalsPage() {
  const appImages = useAppImages();
  const banners = useActivityBanners();
  const profBanner = resolveSlotPrimaryImage(
    appImages,
    "activity_banner_professionals",
    banners.professionals || "/assets/activity-banners/maintenance.jpg",
  );
  const defaultAvatar = resolveSlotPrimaryImage(
    appImages,
    "professionals_default_avatar",
    resolveSlotPrimaryImage(appImages, "activity_card_professionals", "/assets/activities/maintenance.jpg"),
  );

  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("الكل");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("الكل");
  const [searchText, setSearchText] = useState<string>("");
  const [cloudPros, setCloudPros] = useState<any[]>([]);
  const [loadingPros, setLoadingPros] = useState<boolean>(true);
  const [registerOpen, setRegisterOpen] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [fullName, setFullName] = useState("");
  const [specialty, setSpecialty] = useState(DEFAULT_PROFESSIONAL_SPECIALTIES[0]);
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState(yafaDistricts[0]);
  const [workLocation, setWorkLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");

  const loadLocalPros = (): any[] => {
    try {
      return JSON.parse(safeStorage.getItem("yafa-professionals-local") || "[]");
    } catch {
      return [];
    }
  };

  useEffect(() => {
    let active = true;
    setLoadingPros(true);
    getDocs(query(collection(db, "professionals"), where("approved", "==", true)))
      .then((snap) => {
        if (!active) return;
        setCloudPros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingPros(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const allProfessionals = useMemo(() => {
    const localOwn = loadLocalPros();
    const map = new Map<string, any>();
    [...cloudPros, ...localOwn].forEach((p) => {
      if (p && p.id) map.set(String(p.id), p);
    });
    return Array.from(map.values());
  }, [cloudPros]);

  const specialtyOptions = useMemo(() => {
    const dynamic = allProfessionals
      .map((p) => String(p.specialty || "").trim())
      .filter(Boolean);
    return Array.from(new Set([...DEFAULT_PROFESSIONAL_SPECIALTIES, ...dynamic]));
  }, [allProfessionals]);

  const filteredProfessionals = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return allProfessionals.filter((pro) => {
      const isVisible = pro.approved === true || pro.localPending === true;
      if (!isVisible) return false;
      const matchesSpecialty =
        selectedSpecialty === "الكل" || String(pro.specialty || "").trim() === selectedSpecialty;
      const matchesDistrict =
        selectedDistrict === "الكل" || String(pro.district || "").trim() === selectedDistrict;
      const matchesSearch =
        !q ||
        String(pro.name || "").toLowerCase().includes(q) ||
        String(pro.specialty || "").toLowerCase().includes(q) ||
        String(pro.workLocation || "").toLowerCase().includes(q);
      return matchesSpecialty && matchesDistrict && matchesSearch;
    });
  }, [allProfessionals, selectedSpecialty, selectedDistrict, searchText]);

  const handleSubmitProfessional = async (e: FormEvent) => {
    e.preventDefault();
    const finalSpecialty = specialty === "أخرى" && customSpecialty.trim() ? customSpecialty.trim() : specialty;
    const cleanPhone = phone.replace(/\s+/g, "");
    if (!fullName.trim() || !finalSpecialty || !cleanPhone || !workLocation.trim()) {
      return toastMessage("يرجى إكمال الاسم والمهنة ورقم الجوال وموقع العمل");
    }
    if (!/^[0-9+]{7,15}$/.test(cleanPhone)) {
      return toastMessage("أدخل رقم جوال صحيحاً");
    }

    setSubmitting(true);
    const profId = `PRO-${Date.now().toString().slice(-6)}`;
    try {
      let avatarUrl = defaultAvatar;
      if (photoFile) {
        const up = await uploadImageWithFallback(photoFile, `professionals/${profId}/avatar_${Date.now()}.webp`);
        avatarUrl = up.url;
      }

      const cloudImageUrl =
        avatarUrl && avatarUrl.length <= 2000 && !avatarUrl.startsWith("data:")
          ? avatarUrl
          : defaultAvatar;

      const record = {
        id: profId,
        name: fullName.trim(),
        specialty: finalSpecialty,
        phone: cleanPhone,
        district,
        workLocation: workLocation.trim(),
        notes: notes.trim(),
        image: cloudImageUrl,
        approved: false,
        active: true,
        status: "قيد المراجعة",
        ownerId: auth.currentUser?.uid || "guest",
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "professionals", profId), record).catch((err) =>
        logFirestoreError(err, OperationType.CREATE, `professionals/${profId}`),
      );

      const currentLocal = loadLocalPros();
      safeStorage.setItem(
        "yafa-professionals-local",
        JSON.stringify([{ ...record, image: avatarUrl, localPending: true }, ...currentLocal]),
      );

      const adminProfs = loadAdminSectionData("professionals");
      saveAdminSectionData("professionals", [
        {
          id: profId,
          title: `${record.name} — ${record.specialty}`,
          detail: `${record.district} · ${record.workLocation} · جوال: ${record.phone}`,
          status: "قيد المراجعة",
          date: new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date()),
        },
        ...adminProfs,
      ]);

      toastMessage("تم تسجيل بياناتك بنجاح! ستظهر للجميع بعد اعتماد الإدارة.");
      setFullName("");
      setCustomSpecialty("");
      setPhone("");
      setWorkLocation("");
      setNotes("");
      setPhotoFile(null);
      setPhotoPreview("");
      setRegisterOpen(false);
    } catch (err: any) {
      toastMessage(err?.message || "تعذر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <VisitorShell>
      <ScenicHero
        title="أصحاب المهن والحرفيون"
        subtitle="دليل الكهربائيين والسباكين والنجارين والمقاولين والمهنيين في مديريات يافع"
        icon={<Wrench />}
        image={profBanner}
        activity
      />

      <div className="panel" style={{ display: "grid", gap: "10px", marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div>
            <b style={{ color: "var(--forest)", fontSize: "14px", display: "block" }}>تصفية حسب التخصص والمديرية</b>
            <small style={{ color: "#666", fontSize: "11px" }}>اختر التخصص لتحديث القائمة تلقائياً، أو سجّل مهنتك مجاناً</small>
          </div>
          <Button kind="gold" onClick={() => setRegisterOpen(true)}>
            <Plus /> سجّل مهنتك مجاناً
          </Button>
        </div>

        <div className="form-grid" style={{ alignItems: "end" }}>
          <label>
            التخصص / المهنة
            <select
              aria-label="تصفية حسب التخصص"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              <option value="الكل">جميع التخصصات</option>
              {specialtyOptions.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          </label>

          <label>
            المديرية
            <select
              aria-label="تصفية حسب المديرية"
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
            >
              <option value="الكل">كل مديريات يافع</option>
              {yafaDistricts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="search-row" style={{ margin: 0 }}>
          <Search />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="ابحث بالاسم أو المهنة أو موقع العمل..."
          />
        </div>
      </div>

      {loadingPros && filteredProfessionals.length === 0 ? (
        <Loading />
      ) : filteredProfessionals.length > 0 ? (
        <div className="store-grid">
          {filteredProfessionals.map((pro) => (
            <article className="store-card" key={pro.id}>
              <img
                src={pro.image || defaultAvatar}
                alt={pro.name}
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = defaultAvatar;
                }}
              />
              <span className="badge">
                {pro.localPending && !pro.approved ? "قيد المراجعة" : pro.specialty}
              </span>
              <div>
                <h3>{pro.name}</h3>
                <p>
                  <Wrench /> {pro.specialty}
                </p>
                <p>
                  <MapPin /> {pro.district} · {pro.workLocation}
                </p>
                {pro.notes && <small style={{ display: "block", color: "#555", marginBottom: "6px" }}>{pro.notes}</small>}
                <div className="card-actions">
                  <Button
                    kind="gold"
                    onClick={() =>
                      route(
                        `https://wa.me/967${String(pro.phone).replace(/^0+/, "")}?text=${encodeURIComponent(
                          `السلام عليكم ${pro.name}، تواصلت معك عبر قسم أصحاب المهن في تطبيق يافع ون بخصوص (${pro.specialty}).`,
                        )}`,
                      )
                    }
                  >
                    <MessageCircle /> واتساب
                  </Button>
                  <Button kind="outline" onClick={() => route(`tel:${pro.phone}`)}>
                    <Phone /> اتصال
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel" style={{ textAlign: "center", padding: "32px 16px" }}>
          <Wrench style={{ width: 38, height: 38, color: "var(--gold)", margin: "0 auto 10px" }} />
          <h3 style={{ margin: "0 0 6px", color: "var(--forest)" }}>لا يوجد مسجلون حالياً في هذا التخصص</h3>
          <p style={{ color: "#666", fontSize: "13px", margin: "0 auto 16px" }}>
            كن أول من يضيف مهنته في هذا التخصص أو غيّر معايير التصفية أعلاه.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              kind="outline"
              onClick={() => {
                setSelectedSpecialty("الكل");
                setSelectedDistrict("الكل");
                setSearchText("");
              }}
            >
              عرض جميع التخصصات
            </Button>
            <Button kind="gold" onClick={() => setRegisterOpen(true)}>
              <Plus /> سجّل مهنتك الآن
            </Button>
          </div>
        </div>
      )}

      {registerOpen && (
        <Modal title="تسجيل صاحب مهنة مجاناً" close={() => setRegisterOpen(false)}>
          <form className="form-panel" onSubmit={handleSubmitProfessional}>
            <label>
              الاسم الكامل *
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="مثال: علي أحمد اليافعي"
                required
              />
            </label>
            <div className="form-grid">
              <label>
                المهنة / التخصص *
                <select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
                  {DEFAULT_PROFESSIONAL_SPECIALTIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                المديرية *
                <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                  {yafaDistricts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {specialty === "أخرى" && (
              <label>
                اكتب تخصصك *
                <input
                  value={customSpecialty}
                  onChange={(e) => setCustomSpecialty(e.target.value)}
                  placeholder="مثال: فني طاقة شمسية"
                  required
                />
              </label>
            )}
            <div className="form-grid">
              <label>
                رقم الجوال / واتساب *
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="77xxxxxxx"
                  required
                />
              </label>
              <label>
                موقع العمل *
                <input
                  value={workLocation}
                  onChange={(e) => setWorkLocation(e.target.value)}
                  placeholder="مثال: سوق لبعوس العام"
                  required
                />
              </label>
            </div>
            <label>
              وصف مختصر للخدمة والخبرة (اختياري)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: تركيب وصيانة الأنظمة الشمسية والكهربائية..."
              />
            </label>
            <label className="upload">
              <Upload />
              <b>صورة شخصية أو صورة العمل (اختياري)</b>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setPhotoFile(f);
                    setPhotoPreview(URL.createObjectURL(f));
                  }
                }}
              />
            </label>
            {photoPreview && <img className="upload-preview" src={photoPreview} alt="معاينة الصورة" />}
            <Button type="submit" kind="gold" disabled={submitting}>
              <Check /> {submitting ? "جارٍ الإرسال..." : "إرسال الطلب للاعتماد"}
            </Button>
          </form>
        </Modal>
      )}
    </VisitorShell>
  );
}

export default function App() {
  const [mounted, setMounted] = useState(false);
  const [path, setPath] = useState("/");
  const [role, setRole] = useState<Role>(null);
  const [showSplash, setShowSplash] = useState(false);
  const [reviewParamsState, setReviewParamsState] = useState<{ isReviewFrame: boolean; reviewRole: Role | null; token: string }>({
    isReviewFrame: false,
    reviewRole: null,
    token: "",
  });

  useEffect(() => {
    setMounted(true);
    const raw = window.location.hash && window.location.hash.startsWith("#/")
      ? window.location.hash.slice(1)
      : window.location.pathname;
    setPath(normalizeAppPath(raw));
    const storedRole = (safeStorage.getItem("yafa-role") as Role) || null;
    setRole(storedRole);

    const searchStr = window.location.search;
    const reviewParams = new URLSearchParams(searchStr);
    const reviewToken = reviewParams.get("reviewToken");
    const isEmbeddedIframe = window.self !== window.top;
    const isReviewFrame = Boolean(reviewToken) && isEmbeddedIframe;
    const reviewRole = isReviewFrame ? (reviewParams.get("reviewRole") as Role) : null;
    setReviewParamsState({ isReviewFrame, reviewRole, token: reviewToken || "" });

    try {
      if (!isReviewFrame && !safeSession.getItem("yafa_splash_shown")) {
        safeSession.setItem("yafa_splash_shown", "1");
        setShowSplash(true);
      }
    } catch {}
  }, []);

  const [sessionVerifiedAdmin, setSessionVerifiedAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    fetch("/api/session", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (json) => {
        if (cancelled) return;
        if (!json || !json.authenticated) {
          setSessionVerifiedAdmin(false);
          if (role === "owner" || role === "admin") {
            setRole(null);
            safeStorage.removeItem("yafa-role");
          }
          return;
        }
        const serverRole = json.role;
        if (serverRole === "admin") {
          let verified = false;
          if (auth.currentUser) {
            const fbCheck = await verifyFirebaseAdminAuthority();
            verified = fbCheck.isAdmin;
          } else {
            verified = json.email === "majdaltrki8@gmail.com" || json.authMethod === "payload";
          }
          if (!cancelled) {
            setSessionVerifiedAdmin(verified);
            if (verified) {
              setRole("admin");
              safeStorage.setItem("yafa-role", "admin");
            } else {
              setRole(null);
              safeStorage.removeItem("yafa-role");
            }
          }
        } else if (serverRole === "owner") {
          setSessionVerifiedAdmin(false);
          setRole("owner");
          safeStorage.setItem("yafa-role", "owner");
        } else {
          setSessionVerifiedAdmin(false);
          if (role === "owner" || role === "admin") {
            setRole(null);
            safeStorage.removeItem("yafa-role");
          }
        }
      })
      .catch(() => {
        if (!cancelled) setSessionVerifiedAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mounted, role]);

  const effectiveRole = role;

  useEffect(() => {
    const handler = () => {
      if (typeof window !== "undefined") {
        const raw = window.location.hash && window.location.hash.startsWith("#/")
          ? window.location.hash.slice(1)
          : window.location.pathname;
        const current = normalizeAppPath(raw);
        setPath(current);
        const storedRole = (safeStorage.getItem("yafa-role") as Role) || null;
        if (storedRole !== role) setRole(storedRole);
      }
    };
    window.addEventListener("popstate", handler);
    window.addEventListener("hashchange", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("storage", handler);
    };
  }, [role]);

  useEffect(() => {
    if (!showSplash) return;
    const timer = window.setTimeout(() => setShowSplash(false), 900);
    return () => window.clearTimeout(timer);
  }, [showSplash]);

  const content = useMemo(() => {
    const cleanPath = normalizeAppPath(path);

    if (cleanPath === "/" || cleanPath === "/index.html") return <VisitorHome />;
    if (cleanPath === "/visitor/home") return <VisitorHome />;
    if (cleanPath === "/review-board") {
      if (effectiveRole !== "admin" || !sessionVerifiedAdmin) return <PortalGate portal="admin" path={cleanPath} />;
      return <ReviewBoard />;
    }
    if (cleanPath === "/entry") return <Entry />;
    if (cleanPath === "/audit") {
      if (effectiveRole !== "admin" || !sessionVerifiedAdmin) return <PortalGate portal="admin" path={cleanPath} />;
      return <Audit />;
    }
    if (cleanPath === "/auth/visitor-login") return <VisitorLoginPrompt />;
    if (cleanPath === "/auth/owner-login") return <Auth kind="owner" setRole={setRole} />;
    if (cleanPath === "/auth/admin-login") return <Auth kind="admin" setRole={setRole} />;
    if (cleanPath === "/owner/signup") return <SignupFlow setRole={setRole} />;
    if (cleanPath.startsWith("/owner/") && effectiveRole !== "owner") return <PortalGate portal="owner" path={cleanPath} />;
    if (cleanPath === "/owner/establishment") return <OwnerDashboard setRole={setRole} />;
    if (cleanPath === "/owner/submitted") return <OwnerDashboard setRole={setRole} />;
    if (cleanPath.startsWith("/admin/") && (effectiveRole !== "admin" || !sessionVerifiedAdmin)) {
      return <PortalGate portal="admin" path={cleanPath} />;
    }
    if (cleanPath === "/visitor/share") return <ShareEarn />;
    if (cleanPath === "/visitor/fuel") return <FuelPage />;
    if (cleanPath === "/visitor/exchange-rates") return <ExchangeRatesPage />;
    if (cleanPath === "/visitor/remittance") return <RemittancePage />;
    if (cleanPath === "/visitor/professionals") return <VisitorProfessionalsPage />;
    if (cleanPath === "/visitor/used") return <UsedMarketplace />;
    if (cleanPath === "/visitor/used/new") return <UsedMarketplace create />;
    if (cleanPath === "/visitor/search") return <SearchPage />;
    if (cleanPath === "/visitor/chats") return <VisitorChats />;
    if (cleanPath === "/visitor/cart" || cleanPath === "/visitor/orders" || cleanPath === "/visitor/favorites") {
      return <CartLike type={cleanPath.split("/").pop() as "cart" | "orders" | "favorites"} />;
    }
    if (cleanPath.startsWith("/visitor/store/")) return <VisitorDetail kind="store" currentPath={cleanPath} />;
    if (cleanPath.startsWith("/visitor/product/")) return <VisitorDetail kind="product" currentPath={cleanPath} />;
    const visitorType = cleanPath.match(/^\/visitor\/([^/]+)$/)?.[1];
    if (visitorType && categoryCopy[visitorType]) return <VisitorCategory type={visitorType} />;
    if (cleanPath === "/visitor/notifications") return <VisitorNotificationsPage />;
    if (cleanPath === "/owner/dashboard") return <OwnerDashboard setRole={setRole} />;
    if (cleanPath === "/owner/products") return <OwnerProducts setRole={setRole} />;
    if (cleanPath.startsWith("/owner/product/new")) return <ProductForm setRole={setRole} />;
    if (cleanPath === "/owner/setup") return <OwnerSetup setRole={setRole} />;
    if (cleanPath === "/owner/sections") return <OwnerSections setRole={setRole} />;
    if (cleanPath === "/owner/share") return <OwnerShare setRole={setRole} />;
    if (cleanPath === "/owner/orders") return <OwnerOrders setRole={setRole} />;
    if (cleanPath === "/owner/chats") return <OwnerChats setRole={setRole} />;
    if (cleanPath === "/owner/ads") return <OwnerDashboard setRole={setRole} />;
    if (cleanPath === "/owner/reports") return <OwnerReports setRole={setRole} />;
    if (cleanPath === "/owner/preview") return <OwnerPreview />;
    if (cleanPath === "/admin/app-images") {
      return (
        <div className="min-h-screen bg-[#f4f7f5] pb-24 relative" dir="rtl">
          <header className="bg-[#064b3d] text-white p-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="flex items-center gap-1 text-[#eedab0] font-bold text-xs hover:text-white"
                onClick={() => route("/admin/dashboard")}
              >
                <ChevronLeft className="w-4 h-4 transform rotate-180" />
                <span>لوحة الإدارة</span>
              </button>
              <span className="text-white/30">|</span>
              <div className="flex items-center gap-2">
                <Image className="w-5 h-5 text-[#eedab0]" />
                <div>
                  <h1 className="text-sm font-bold">إدارة صور التطبيق</h1>
                  <p className="text-[10px] text-emerald-200">تحكم شامل لجميع صور وبنرات وأيقونات التطبيق مع القص والتحسين</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
              onClick={() => route("/admin/dashboard")}
              aria-label="العودة للوحة الإدارة"
            >
              <X className="w-4 h-4" />
            </button>
          </header>
          <main className="max-w-5xl mx-auto p-3.5 pb-28">
            <AppImageManager
              onAudit={(action, target) => recordAdminAudit(action, "إدارة صور التطبيق", target)}
              onNavigate={(p) => route(p)}
            />
          </main>
          <AdminBottomNav setRole={setRole} />
        </div>
      );
    }
    if (cleanPath === "/admin/appearance") {
      return (
        <div className="min-h-screen bg-[#f4f7f5] pb-24" dir="rtl">
          <header className="bg-[#064b3d] text-white p-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-[#eedab0]" />
              <div>
                <h1 className="text-sm font-bold">إدارة المظهر والمحتوى الحي</h1>
                <p className="text-[10px] text-emerald-200">تخصيص الألوان والهوية وترتيب الأقسام لحظياً</p>
              </div>
            </div>
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
              onClick={() => route("/admin/dashboard")}
            >
              <X className="w-4 h-4" />
            </button>
          </header>
          <main className="max-w-4xl mx-auto p-3">
            <AppearanceManager />
          </main>
          <AdminBottomNav setRole={setRole} />
        </div>
      );
    }
    const adminType = cleanPath.match(/^\/admin\/([^/]+)$/)?.[1];
    if (adminType && adminMeta[adminType]) return <AdminPage type={adminType} setRole={setRole} />;
    return <main className="state-page" style={{ padding: "40px 20px", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
      <div style={{ background: "rgba(199, 148, 44, 0.12)", color: "#c7942c", width: "64px", height: "64px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
        <AlertTriangle style={{ width: "32px", height: "32px" }} />
      </div>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "8px" }}>الصفحة غير موجودة</h1>
      <p style={{ color: "#666", lineHeight: 1.6, marginBottom: "24px" }}>المسار المطلوب غير متوفر أو ربما تم نقله. يمكنك العودة إلى إحدى البوابات الرئيسية أدناه.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
        <Button kind="gold" onClick={() => route("/")}>العودة لبوابة الزائر الرئيسية</Button>
        <Button kind="outline" onClick={() => route("/owner/dashboard")}>بوابة صاحب المنشأة</Button>
      </div>
    </main>;
  }, [path, role, effectiveRole, sessionVerifiedAdmin]);

  const appImages = useAppImages();
  const splashIconUrl = resolveSlotPrimaryImage(appImages, "splash_icon", "/icons/icon-512.png");

  return <div dir="rtl" style={{ color: green }}>{showSplash && <div className="web-splash" role="status" aria-label="جاري تشغيل يافع ون"><img src={splashIconUrl} alt="يافع ون | YAFA ONE" /><span>يافع ون | YAFA ONE</span></div>}{content}<Toast />{effectiveRole === "admin" && sessionVerifiedAdmin && !reviewParamsState.isReviewFrame && path !== "/review-board" && <><button className="audit-link" onClick={() => route("/audit")}>خريطة 40 شاشة</button><button className="review-board-link" onClick={() => route("/review-board")}>لوحة الصفحات</button></>}</div>;
}
