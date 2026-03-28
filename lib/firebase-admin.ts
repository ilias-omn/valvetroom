import 'server-only';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const globalForAdmin = globalThis as unknown as { _firebaseAdmin: App | undefined };

function initAdmin(): App {
  if (globalForAdmin._firebaseAdmin) return globalForAdmin._firebaseAdmin;

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  const app = getApps().length === 0
    ? initializeApp({
        credential: cert({
          projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey,
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
    : getApps()[0];

  globalForAdmin._firebaseAdmin = app;
  return app;
}

export function getAdminAuth() {
  initAdmin();
  return getAuth();
}
