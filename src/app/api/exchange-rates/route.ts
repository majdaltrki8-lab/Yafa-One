import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'crypto'
import config from '@payload-config'
import { getPayload } from 'payload'

// Server-side exchange rates storage with Aden market rates, previous prices, auto-update toggle, and audit history
let serverExchangeRates = {
  rates: {
    SAR: { buy: 411, sell: 413, prevBuy: 410, prevSell: 412 },
    USD: { buy: 1568, sell: 1579, prevBuy: 1565, prevSell: 1575 },
  },
  source: 'سوق عدن المالي - جنوب اليمن (معتمد رسمياً)',
  updatedAt: new Date().toISOString(),
  adminName: 'المدير العام ماجد التركي',
  autoUpdateEnabled: false,
  updateIntervalMinutes: 15,
  history: [
    {
      timestamp: new Date().toISOString(),
      adminName: 'المدير العام ماجد التركي',
      source: 'سوق عدن المالي - جنوب اليمن',
      summary: 'التحديث المرجعي المعتمد (السعودي: 411/413، الدولار: 1568/1579)',
    }
  ],
};

// Cryptographic admin key derived strictly on server from secret (never exposed to client)
const SERVER_SECRET = process.env.PAYLOAD_SECRET || 'd8b5f3a1e948c207b6e3f5d1a89c4270e5b8163f27a4d9c0e358b1fa2479e61c';
const DERIVED_ADMIN_KEY = crypto
  .createHmac('sha256', SERVER_SECRET)
  .update('yafa-one-admin-exchange-rates-v1')
  .digest('hex');

function verifyTimingSafeKey(providedKey: string): boolean {
  if (!providedKey || typeof providedKey !== 'string') return false;
  const clean = providedKey.trim();

  const validKeys = [
    process.env.ADMIN_API_KEY,
    process.env.ADMIN_EXCHANGE_KEY,
    DERIVED_ADMIN_KEY,
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

  // 4. Check Payload CMS authenticated admin session (if payload-token cookie exists)
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
 * It does not persist across container/server restarts or across multiple horizontally scaled replicas (no external Redis/Firebase used).
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Cleanup expired entries periodically to prevent unbounded memory growth
function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}

function checkRateLimit(req: NextRequest, action: 'GET' | 'POST', maxRequests: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  // Extract client IP securely (taking first IP in x-forwarded-for if proxied)
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
  const limitCheck = checkRateLimit(req, 'GET', 60, 60000); // 60 requests per minute per IP
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة لاحقاً.', code: 'RATE_LIMIT_EXCEEDED' },
      { 
        status: 429,
        headers: { 'Retry-After': String(limitCheck.retryAfterSeconds) }
      }
    );
  }

  return NextResponse.json({
    success: true,
    data: serverExchangeRates,
  });
}

export async function POST(req: NextRequest) {
  const limitCheck = checkRateLimit(req, 'POST', 10, 60000); // 10 requests per minute per IP
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

    // Store previous prices before updating
    const prevSarBuy = serverExchangeRates.rates.SAR.buy;
    const prevSarSell = serverExchangeRates.rates.SAR.sell;
    const prevUsdBuy = serverExchangeRates.rates.USD.buy;
    const prevUsdSell = serverExchangeRates.rates.USD.sell;

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
      history: [historyEntry, ...(serverExchangeRates.history || [])].slice(0, 20),
    };

    return NextResponse.json({
      success: true,
      data: serverExchangeRates,
      message: 'تم تحديث ونشر أسعار الصرف الرسمية بنجاح لجميع المستخدمين',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'خطأ في معالجة طلب تحديث الأسعار' }, { status: 500 });
  }
}
