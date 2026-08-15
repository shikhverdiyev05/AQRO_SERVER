import { Buffer } from 'buffer';

const IMGBB_API_KEY = process.env.IMGBB_API_KEY;

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

// Sadə multipart parser
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

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) { start = partEnd; continue; }

    const headerStr = part.slice(0, headerEnd).toString('utf-8');
    const body = part.slice(headerEnd + 4, part.length - 2);

    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);

    if (nameMatch) {
      parts.push({
        fieldName: nameMatch[1],
        filename: filenameMatch ? filenameMatch[1] : null,
        data: body,
      });
    }

    start = partEnd;
  }
  return parts;
}

// ImgBB-yə şəkil göndərmək üçün köməkçi funksiya
async function uploadToImgBB(base64Data, filename) {
  if (!IMGBB_API_KEY) {
    throw new Error('IMGBB_API_KEY təyin edilməyib');
  }

  const formData = new URLSearchParams();
  formData.append('key', IMGBB_API_KEY);
  formData.append('image', base64Data);
  if (filename) formData.append('name', filename);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`ImgBB xətası: ${errorData.error?.message || response.statusText}`);
  }

  const json = await response.json();
  return json.data;
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

  try {
    // ── multipart/form-data ──────────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
      const boundary = getBoundary(contentType);
      if (!boundary) return res.status(400).json({ error: 'Boundary tapılmadı' });

      const rawBody = await readRawBody(req);
      const parts = parseMultipart(rawBody, boundary);

      const fileParts = parts.filter(p => p.filename && p.data.length > 0);
      if (fileParts.length === 0) {
        return res.status(400).json({ error: 'Heç bir fayl tapılmadı' });
      }

      const uploaded = [];
      for (const part of fileParts) {
        const base64Data = part.data.toString('base64');
        const imgData = await uploadToImgBB(base64Data, part.filename.split('.')[0]);
        
        uploaded.push({
          originalName: part.filename,
          url: imgData.url,
          fullUrl: imgData.url, // Geri uyğunluq üçün
          deleteUrl: imgData.delete_url,
          size: imgData.size
        });
      }

      return res.status(201).json({
        success: true,
        message: `${uploaded.length} fayl uğurla yükləndi`,
        files: uploaded,
        url: uploaded[0]?.url,
        fullUrl: uploaded[0]?.url,
      });
    }

    // ── application/json (Base64) ────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const rawBody = await readRawBody(req);
      const body = JSON.parse(rawBody.toString('utf-8'));
      
      const { base64, filename } = body;
      
      if (!base64) {
        return res.status(400).json({ error: '"base64" sahəsi tələb olunur' });
      }

      // "data:image/png;base64,..." formatını təmizlə
      const base64Data = base64.replace(/^data:[^;]+;base64,/, '');
      
      const imgData = await uploadToImgBB(base64Data, filename);

      return res.status(201).json({
        success: true,
        url: imgData.url,
        fullUrl: imgData.url,
        filename: filename || imgData.title,
        deleteUrl: imgData.delete_url
      });
    }

    return res.status(415).json({
      error: 'Content-Type "multipart/form-data" və ya "application/json" olmalıdır'
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: error.message || 'Fayl yüklənərkən xəta baş verdi' });
  }
}
