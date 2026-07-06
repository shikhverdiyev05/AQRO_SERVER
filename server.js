const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const name = req.url.replace('/api/', '').replace(/\/$/, '');

  if (!name || name === '/') {
    const files = fs.readdirSync(path.join(__dirname, 'api', 'data'))
      .filter(f => f.endsWith('.json'))
      .map(f => `/api/${f.replace('.json', '')}`);
    res.end(JSON.stringify({ endpoints: files }));
    return;
  }

  const filePath = path.join(__dirname, 'api', 'data', `${name}.json`);

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: `Endpoint "${name}" not found` }));
    return;
  }

  const data = fs.readFileSync(filePath, 'utf-8');
  res.end(data);
});

server.listen(3000, () => {
  console.log('Server ugurla yaradildi ve server isleyir: http://localhost:3000');
  console.log('Endpoints:');
  fs.readdirSync(path.join(__dirname, 'api', 'data'))
    .filter(f => f.endsWith('.json'))
    .forEach(f => console.log(`  http://localhost:3000/api/${f.replace('.json', '')}`));
});
