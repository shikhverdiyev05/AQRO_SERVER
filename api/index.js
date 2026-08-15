import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM-də __dirname mövcud deyil — fileURLToPath ilə həll edirik
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default function handler(req, res) {
  setCORSHeaders(res);

  // OPTIONS — CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const dataDir = join(__dirname, 'data');

  if (!existsSync(dataDir)) {
    return res.status(500).json({ error: 'Data qovluğu tapılmadı' });
  }

  const files = readdirSync(dataDir).filter(f => f.endsWith('.json'));

  const endpoints = files.map(f => ({
    name: f.replace('.json', ''),
    url: `/api/${f.replace('.json', '')}`,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }));

  return res.status(200).json({
    message: 'AQRO JSON API — Mövcud endpointlər',
    version: '2.0.0',
    endpoints
  });
}
