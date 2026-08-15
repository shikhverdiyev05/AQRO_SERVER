import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
  privateKey = privateKey.replace(/^[`'"\x22]|[`'"\x22]$/g, '');
  if (privateKey.includes('\\n')) {
     privateKey = privateKey.replace(/\\n/g, '\n');
  }
}

if (!process.env.FIREBASE_PROJECT_ID || !privateKey) {
  console.error("❌ FIREBASE env dəyişənləri tapılmadı!");
  process.exit(1);
}

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  })
});

const db = getFirestore(app);

async function test() {
  console.log('═══════════════════════════════════════════');
  console.log('  🔥 Firebase & ImgBB Bağlantı Testi');
  console.log('═══════════════════════════════════════════\n');

  // ── TEST 1: Firestore Bağlantısı ─────────────────────────────────
  console.log('📡 TEST 1: Firestore bağlantısı...');
  try {
    const collections = await db.listCollections();
    const names = collections.map(c => c.id);
    console.log(`✅ Firestore bağlantısı uğurlu! ${names.length} kolleksiya tapıldı:`);
    names.forEach(n => console.log(`   • ${n}`));
  } catch (e) {
    console.error('❌ Firestore bağlantı xətası:', e.message);
    return;
  }

  // ── TEST 2: GET — Products kolleksiyasından oxuma ──────────────────
  console.log('\n📡 TEST 2: Firestore-dan GET (products)...');
  try {
    const snapshot = await db.collection('products').get();
    console.log(`✅ ${snapshot.size} məhsul oxundu.`);
    if (snapshot.size > 0) {
      const first = snapshot.docs[0].data();
      console.log(`   İlk məhsul: "${first.title || first.name || first.id}"`);
    }
  } catch (e) {
    console.error('❌ GET xətası:', e.message);
  }

  // ── TEST 3: POST — Comments kolleksiyasına yazma ──────────────────
  console.log('\n📡 TEST 3: Firestore-a POST (comments)...');
  const testComment = {
    id: `test-${Date.now()}`,
    text: 'Bu test şərhidir',
    author: 'Test Bot',
    createdAt: new Date().toISOString()
  };
  try {
    await db.collection('comments').doc(testComment.id).set(testComment);
    console.log(`✅ Şərh uğurla yazıldı: id="${testComment.id}"`);
    
    // Yoxlama: oxuyaq
    const doc = await db.collection('comments').doc(testComment.id).get();
    if (doc.exists) {
      console.log(`✅ Yazılan şərh uğurla geri oxundu!`);
    }

    // Təmizlə
    await db.collection('comments').doc(testComment.id).delete();
    console.log(`🗑️  Test şərhi silindi.`);
  } catch (e) {
    console.error('❌ POST xətası:', e.message);
  }

  // ── TEST 4: ImgBB API Key yoxlanışı ───────────────────────────────
  console.log('\n📡 TEST 4: ImgBB API Key yoxlanışı...');
  if (process.env.IMGBB_API_KEY) {
    console.log(`✅ IMGBB_API_KEY mövcuddur (${process.env.IMGBB_API_KEY.slice(0, 6)}...)`);
    
    // Minimal 1x1 pixel test şəkli (base64)
    const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    
    try {
      const formData = new URLSearchParams();
      formData.append('key', process.env.IMGBB_API_KEY);
      formData.append('image', testBase64);
      formData.append('name', 'aqro-test');

      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await response.json();
      if (json.success) {
        console.log(`✅ ImgBB yükləmə uğurlu!`);
        console.log(`   URL: ${json.data.url}`);
        console.log(`   Silmə URL: ${json.data.delete_url}`);
      } else {
        console.error('❌ ImgBB xətası:', json.error?.message);
      }
    } catch (e) {
      console.error('❌ ImgBB sorğu xətası:', e.message);
    }
  } else {
    console.warn('⚠️  IMGBB_API_KEY tapılmadı. Şəkil yükləmə test edilə bilmir.');
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  ✨ Bütün testlər tamamlandı!');
  console.log('═══════════════════════════════════════════');
}

test().catch(console.error);
