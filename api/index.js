import { db } from './firebase.js';

function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCORSHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (!db) {
    return res.status(500).json({ error: 'Firebase qoşulması qurulmayıb.' });
  }

  try {
    // Firestore-dakı bütün kolleksiyaları siyahıla
    const collections = await db.listCollections();
    
    const endpoints = collections.map(col => ({
      name: col.id,
      url: `/api/${col.id}`,
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }));

    return res.status(200).json({
      message: 'AQRO JSON API — Mövcud endpointlər (Firebase Firestore)',
      version: '3.0.0',
      endpoints
    });
  } catch (error) {
    console.error('Firestore Error:', error);
    return res.status(500).json({ error: 'Daxili server xətası' });
  }
}
