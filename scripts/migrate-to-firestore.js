import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ESM mühitində __dirname əvəzinə
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Admin SDK konfiqurasiyası
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  : undefined;

if (!process.env.FIREBASE_PROJECT_ID || !privateKey) {
  console.error("XƏTA: FIREBASE_PROJECT_ID və ya FIREBASE_PRIVATE_KEY tapılmadı!");
  console.error("Zəhmət olmasa proyektin ana qovluğunda .env faylı yaradıb məlumatları daxil edin.");
  process.exit(1);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  })
});

const db = getFirestore(app);
const DATA_DIR = path.join(__dirname, '..', 'api', 'data');

async function migrate() {
  console.log('Miqrasiya başlayır...');
  
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'testData.json');

  for (const file of files) {
    const collectionName = file.replace('.json', '');
    console.log(`\n📦 Kolleksiya oxunur: ${collectionName}`);
    
    const filePath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    const collectionRef = db.collection(collectionName);
    
    let count = 0;

    if (Array.isArray(data)) {
      if (data.length > 0 && typeof data[0] !== 'object') {
        // Məsələn regions.json: ["Bakı", "Quba"]
        await collectionRef.doc('_default').set({ items: data });
        count++;
      } else {
        // Məsələn products.json: [{id: 1, ...}]
        for (const item of data) {
          const docId = item.id || `${collectionName.slice(0,3)}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          await collectionRef.doc(String(docId)).set(item);
          count++;
        }
      }
    } else if (data && typeof data === 'object') {
      // Tək obyekt (məs: faq.json, media.json)
      await collectionRef.doc('_default').set(data);
      count++;
    }
    
    console.log(`✅ ${count} sənəd '${collectionName}' kolleksiyasına yazıldı.`);
  }

  console.log('\n🎉 Miqrasiya uğurla tamamlandı!');
}

migrate().catch(console.error);
