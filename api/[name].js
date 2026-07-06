import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default function handler(req, res) {
  const { name } = req.query;

  const filePath = join(__dirname, 'data', `${name}.json`);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: `Endpoint "${name}" not found` });
  }

  const data = JSON.parse(readFileSync(filePath, 'utf-8'));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
  res.status(200).json(data);
}
