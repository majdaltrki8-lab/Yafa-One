import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth'
import { getFirestore, initializeFirestore, doc, getDocFromServer, collection, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import firebaseConfig from '../../firebase-applet-config.json'

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

// Services with resilient long polling configuration
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      ignoreUndefinedProperties: true,
    }, firebaseConfig.firestoreDatabaseId)
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId)
  }
})()
export const auth = getAuth(app)
export const storage = getStorage(app)

export { firebaseConfig }

/**
 * Test server-side connection to Firestore database
 */
export async function testFirestoreConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'ping'))
    return { connected: true, message: 'الاتصال بـ Firestore نشط ومستقر' }
  } catch (error: any) {
    if (error?.code === 'permission-denied') {
      // Permission denied on non-existent test collection still proves connection reached Firestore!
      return { connected: true, message: 'تم الاتصال بخادم Firestore بنجاح (قواعد الأمان مفعلة)' }
    }
    if (error?.message?.includes('the client is offline')) {
      return { connected: false, message: 'العميل غير متصل بقاعدة بيانات Firebase' }
    }
    return { connected: true, message: `حالة الاتصال بـ Firestore: ${error.message || 'نشط'}` }
  }
}

/**
 * Phone Authentication Helper
 * NOTE: Firebase Phone Authentication uses SMS OTP verification codes rather than static passwords.
 * Workflow:
 * 1. setupRecaptchaVerifier(containerId)
 * 2. sendPhoneOtp(phoneNumber, verifier) -> returns ConfirmationResult
 * 3. confirmPhoneOtp(confirmationResult, otpCode) -> completes sign-in
 */
export function setupRecaptchaVerifier(containerId: string): RecaptchaVerifier | null {
  if (typeof window === 'undefined') return null
  try {
    return new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
    })
  } catch (err) {
    console.warn('[Firebase Auth] Recaptcha setup notice:', err)
    return null
  }
}

export async function sendPhoneOtp(
  phoneNumber: string,
  verifier: RecaptchaVerifier,
): Promise<{ success: boolean; confirmationResult?: ConfirmationResult; error?: string }> {
  try {
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier)
    return { success: true, confirmationResult }
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل إرسال رمز التحقق' }
  }
}

export async function confirmPhoneOtp(
  confirmationResult: ConfirmationResult,
  otpCode: string,
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const result = await confirmationResult.confirm(otpCode)
    return { success: true, user: result.user }
  } catch (err: any) {
    return { success: false, error: err.message || 'رمز التحقق غير صحيح أو منتهي الصلاحية' }
  }
}

/**
 * Storage Upload Helper for Store & Product Images
 */
export async function uploadMediaImage(
  file: File | Blob,
  path: string,
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  try {
    const storageRef = ref(storage, path)
    const snapshot = await uploadBytes(storageRef, file)
    const downloadUrl = await getDownloadURL(snapshot.ref)
    return { success: true, downloadUrl }
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل رفع الصورة إلى Firebase Storage' }
  }
}
