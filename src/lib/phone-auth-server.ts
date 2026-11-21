import 'server-only'

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export type PhoneAuthRole = 'visitor' | 'owner'
export type OtpPurpose = 'register' | 'reset'

export interface PhoneUserRecord {
  id: string
  role: PhoneAuthRole
  phone: string // +9677xxxxxxxx
  phoneLocal: string // 7xxxxxxxx
  name: string
  establishmentId?: string
  establishmentName?: string
  district?: string
  activity?: string
  passwordSalt: string
  passwordHash: string
  fbBridgeEmail: string
  fbBridgeSecretEnc: string
  phoneVerifiedAt: string
  createdAt: string
  updatedAt: string
}

interface OtpChallengeRecord {
  key: string // `${purpose}:${role}:${phone}`
  purpose: OtpPurpose
  role: PhoneAuthRole
  phone: string
  otpHash: string
  expiresAt: number
  lastSentAt: number
  sendCountWindowStart: number
  sendCount: number
  attempts: number
}

interface LoginAttemptRecord {
  failures: number
  firstFailureAt: number
  lockedUntil: number
}

interface PhoneAuthDb {
  users: Record<string, PhoneUserRecord> // key: `${role}:${phone}`
  otps: Record<string, OtpChallengeRecord>
  loginAttempts: Record<string, LoginAttemptRecord> // key: `${role}:${phone}` or `ip:${ip}`
}

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'phone-auth.json')
const LOCAL_KEY_FILE = path.join(DATA_DIR, '.phone-auth.key')

const OTP_TTL_MS = 5 * 60 * 1000 // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds
const OTP_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const OTP_MAX_SENDS_PER_WINDOW = 5
const OTP_MAX_VERIFY_ATTEMPTS = 5
const LOGIN_MAX_FAILURES = 5
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function getCryptoMasterKey(): Buffer {
  const envSecret = process.env.SESSION_SECRET || process.env.PAYLOAD_SECRET
  if (envSecret && envSecret.length >= 16) {
    return crypto.createHash('sha256').update(envSecret).digest()
  }
  ensureDataDir()
  try {
    if (fs.existsSync(LOCAL_KEY_FILE)) {
      const hex = fs.readFileSync(LOCAL_KEY_FILE, 'utf-8').trim()
      if (/^[a-f0-9]{64}$/i.test(hex)) {
        return Buffer.from(hex, 'hex')
      }
    }
    const generated = crypto.randomBytes(32)
    fs.writeFileSync(LOCAL_KEY_FILE, generated.toString('hex'), { mode: 0o600 })
    return generated
  } catch {
    const g = globalThis as typeof globalThis & { __yafaPhoneMasterKey?: Buffer }
    if (!g.__yafaPhoneMasterKey) {
      g.__yafaPhoneMasterKey = crypto.randomBytes(32)
    }
    return g.__yafaPhoneMasterKey
  }
}

function loadDb(): PhoneAuthDb {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return {
          users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
          otps: parsed.otps && typeof parsed.otps === 'object' ? parsed.otps : {},
          loginAttempts:
            parsed.loginAttempts && typeof parsed.loginAttempts === 'object'
              ? parsed.loginAttempts
              : {},
        }
      }
    }
  } catch (err) {
    console.warn('[PhoneAuth] Failed to read phone-auth.json:', err)
  }
  return { users: {}, otps: {}, loginAttempts: {} }
}

function saveDb(db: PhoneAuthDb): void {
  ensureDataDir()
  const now = Date.now()
  // Prune expired OTPs and old lockouts
  for (const [k, rec] of Object.entries(db.otps)) {
    if (now > rec.expiresAt + 60 * 60 * 1000) {
      delete db.otps[k]
    }
  }
  for (const [k, rec] of Object.entries(db.loginAttempts)) {
    if (rec.lockedUntil > 0 && now > rec.lockedUntil + 60 * 60 * 1000) {
      delete db.loginAttempts[k]
    }
  }
  const tmpPath = `${DB_FILE}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8')
  fs.renameSync(tmpPath, DB_FILE)
}

export function normalizeYemeniPhone(rawInput: string): {
  e164: string
  digits: string
  local: string
} | null {
  if (!rawInput || typeof rawInput !== 'string') return null
  // Convert Arabic-Indic / Eastern Arabic digits to ASCII digits
  const ascii = rawInput
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  let cleaned = ascii.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1)
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2)
  if (cleaned.startsWith('967')) cleaned = cleaned.slice(3)
  if (cleaned.startsWith('0')) cleaned = cleaned.slice(1)

  // Yemeni mobile numbers are 9 digits starting with 70, 71, 73, 77, or 78
  if (!/^7[01378]\d{7}$/.test(cleaned)) {
    return null
  }
  return {
    e164: `+967${cleaned}`,
    digits: `967${cleaned}`,
    local: cleaned,
  }
}

export function validateStrongPassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 6) {
    return 'كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.'
  }
  if (password.length > 128) {
    return 'كلمة المرور طويلة جداً.'
  }
  return null
}

export function hashPasswordScrypt(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(password, salt, 64).toString('hex')
  return { salt, hash: derived }
}

export function verifyPasswordScrypt(password: string, salt: string, storedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64)
    const target = Buffer.from(storedHash, 'hex')
    if (derived.length !== target.length) return false
    return crypto.timingSafeEqual(derived, target)
  } catch {
    return false
  }
}

function encryptSecret(plain: string): string {
  const key = getCryptoMasterKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`
}

function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split('.')
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted secret format')
  }
  const key = getCryptoMasterKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

function hashOtpCode(purpose: OtpPurpose, role: PhoneAuthRole, phone: string, code: string): string {
  return crypto
    .createHmac('sha256', getCryptoMasterKey())
    .update(`${purpose}:${role}:${phone}:${code}`)
    .digest('hex')
}

export function getWhatsAppConfigStatus(): {
  configured: boolean
  missingEnv: string[]
  phoneNumberId?: string
  accessToken?: string
  templateName?: string
  templateLang: string
  apiVersion: string
} {
  const accessToken = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim()
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
  const templateName = (process.env.WHATSAPP_TEMPLATE_NAME || '').trim()
  const templateLang = (process.env.WHATSAPP_TEMPLATE_LANG || 'ar').trim() || 'ar'
  const apiVersion = (process.env.WHATSAPP_API_VERSION || 'v21.0').trim() || 'v21.0'

  const missingEnv: string[] = []
  if (!accessToken) missingEnv.push('WHATSAPP_ACCESS_TOKEN')
  if (!phoneNumberId) missingEnv.push('WHATSAPP_PHONE_NUMBER_ID')

  return {
    configured: missingEnv.length === 0,
    missingEnv,
    phoneNumberId: phoneNumberId || undefined,
    accessToken: accessToken || undefined,
    templateName: templateName || undefined,
    templateLang,
    apiVersion,
  }
}

export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return headers.get('x-real-ip') || '127.0.0.1'
}

export async function issueWhatsAppOtp(params: {
  phoneRaw: string
  role: PhoneAuthRole
  purpose: OtpPurpose
  clientIp: string
}): Promise<{
  ok: boolean
  status: number
  code?: string
  error?: string
  missingEnv?: string[]
  retryAfterSeconds?: number
  expiresInSeconds?: number
  maskedPhone?: string
}> {
  const normalized = normalizeYemeniPhone(params.phoneRaw)
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PHONE',
      error: 'أدخل رقم جوال يمني صحيحاً (مثال: 77xxxxxxx أو +96777xxxxxxx).',
    }
  }

  const db = loadDb()
  const userKey = `${params.role}:${normalized.e164}`
  const existingUser = db.users[userKey]

  if (params.purpose === 'register' && existingUser) {
    return {
      ok: false,
      status: 409,
      code: 'PHONE_ALREADY_REGISTERED',
      error: 'رقم الجوال هذا مسجل مسبقاً. يمكنك تسجيل الدخول مباشرة أو استعادة كلمة المرور.',
    }
  }

  if (params.purpose === 'reset' && !existingUser) {
    return {
      ok: false,
      status: 404,
      code: 'PHONE_NOT_FOUND',
      error: 'لا يوجد حساب مسجل بهذا الرقم لهذا النوع من البوابات.',
    }
  }

  const challengeKey = `${params.purpose}:${params.role}:${normalized.e164}`
  const now = Date.now()
  const existingOtp = db.otps[challengeKey]

  if (existingOtp) {
    const sinceLast = now - existingOtp.lastSentAt
    if (sinceLast < OTP_RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - sinceLast) / 1000)
      return {
        ok: false,
        status: 429,
        code: 'OTP_COOLDOWN',
        retryAfterSeconds,
        error: `يرجى الانتظار ${retryAfterSeconds} ثانية قبل طلب رمز جديد عبر واتساب.`,
      }
    }

    if (now - existingOtp.sendCountWindowStart < OTP_WINDOW_MS) {
      if (existingOtp.sendCount >= OTP_MAX_SENDS_PER_WINDOW) {
        const retryAfterSeconds = Math.ceil(
          (existingOtp.sendCountWindowStart + OTP_WINDOW_MS - now) / 1000,
        )
        return {
          ok: false,
          status: 429,
          code: 'OTP_RATE_LIMIT',
          retryAfterSeconds,
          error: 'تم تجاوز عدد محاولات إرسال رمز التحقق. حاول لاحقاً.',
        }
      }
    }
  }

  const wa = getWhatsAppConfigStatus()
  if (!wa.configured || !wa.accessToken || !wa.phoneNumberId) {
    return {
      ok: false,
      status: 503,
      code: 'WHATSAPP_NOT_CONFIGURED',
      missingEnv: wa.missingEnv,
      error:
        'خدمة WhatsApp Business Cloud API غير مهيأة على الخادم بعد (مطلوب WHATSAPP_ACCESS_TOKEN و WHATSAPP_PHONE_NUMBER_ID). لن يتم إرسال رمز وهمي.',
    }
  }

  const otpCode = String(crypto.randomInt(100000, 1000000))
  const purposeLabel =
    params.purpose === 'register' ? 'تأكيد تسجيل الحساب' : 'استعادة كلمة المرور'

  const graphUrl = `https://graph.facebook.com/${wa.apiVersion}/${encodeURIComponent(wa.phoneNumberId)}/messages`
  const payloadBody = wa.templateName
    ? {
        messaging_product: 'whatsapp',
        to: normalized.digits,
        type: 'template',
        template: {
          name: wa.templateName,
          language: { code: wa.templateLang },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: otpCode }],
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalized.digits,
        type: 'text',
        text: {
          preview_url: false,
          body: `منصة يافع ون: رمز ${purposeLabel} هو ${otpCode} (صالح لمدة 5 دقائق). لا تشارك هذا الرمز مع أي شخص.`,
        },
      }

  try {
    const resp = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${wa.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloadBody),
    })

    const respJson = await resp.json().catch(() => null)
    if (!resp.ok) {
      const apiMsg =
        respJson?.error?.message || `فشل الإرسال من WhatsApp Cloud API (HTTP ${resp.status})`
      return {
        ok: false,
        status: 502,
        code: 'WHATSAPP_API_ERROR',
        error: `تعذر إرسال رمز واتساب: ${apiMsg}`,
      }
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 502,
      code: 'WHATSAPP_NETWORK_ERROR',
      error: err?.message || 'تعذر الاتصال بخدمة WhatsApp Business Cloud API.',
    }
  }

  const windowActive = existingOtp && now - existingOtp.sendCountWindowStart < OTP_WINDOW_MS
  db.otps[challengeKey] = {
    key: challengeKey,
    purpose: params.purpose,
    role: params.role,
    phone: normalized.e164,
    otpHash: hashOtpCode(params.purpose, params.role, normalized.e164, otpCode),
    expiresAt: now + OTP_TTL_MS,
    lastSentAt: now,
    sendCountWindowStart: windowActive ? existingOtp.sendCountWindowStart : now,
    sendCount: windowActive ? existingOtp.sendCount + 1 : 1,
    attempts: 0,
  }
  saveDb(db)

  return {
    ok: true,
    status: 200,
    expiresInSeconds: OTP_TTL_MS / 1000,
    maskedPhone: `${normalized.e164.slice(0, 7)}****${normalized.e164.slice(-2)}`,
  }
}

function consumeVerifiedOtp(
  db: PhoneAuthDb,
  purpose: OtpPurpose,
  role: PhoneAuthRole,
  e164Phone: string,
  otpCode: string,
): { ok: boolean; status: number; error?: string } {
  const cleanCode = String(otpCode || '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '')

  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, status: 400, error: 'أدخل رمز التحقق المكون من 6 أرقام المرسل عبر واتساب.' }
  }

  const challengeKey = `${purpose}:${role}:${e164Phone}`
  const challenge = db.otps[challengeKey]
  if (!challenge) {
    return {
      ok: false,
      status: 400,
      error: 'لم يتم طلب رمز تحقق لهذا الرقم أو تم استخدامه مسبقاً.',
    }
  }

  const now = Date.now()
  if (now > challenge.expiresAt) {
    delete db.otps[challengeKey]
    saveDb(db)
    return {
      ok: false,
      status: 410,
      error: 'انتهت صلاحية رمز التحقق. يرجى طلب رمز جديد عبر واتساب.',
    }
  }

  if (challenge.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
    delete db.otps[challengeKey]
    saveDb(db)
    return {
      ok: false,
      status: 429,
      error: 'تم تجاوز عدد محاولات إدخال الرمز. اطلب رمزاً جديداً عبر واتساب.',
    }
  }

  const candidateHash = hashOtpCode(purpose, role, e164Phone, cleanCode)
  const valid =
    candidateHash.length === challenge.otpHash.length &&
    crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(challenge.otpHash))

  if (!valid) {
    challenge.attempts += 1
    saveDb(db)
    const remaining = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - challenge.attempts)
    return {
      ok: false,
      status: 401,
      error:
        remaining > 0
          ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${remaining}.`
          : 'تم استنفاد محاولات التحقق. يرجى طلب رمز جديد.',
    }
  }

  // Single-use OTP: delete immediately after verification
  delete db.otps[challengeKey]
  return { ok: true, status: 200 }
}

export function registerPhoneAccountWithOtp(params: {
  phoneRaw: string
  password: string
  otpCode: string
  role: PhoneAuthRole
  name: string
  establishmentName?: string
  district?: string
  activity?: string
}): {
  ok: boolean
  status: number
  error?: string
  user?: PhoneUserRecord
  fbBridgeSecret?: string
} {
  const normalized = normalizeYemeniPhone(params.phoneRaw)
  if (!normalized) {
    return { ok: false, status: 400, error: 'رقم الجوال اليمني غير صحيح.' }
  }
  const passErr = validateStrongPassword(params.password)
  if (passErr) return { ok: false, status: 400, error: passErr }

  const cleanName = String(params.name || '').trim()
  if (cleanName.length < 2) {
    return { ok: false, status: 400, error: 'الاسم الكامل مطلوب.' }
  }
  const cleanEstName = String(params.establishmentName || '').trim()

  const db = loadDb()
  const userKey = `${params.role}:${normalized.e164}`
  if (db.users[userKey]) {
    return { ok: false, status: 409, error: 'رقم الجوال مسجل مسبقاً. يرجى تسجيل الدخول.' }
  }

  const otpCheck = consumeVerifiedOtp(db, 'register', params.role, normalized.e164, params.otpCode)
  if (!otpCheck.ok) {
    return { ok: false, status: otpCheck.status, error: otpCheck.error }
  }

  const { salt, hash } = hashPasswordScrypt(params.password)
  const fbBridgeSecret = crypto.randomBytes(24).toString('base64url')
  const fbBridgeEmail = `${params.role}.${normalized.local}@phone.yafaone.app`
  const nowIso = new Date().toISOString()
  const estId = params.role === 'owner' ? `EST-${Date.now().toString().slice(-6)}` : undefined

  const user: PhoneUserRecord = {
    id: `${params.role}_${normalized.local}_${crypto.randomBytes(4).toString('hex')}`,
    role: params.role,
    phone: normalized.e164,
    phoneLocal: normalized.local,
    name: cleanName,
    establishmentId: estId,
    establishmentName: params.role === 'owner' ? cleanEstName || `منشأة ${cleanName}` : undefined,
    district: params.district || 'لبعوس',
    activity: params.activity || 'متجر تجاري',
    passwordSalt: salt,
    passwordHash: hash,
    fbBridgeEmail,
    fbBridgeSecretEnc: encryptSecret(fbBridgeSecret),
    phoneVerifiedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  db.users[userKey] = user
  saveDb(db)

  return { ok: true, status: 201, user, fbBridgeSecret }
}

export function loginPhoneAccount(params: {
  phoneRaw: string
  password: string
  role: PhoneAuthRole
  clientIp: string
}): {
  ok: boolean
  status: number
  error?: string
  retryAfterSeconds?: number
  user?: PhoneUserRecord
  fbBridgeSecret?: string
} {
  const normalized = normalizeYemeniPhone(params.phoneRaw)
  if (!normalized) {
    return { ok: false, status: 400, error: 'أدخل رقم جوال يمني صحيحاً.' }
  }
  if (!params.password || params.password.length < 4) {
    return { ok: false, status: 400, error: 'أدخل كلمة المرور.' }
  }

  const db = loadDb()
  const attemptKey = `${params.role}:${normalized.e164}`
  const ipKey = `ip:${params.clientIp}`
  const now = Date.now()

  for (const k of [attemptKey, ipKey]) {
    const rec = db.loginAttempts[k]
    if (rec && rec.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((rec.lockedUntil - now) / 1000)
      return {
        ok: false,
        status: 429,
        retryAfterSeconds,
        error: `تم إيقاف المحاولات مؤقتاً لحماية الحساب. حاول بعد ${Math.ceil(retryAfterSeconds / 60)} دقيقة.`,
      }
    }
  }

  const userKey = `${params.role}:${normalized.e164}`
  const user = db.users[userKey]
  const passwordValid =
    Boolean(user) && verifyPasswordScrypt(params.password, user.passwordSalt, user.passwordHash)

  if (!user || !passwordValid) {
    const prev = db.loginAttempts[attemptKey]
    const withinWindow = prev && now - prev.firstFailureAt < LOGIN_LOCKOUT_MS
    const failures = withinWindow ? prev.failures + 1 : 1
    db.loginAttempts[attemptKey] = {
      failures,
      firstFailureAt: withinWindow ? prev.firstFailureAt : now,
      lockedUntil: failures >= LOGIN_MAX_FAILURES ? now + LOGIN_LOCKOUT_MS : 0,
    }
    saveDb(db)
    return {
      ok: false,
      status: 401,
      error: 'رقم الجوال أو كلمة المرور غير صحيحة.',
    }
  }

  // Successful login resets failure counter
  delete db.loginAttempts[attemptKey]
  saveDb(db)

  let fbBridgeSecret: string | undefined
  try {
    fbBridgeSecret = decryptSecret(user.fbBridgeSecretEnc)
  } catch {
    fbBridgeSecret = undefined
  }

  return { ok: true, status: 200, user, fbBridgeSecret }
}

export function resetPhonePasswordWithOtp(params: {
  phoneRaw: string
  otpCode: string
  newPassword: string
  role: PhoneAuthRole
}): {
  ok: boolean
  status: number
  error?: string
  phone?: string
} {
  const normalized = normalizeYemeniPhone(params.phoneRaw)
  if (!normalized) {
    return { ok: false, status: 400, error: 'رقم الجوال غير صحيح.' }
  }
  const passErr = validateStrongPassword(params.newPassword)
  if (passErr) return { ok: false, status: 400, error: passErr }

  const db = loadDb()
  const userKey = `${params.role}:${normalized.e164}`
  const user = db.users[userKey]
  if (!user) {
    return { ok: false, status: 404, error: 'لا يوجد حساب مسجل بهذا الرقم.' }
  }

  const otpCheck = consumeVerifiedOtp(db, 'reset', params.role, normalized.e164, params.otpCode)
  if (!otpCheck.ok) {
    return { ok: false, status: otpCheck.status, error: otpCheck.error }
  }

  const { salt, hash } = hashPasswordScrypt(params.newPassword)
  user.passwordSalt = salt
  user.passwordHash = hash
  user.updatedAt = new Date().toISOString()
  db.users[userKey] = user
  delete db.loginAttempts[userKey]
  saveDb(db)

  return { ok: true, status: 200, phone: normalized.e164 }
}
