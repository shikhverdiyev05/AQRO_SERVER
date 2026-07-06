const http = require('http');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'api', 'data');
const publicDir = path.join(__dirname, 'public');
const indexFile = path.join(__dirname, 'index.html');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'File not found' }));
    return;
  }

  res.setHeader('Content-Type', contentType);
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const cleanUrl = (req.url || '/').split('?')[0];

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (cleanUrl === '/') {
    sendFile(res, indexFile);
    return;
  }

  if (cleanUrl.startsWith('/uploads/')) {
    const assetPath = path.join(publicDir, cleanUrl.replace(/^\/+/, ''));
    sendFile(res, assetPath);
    return;
  }

  if (cleanUrl === '/api' || cleanUrl === '/api/') {
    const files = fs.readdirSync(dataDir)
      .filter(file => file.endsWith('.json'))
      .map(file => `/api/${file.replace('.json', '')}`);

    sendJson(res, 200, { endpoints: files });
    return;
  }

  if (cleanUrl.startsWith('/api/')) {
    const name = cleanUrl.replace('/api/', '').replace(/\/$/, '');
    const filePath = path.join(dataDir, `${name}.json`);

    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: `Endpoint "${name}" not found` });
      return;
    }

    sendFile(res, filePath);
    return;
  }

  sendJson(res, 404, { error: 'Route not found' });
});

server.listen(3000, () => {
  console.log('Server ugurla yaradildi ve server isleyir: http://localhost:3000');
  console.log('Endpoints:');
  fs.readdirSync(dataDir)
    .filter(file => file.endsWith('.json'))
    .forEach(file => console.log(`  http://localhost:3000/api/${file.replace('.json', '')}`));
  console.log('Media (testData.json):');
  console.log('  http://localhost:3000/uploads/avatars/usr_001.jpg');
  console.log('  http://localhost:3000/uploads/listings/1001_1.jpg');
  console.log('  http://localhost:3000/uploads/posts/501_1.jpg');
  console.log('  http://localhost:3000/uploads/team/1.jpg');
});
