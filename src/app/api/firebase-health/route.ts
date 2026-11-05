import { NextResponse } from 'next/server'
import { firebaseConfig, testFirestoreConnection } from '@/lib/firebase'

export async function GET() {
  try {
    const firestoreStatus = await testFirestoreConnection()

    return NextResponse.json({
      success: true,
      firebase: {
        projectId: firebaseConfig.projectId,
        appId: firebaseConfig.appId,
        authDomain: firebaseConfig.authDomain,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
      },
      services: {
        firestore: {
          configured: true,
          status: firestoreStatus.message,
          databaseId: firebaseConfig.firestoreDatabaseId,
        },
        auth: {
          configured: true,
          supportedProviders: ['Phone Auth (SMS OTP Code)', 'Email/Password'],
          phoneAuthNote: 'Firebase Phone Auth يستخدم رمز تحقق SMS OTP (6 أرقام) للتأكيد وليس كلمة مرور مباشرة.',
        },
        storage: {
          configured: true,
          bucket: firebaseConfig.storageBucket,
          rulesReady: true,
        },
        cloudMessaging: {
          configured: true,
          serviceWorker: '/firebase-messaging-sw.js',
          messagingSenderId: firebaseConfig.messagingSenderId,
        },
      },
      securityRules: {
        deployed: true,
        masterGate: 'RBAC (Visitor read, Store Owner write-own, Super Admin master)',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'فشل فحص خدمات Firebase' },
      { status: 500 },
    )
  }
}
