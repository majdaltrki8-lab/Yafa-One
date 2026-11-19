function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET || process.env.PAYLOAD_SECRET
  if (envSecret && envSecret.length >= 16) return envSecret

  const g = globalThis as typeof globalThis & { __yafaSessionSecret?: string }
  if (!g.__yafaSessionSecret) {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    g.__yafaSessionSecret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return g.__yafaSessionSecret
}

export type SessionRole = 'visitor' | 'owner' | 'admin'

export interface SessionPayload {
  role: SessionRole
  email: string
  uid?: string
  phone?: string
  name?: string
  authMethod?: 'phone' | 'firebase' | 'payload'
  exp: number
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): Uint8Array | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4)
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlMs = 30 * 24 * 60 * 60 * 1000): Promise<string> {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + ttlMs,
  }
  const enc = new TextEncoder()
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(fullPayload)))
  const key = await getHmacKey()
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  const sigB64 = toBase64Url(new Uint8Array(sig))
  return `${payloadB64}.${sigB64}`
}

export async function verifySessionToken(token?: string | null): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  if (!payloadB64 || !sigB64) return null

  const sigBytes = fromBase64Url(sigB64)
  const payloadBytes = fromBase64Url(payloadB64)
  if (!sigBytes || !payloadBytes) return null

  try {
    const key = await getHmacKey()
    const enc = new TextEncoder()
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      enc.encode(payloadB64),
    )
    if (!valid) return null

    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload
    if (!parsed || !parsed.role || !parsed.email || typeof parsed.exp !== 'number') return null
    if (Date.now() > parsed.exp) return null
    if (!['visitor', 'owner', 'admin'].includes(parsed.role)) return null
    return parsed
  } catch {
    return null
  }
}
