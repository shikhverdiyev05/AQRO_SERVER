const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const testDataPath = path.join(root, 'api', 'data', 'testData.json');
const dataDir = path.join(root, 'api', 'data');
const uploadsDir = path.join(root, 'public', 'uploads');

const testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));

const endpointKeys = [
  'categories',
  'users',
  'listings',
  'posts',
  'comments',
  'balanceTransactions',
  'basket',
  'faq',
  'about',
  'contactInfo'
];

for (const key of endpointKeys) {
  const filePath = path.join(dataDir, `${key}.json`);
  fs.writeFileSync(filePath, JSON.stringify(testData[key], null, 2) + '\n', 'utf-8');
  console.log(`Yazildi: api/data/${key}.json`);
}

const minimalJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRygITChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTChMTL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

function collectUploadPaths(value, paths = new Set()) {
  if (typeof value === 'string' && value.includes('/uploads/')) {
    const match = value.match(/\/uploads\/[^"'\s]+/);
    if (match) paths.add(match[0]);
  } else if (Array.isArray(value)) {
    value.forEach(item => collectUploadPaths(item, paths));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectUploadPaths(item, paths));
  }
  return paths;
}

const uploadPaths = [...collectUploadPaths(testData)].sort();

for (const uploadPath of uploadPaths) {
  const relativePath = uploadPath.replace(/^\/uploads\//, '');
  const filePath = path.join(uploadsDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, minimalJpeg);
  console.log(`Yaradildi: public/uploads/${relativePath}`);
}

const mediaManifest = {
  message: 'testData.json ile uyumlu media depolama strukturu',
  baseUrl: '/uploads',
  productionBaseUrl: 'https://aqro-server.vercel.app/uploads',
  collections: [
    {
      name: 'avatars',
      path: '/uploads/avatars',
      purpose: 'Istifadeci profil sekilleri',
      files: uploadPaths.filter(p => p.startsWith('/uploads/avatars/'))
    },
    {
      name: 'listings',
      path: '/uploads/listings',
      purpose: 'Elan sekilleri',
      files: uploadPaths.filter(p => p.startsWith('/uploads/listings/'))
    },
    {
      name: 'posts',
      path: '/uploads/posts',
      purpose: 'Post sekilleri',
      files: uploadPaths.filter(p => p.startsWith('/uploads/posts/'))
    },
    {
      name: 'team',
      path: '/uploads/team',
      purpose: 'Komanda uzvleri sekilleri',
      files: uploadPaths.filter(p => p.startsWith('/uploads/team/'))
    }
  ],
  endpoints: endpointKeys.map(key => `/api/${key}`)
};

fs.writeFileSync(
  path.join(dataDir, 'media.json'),
  JSON.stringify(mediaManifest, null, 2) + '\n',
  'utf-8'
);
console.log('Yazildi: api/data/media.json');
