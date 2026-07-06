import { readdirSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  const dataDir = join(__dirname, 'data');
  const files = readdirSync(dataDir).filter(f => f.endsWith('.json'));

  const endpoints = files.map(f => ({
    name: f.replace('.json', ''),
    url: `/api/${f.replace('.json', '')}`
  }));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    message: 'JSON API - Mövcud endpointlər',
    endpoints
  });
}
