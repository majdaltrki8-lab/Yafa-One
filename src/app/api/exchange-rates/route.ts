import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'
import config from '@payload-config'
import { getPayload } from 'payload'

// Server-side exchange rates cache (only treated as approved after reading Firebase or verified Admin POST)
let hasApprovedServerState = false;
let serverExchangeRates: {
  rates: {
    SAR: { buy: number; sell: number; prevBuy?: number; prevSell?: number };
    USD: { buy: number; sell: number; prevBuy?: number; prevSell?: number };
  };
  source: string;
  updatedAt: string;
  adminName: string;
  autoUpdateEnabled: boolean;
  updateIntervalMinutes: number;
  approved: boolean;
  history: Array<{ timestamp: string; adminName: string; source: string; summary: string }>;
} | null = null;

function normalizeIsoTimestamp(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  if (typeof val?.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString();
  }
  return '';
}

function isValidApprovedRates(candidate: any): boolean {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.approved !== true) return false;
  const sarBuy = Number(candidate?.rates?.SAR?.buy);
  const sarSell = Number(candidate?.rates?.SAR?.sell);
  const usdBuy = Number(candidate?.rates?.USD?.buy);
  const usdSell = Number(candidate?.rates?.USD?.sell);
  const iso = normalizeIsoTimestamp(candidate.updatedAt);
  return (
    Number.isFinite(sarBuy) && sarBuy > 0 &&
    Number.isFinite(sarSell) && sarSell > 0 &&
    Number.isFinite(usdBuy) && usdBuy > 0 &&
    Number.isFinite(usdSell) && usdSell > 0 &&
    Boolean(iso) &&
    iso !== '2026-01-01T00:00:00.000Z'
  );
}

// Cryptographic admin key derived strictly on server from secret (never exposed to client)
function getServerSecret(): string {
  const envSecret = process.env.SESSION_SECRET || process.env.PAYLOAD_SECRET;
  if (envSecret && envSecret.length >= 16) return envSecret;
  const g = globalThis as typeof globalThis & { __yafaExchangeSecret?: string };
  if (!g.__yafaExchangeSecret) {
    g.__yafaExchangeSecret = crypto.randomBytes(32).toString('hex');
  }
  return g.__yafaExchangeSecret;
}

function getDerivedAdminKey(): string {
  return crypto
    .createHmac('sha256', getServerSecret())
    .update('yafa-one-admin-exchange-rates-v1')
    .digest('hex');
}

function verifyTimingSafeKey(providedKey: string): boolean {
  if (!providedKey || typeof providedKey !== 'string') return false;
  const clean = providedKey.trim();

  const validKeys = [
    process.env.ADMIN_API_KEY,
    process.env.ADMIN_EXCHANGE_KEY,
    getDerivedAdminKey(),
  ].filter(Boolean) as string[];

  for (const validKey of validKeys) {
    if (clean.length === validKey.length) {
      const a = Buffer.from(clean);
      const b = Buffer.from(validKey);
      if (crypto.timingSafeEqual(a, b)) {
        return true;
      }
    }
  }
  return false;
}

import { verifySessionToken } from '@/lib/session'

async function verifyAdminAuth(req: NextRequest, bodyKey?: string): Promise<{ authorized: boolean; reason?: string }> {
  // 1. Check custom admin header
  const customKey = req.headers.get('x-admin-key') || req.headers.get('x-admin-token');
  if (customKey && verifyTimingSafeKey(customKey)) {
    return { authorized: true };
  }

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (verifyTimingSafeKey(token)) {
      return { authorized: true };
    }
  }

  // 3. Check admin key in payload body
  if (bodyKey && typeof bodyKey === 'string' && verifyTimingSafeKey(bodyKey)) {
    return { authorized: true };
  }

  // 4. Check signed HTTP-only admin session cookie
  const session = await verifySessionToken(req.cookies.get('yafa-session')?.value);
  if (session?.role === 'admin') {
    return { authorized: true };
  }

  // 5. Check Payload CMS authenticated admin session (if payload-token cookie exists)
  try {
    const payload = await getPayload({ config });
    const { user } = await payload.auth({ headers: req.headers });
    if (user && user.collection === 'admins') {
      return { authorized: true };
    }
  } catch {
    // Non-fatal: if Payload auth check fails, fall through to rejection
  }

  // Explicit security rule: Plaintext yafa-role cookie is NOT trusted for server mutation
  return { authorized: false, reason: 'يتطلب هذا الإجراء تصريحاً إدارياً خادمياً موثقاً أو مفتاح إدارة معتمد.' };
}

/**
 * In-memory rate limiter with sliding/fixed window cleanup.
 * NOTE: This rate limiter is local to the current server instance (In-Memory).
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

function checkRateLimit(req: NextRequest, action: 'GET' | 'POST', maxRequests: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || '127.0.0.1');

  const now = Date.now();
  cleanupRateLimits();

  const key = `${ip}:${action}`;
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.count >= maxRequests) {
    const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  record.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function GET(req: NextRequest) {
  const limitCheck = checkRateLimit(req, 'GET', 60, 60000);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة لاحقاً.', code: 'RATE_LIMIT_EXCEEDED' },
      {
        status: 429,
        headers: { 'Retry-After': String(limitCheck.retryAfterSeconds) }
      }
    );
  }

  try {
    const { db } = await import('@/lib/firebase');
    const { doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'settings', 'exchangeRates'));
    if (snap.exists()) {
      const fbData = snap.data() as any;
      if (isValidApprovedRates(fbData)) {
        const normalized = {
          ...fbData,
          approved: true,
        };
        serverExchangeRates = normalized;
        hasApprovedServerState = true;
        return NextResponse.json({
          success: true,
          approved: true,
          source: 'firebase',
          data: normalized,
        });
      }
    }
  } catch {
    // Fall through to in-memory verified state if any
  }

  if (hasApprovedServerState && serverExchangeRates && isValidApprovedRates(serverExchangeRates)) {
    return NextResponse.json({
      success: true,
      approved: true,
      source: 'server',
      data: serverExchangeRates,
    });
  }

  return NextResponse.json({
    success: true,
    approved: false,
    source: 'none',
    data: null,
  });
}

export async function POST(req: NextRequest) {
  const limitCheck = checkRateLimit(req, 'POST', 10, 60000);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'تم تجاوز الحد المسموح من طلبات التعديل. يرجى المحاولة لاحقاً.', code: 'RATE_LIMIT_EXCEEDED' },
      {
        status: 429,
        headers: { 'Retry-After': String(limitCheck.retryAfterSeconds) }
      }
    );
  }

  try {
    const body = await req.json();
    const { rates, source, adminName, autoUpdateEnabled, adminKey } = body;

    // Strict server-side admin authorization verification
    const authResult = await verifyAdminAuth(req, adminKey);
    if (!authResult.authorized) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.reason || 'غير مصرح: لا تملك صلاحية تعديل أسعار الصرف.',
          code: 'UNAUTHORIZED_ADMIN_REQUIRED',
        },
        { status: 401 }
      );
    }

    if (!rates || !rates.SAR || !rates.USD || !source) {
      return NextResponse.json({ success: false, error: 'بيانات غير مكتملة' }, { status: 400 });
    }

    const newSarBuy = Number(rates.SAR.buy);
    const newSarSell = Number(rates.SAR.sell);
    const newUsdBuy = Number(rates.USD.buy);
    const newUsdSell = Number(rates.USD.sell);

    if (![newSarBuy, newSarSell, newUsdBuy, newUsdSell].every(val => Number.isFinite(val) && val > 0)) {
      return NextResponse.json({ success: false, error: 'الأسعار يجب أن تكون أرقاماً صحيحة أكبر من الصفر' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const currentAdmin = String(adminName || 'المدير العام ماجد التركي');
    const currentSource = String(source).trim();

    const prevSarBuy = serverExchangeRates?.rates.SAR.buy ?? newSarBuy;
    const prevSarSell = serverExchangeRates?.rates.SAR.sell ?? newSarSell;
    const prevUsdBuy = serverExchangeRates?.rates.USD.buy ?? newUsdBuy;
    const prevUsdSell = serverExchangeRates?.rates.USD.sell ?? newUsdSell;

    const historyEntry = {
      timestamp: now,
      adminName: currentAdmin,
      source: currentSource,
      summary: `تحديث أسعار الصرف: السعودي (${newSarBuy}/${newSarSell})، الدولار (${newUsdBuy}/${newUsdSell})`,
    };

    serverExchangeRates = {
      rates: {
        SAR: { buy: newSarBuy, sell: newSarSell, prevBuy: prevSarBuy, prevSell: prevSarSell },
        USD: { buy: newUsdBuy, sell: newUsdSell, prevBuy: prevUsdBuy, prevSell: prevUsdSell },
      },
      source: currentSource,
      updatedAt: now,
      adminName: currentAdmin,
      autoUpdateEnabled: Boolean(autoUpdateEnabled),
      updateIntervalMinutes: 15,
      approved: true,
      history: [historyEntry, ...(serverExchangeRates?.history || [])].slice(0, 20),
    };
    hasApprovedServerState = true;

    try {
      const { db } = await import('@/lib/firebase');
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'settings', 'exchangeRates'), serverExchangeRates);
    } catch {
      // Client admin session also persists directly to Firestore with admin token
    }

    return NextResponse.json({
      success: true,
      approved: true,
      data: serverExchangeRates,
      message: 'تم تحديث ونشر أسعار الصرف الرسمية بنجاح لجميع المستخدمين',
    });
  } catch {
    return NextResponse.json({ success: false, error: 'خطأ في معالجة طلب تحديث الأسعار' }, { status: 500 });
  }
}
