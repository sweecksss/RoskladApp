import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messaging;

export function getFcmMessaging() {
  if (messaging) return messaging;
  if (process.env.FCM_ENABLED !== 'true') return null;

  try {
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
      : applicationDefault();
    const app = getApps()[0] || initializeApp({ credential });
    messaging = getMessaging(app);
    return messaging;
  } catch (error) {
    console.error('[fcm] initialization failed:', error.message);
    return null;
  }
}
