import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const getFirebaseConfig = () => {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  };
};

let db = null;

if (!getApps().length) {
  const config = getFirebaseConfig();
  
  if (config.projectId && config.privateKey && config.clientEmail) {
    const app = initializeApp({
      credential: cert(config),
    });
    db = getFirestore(app);
  } else {
    console.warn('⚠️ Firebase konfiqurasiya məlumatları (Env vars) tapılmadı! Firebase-ə qoşulmur.');
  }
} else {
  db = getFirestore();
}

export { db };
