import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-də __dirname mövcud deyil — fileURLToPath ilə həll edirik
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Vercel production-da /tmp yazılabilir, /api/data isə read-only-dir.
// Strategiya:
//   1. GET sorğusunda əvvəlcə /tmp cache-ini yoxla, yoxdursa bundled faylı oxu.
//   2. POST/PUT/DELETE sorğularında /tmp-ə yaz ki, eyni serverless instance
//      üzərində növbəti GET sorğusunda yenilənmiş data qayıtsın.
//   (Qeyd: Vercel cold-start-dan sonra /tmp sıfırlanır — bu, stateless
//    serverless-in məhdudiyyətidir. Kalıcı saxlama üçün xarici DB lazımdır.)

const TMP_DIR = '/tmp/aqro-data';
const DATA_DIR = join(__dirname, 'data');

// CORS header-lərini bütün metodlar üçün tənlə
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// Məlumatı oxu: əvvəlcə /tmp cache, sonra bundled fayl
function readData(name) {
  const isVercel = process.env.VERCEL === '1';

  if (isVercel) {
    const tmpPath = `${TMP_DIR}/${name}.json`;
    if (existsSync(tmpPath)) {
      return JSON.parse(readFileSync(tmpPath, 'utf-8'));
    }
  }

  const bundledPath = join(DATA_DIR, `${name}.json`);
  if (!existsSync(bundledPath)) return null;
  return JSON.parse(readFileSync(bundledPath, 'utf-8'));
}

// Məlumatı yaz:
//   - Vercel production-da → /tmp/aqro-data/ (session-daxili, kalıcı deyil)
//   - Lokal dev-də → api/data/ (faylı birbaşa yenilə)
function writeData(name, data) {
  const isVercel = process.env.VERCEL === '1';

  if (isVercel) {
    mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(`${TMP_DIR}/${name}.json`, JSON.stringify(data, null, 2), 'utf-8');
  } else {
    const bundledPath = join(DATA_DIR, `${name}.json`);
    writeFileSync(bundledPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }
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

  // OPTIONS — CORS preflight sorğusu (browser-in POST/PUT/DELETE öncə göndərdiyi)
  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Endpoint-in mövcudluğunu yoxla
  const bundledPath = join(DATA_DIR, `${name}.json`);
  if (!existsSync(bundledPath)) {
    return res.status(404).json({ error: `Endpoint "${name}" tapılmadı` });
  }

  // ── GET ────────────────────────────────────────────────────────────────
  if (method === 'GET') {
    const data = readData(name);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  }

  // ── POST ───────────────────────────────────────────────────────────────
  // Array: yeni element əlavə et
  // Object: key-value birləşdir
  if (method === 'POST') {
    let body;
    try { body = await parseBody(req); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const data = readData(name);

    let updated;
    if (Array.isArray(data)) {
      if (!body.id) {
        body.id = `${name.slice(0, 3)}-${Date.now()}`;
      }
      updated = [...data, body];
    } else if (data !== null && typeof data === 'object') {
      updated = { ...data, ...body };
    } else {
      return res.status(422).json({ error: 'Bu endpoint POST-u dəstəkləmir' });
    }

    writeData(name, updated);
    return res.status(201).json({ success: true, data: body });
  }

  // ── PUT ────────────────────────────────────────────────────────────────
  // Array: ?id=... və ya body.id ilə elementi tap, birləşdir
  // Object: bütün obyekti yenilə (merge)
  if (method === 'PUT') {
    let body;
    try { body = await parseBody(req); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    const data = readData(name);

    let updated;
    if (Array.isArray(data)) {
      const id = queryId || body.id;
      if (!id) {
        return res.status(400).json({ error: 'PUT üçün id lazımdır: ?id=... və ya body-də "id" sahəsi' });
      }
      const idx = data.findIndex(item => String(item.id) === String(id));
      if (idx === -1) {
        return res.status(404).json({ error: `id="${id}" olan element tapılmadı` });
      }
      updated = [...data];
      updated[idx] = { ...data[idx], ...body, id: data[idx].id };
    } else if (data !== null && typeof data === 'object') {
      updated = { ...data, ...body };
    } else {
      return res.status(422).json({ error: 'Bu endpoint PUT-u dəstəkləmir' });
    }

    writeData(name, updated);
    return res.status(200).json({ success: true, data: Array.isArray(updated) ? updated.find(i => String(i.id) === String(queryId || body.id)) : updated });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────
  // Array-dan ?id=... ilə elementi sil
  if (method === 'DELETE') {
    const id = queryId;
    if (!id) {
      return res.status(400).json({ error: 'DELETE üçün ?id= parametri lazımdır' });
    }

    const data = readData(name);
    if (!Array.isArray(data)) {
      return res.status(422).json({ error: 'DELETE yalnız array tipli endpointlər üçün dəstəklənir' });
    }

    const before = data.length;
    const updated = data.filter(item => String(item.id) !== String(id));

    if (updated.length === before) {
      return res.status(404).json({ error: `id="${id}" olan element tapılmadı` });
    }

    writeData(name, updated);
    return res.status(200).json({ success: true, deleted: id });
  }

  return res.status(405).json({ error: `${method} metodu dəstəklənmir` });
}
