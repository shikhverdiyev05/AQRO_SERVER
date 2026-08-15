import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname düzəlişi
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const ALLOWED_COLLECTIONS = ['avatars', 'listings', 'posts', 'team', 'shapes'];
const MAX_SIZE_MB = 5;

function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// multipart/form-data body-ni raw buffer kimi oxu
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// multipart/form-data boundary-ni tap
function getBoundary(contentType) {
  const match = contentType?.match(/boundary=(.+)$/);
  return match ? match[1] : null;
}

// multipart body-ni parse et — sadə implementasiya
function parseMultipart(buffer, boundary) {
  const sep = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;

  while (start < buffer.length) {
    const sepIdx = buffer.indexOf(sep, start);
    if (sepIdx === -1) break;

    const partStart = sepIdx + sep.length;
    const nextSepIdx = buffer.indexOf(sep, partStart);
    const partEnd = nextSepIdx === -1 ? buffer.length : nextSepIdx;

    const part = buffer.slice(partStart, partEnd);

    // Header-ləri ayır (\r\n\r\n ilə)
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) { start = partEnd; continue; }

    const headerStr = part.slice(0, headerEnd).toString('utf-8');
    // Son \r\n-i çıxart
    const body = part.slice(headerEnd + 4, part.length - 2);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);

    if (nameMatch) {
      parts.push({
        fieldName: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : null,
        contentType: ctMatch ? ctMatch[1].trim() : 'text/plain',
        data: body,
      });
    }

    start = partEnd;
  }

  return parts;
}

export default async function handler(req, res) {
  setCORSHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Yalnız POST metodu dəstəklənir' });
  }

  const contentType = req.headers['content-type'] || '';
  const isVercel = process.env.VERCEL === '1';

  // Şəkli haraya saxla
  // - Vercel production: /tmp/aqro-uploads/ (session-daxili)
  // - Lokal dev: public/uploads/ (kalıcı)
  const uploadsBase = isVercel
    ? '/tmp/aqro-uploads'
    : join(__dirname, '..', 'public', 'uploads');

  // ── multipart/form-data (klassik file input) ────────────────────────────
  if (contentType.includes('multipart/form-data')) {
    const boundary = getBoundary(contentType);
    if (!boundary) {
      return res.status(400).json({ error: 'multipart boundary tapılmadı' });
    }

    const rawBody = await readRawBody(req);
    const parts = parseMultipart(rawBody, boundary);

    // "collection" field-ini tap (avatars / listings / posts / team ...)
    const collectionPart = parts.find(p => p.fieldName === 'collection' && !p.filename);
    const collection = collectionPart ? collectionPart.data.toString('utf-8').trim() : 'uploads';

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return res.status(400).json({ error: `Yanlış collection. İcazə verilənlər: ${ALLOWED_COLLECTIONS.join(', ')}` });
    }

    // File part-larını tap
    const fileParts = parts.filter(p => p.filename && p.data.length > 0);
    if (fileParts.length === 0) {
      return res.status(400).json({ error: 'Heç bir fayl tapılmadı' });
    }

    const uploaded = [];

    for (const part of fileParts) {
      const mimeType = part.contentType.split(';')[0].trim();
      const ext = ALLOWED_TYPES[mimeType];

      if (!ext) {
        return res.status(415).json({ error: `Dəstəklənməyən fayl tipi: ${mimeType}. İcazə verilənlər: ${Object.keys(ALLOWED_TYPES).join(', ')}` });
      }

      if (part.data.length > MAX_SIZE_MB * 1024 * 1024) {
        return res.status(413).json({ error: `Fayl həcmi ${MAX_SIZE_MB}MB-dən böyükdür` });
      }

      const timestamp = Date.now();
      const random = Math.random().toString(36).slice(2, 8);
      const filename = `${timestamp}_${random}${ext}`;
      const dir = join(uploadsBase, collection);

      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, filename), part.data);

      const url = `/uploads/${collection}/${filename}`;
      uploaded.push({
        originalName: part.filename,
        filename,
        url,
        fullUrl: `https://aqro-server.vercel.app${url}`,
        collection,
        size: part.data.length,
        mimeType,
      });
    }

    return res.status(201).json({
      success: true,
      message: `${uploaded.length} fayl uğurla yükləndi`,
      files: uploaded,
      // Tək fayl yükləmə üçün qısa girişim
      url: uploaded[0]?.url,
      fullUrl: uploaded[0]?.fullUrl,
    });
  }

  // ── application/json (base64 şəkil) ────────────────────────────────────
  if (contentType.includes('application/json')) {
    let body;
    try {
      const raw = await readRawBody(req);
      body = JSON.parse(raw.toString('utf-8'));
    } catch {
      return res.status(400).json({ error: 'Yanlış JSON formatı' });
    }

    const { base64, mimeType, collection = 'uploads', filename: customName } = body;

    if (!base64) {
      return res.status(400).json({ error: '"base64" sahəsi tələb olunur' });
    }

    if (!ALLOWED_COLLECTIONS.includes(collection)) {
      return res.status(400).json({ error: `Yanlış collection. İcazə verilənlər: ${ALLOWED_COLLECTIONS.join(', ')}` });
    }

    const mime = mimeType || 'image/jpeg';
    const ext = ALLOWED_TYPES[mime] || '.jpg';

    // "data:image/png;base64,..." formatını təmizlə
    const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > MAX_SIZE_MB * 1024 * 1024) {
      return res.status(413).json({ error: `Fayl həcmi ${MAX_SIZE_MB}MB-dən böyükdür` });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const filename = customName || `${timestamp}_${random}${ext}`;
    const dir = join(uploadsBase, collection);

    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), buffer);

    const url = `/uploads/${collection}/${filename}`;

    return res.status(201).json({
      success: true,
      url,
      fullUrl: `https://aqro-server.vercel.app${url}`,
      filename,
      collection,
      size: buffer.length,
    });
  }

  return res.status(415).json({
    error: 'Content-Type "multipart/form-data" və ya "application/json" olmalıdır',
  });
}
