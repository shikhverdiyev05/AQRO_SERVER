import { db } from './firebase.js';

// CORS header-lərini bütün metodlar üçün tənlə
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Request body-ni JSON kimi oxu
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Yanlış JSON formatı'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const { name, id: queryId } = req.query;
  const method = req.method?.toUpperCase();

  setCORSHeaders(res);

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!db) {
    return res.status(500).json({ error: 'Firebase qoşulması qurulmayıb. Environment Variable-ları yoxlayın.' });
  }

  const collectionRef = db.collection(name);

  try {
    // ── GET ────────────────────────────────────────────────────────────────
    if (method === 'GET') {
      const snapshot = await collectionRef.get();
      
      if (snapshot.empty) {
         return res.status(200).json([]);
      }

      // Əgər kolleksiyada yalnız 1 sənəd varsa və adı "_default"-dursa, 
      // deməli bu tək obyektdir (məs: media.json) və ya string massividir (regions.json)
      if (snapshot.size === 1 && snapshot.docs[0].id === '_default') {
         const data = snapshot.docs[0].data();
         res.setHeader('Cache-Control', 'no-store');
         
         // String massividirsə (regions)
         if (data.items && Array.isArray(data.items)) {
             return res.status(200).json(data.items);
         }
         // Tək obyektdirsə
         return res.status(200).json(data);
      }

      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(docs);
    }

    // ── POST ───────────────────────────────────────────────────────────────
    if (method === 'POST') {
      const body = await parseBody(req);
      
      // Mövcud tək obyekt (singleton) yoxlanışı
      const defaultDoc = await collectionRef.doc('_default').get();
      if (defaultDoc.exists) {
         // Singleton-a əlavə etmək (məs: Array-dirsə)
         const data = defaultDoc.data();
         if (data.items && Array.isArray(data.items)) {
            data.items.push(body); // Stringlər üçün
            await collectionRef.doc('_default').set(data);
            return res.status(201).json({ success: true, data: body });
         } else {
            // Obyektdirsə merge
            await collectionRef.doc('_default').set(body, { merge: true });
            return res.status(201).json({ success: true, data: body });
         }
      }

      const docId = body.id || `${name.slice(0, 3)}-${Date.now()}`;
      const dataToSave = { ...body, id: docId };
      
      await collectionRef.doc(docId).set(dataToSave);
      return res.status(201).json({ success: true, data: dataToSave });
    }

    // ── PUT ────────────────────────────────────────────────────────────────
    if (method === 'PUT') {
      const body = await parseBody(req);
      const id = queryId || body.id;
      
      const defaultDoc = await collectionRef.doc('_default').get();
      if (defaultDoc.exists) {
         // Tək obyektin PUT ilə yenilənməsi
         await collectionRef.doc('_default').set(body, { merge: true });
         return res.status(200).json({ success: true, data: body });
      }

      if (!id) {
        return res.status(400).json({ error: 'PUT üçün id lazımdır: ?id=... və ya body-də "id" sahəsi' });
      }

      await collectionRef.doc(id).set(body, { merge: true });
      return res.status(200).json({ success: true, data: { ...body, id } });
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (method === 'DELETE') {
      const id = queryId;
      if (!id) {
        return res.status(400).json({ error: 'DELETE üçün ?id= parametri lazımdır' });
      }

      await collectionRef.doc(id).delete();
      return res.status(200).json({ success: true, deleted: id });
    }

    return res.status(405).json({ error: `${method} metodu dəstəklənmir` });
  } catch (error) {
    console.error('Firestore Error:', error);
    return res.status(500).json({ error: 'Daxili server xətası' });
  }
}
