const fs = require('fs');
const path = require('path');

// Load SUPABASE_SERVICE_ROLE_KEY from .env.local (never commit this file / never
// bundle this key into client code — it has admin rights on the project).
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const SUPABASE_URL = 'https://mtusdkooiuoocyffsznx.supabase.co';
const BUCKET = 'bookmarklet';
const OBJECT_PATH = 'bundle.js';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY not found in env or .env.local');
  process.exit(1);
}

const bundlePath = path.resolve(__dirname, 'dist/bundle.js');
if (!fs.existsSync(bundlePath)) {
  console.error("ERROR: dist/bundle.js not found. Run 'npm run build' first.");
  process.exit(1);
}

const identityPath = path.resolve(__dirname, 'identity.html');

async function upload(filePath, objectPath, contentType) {
  const body = fs.readFileSync(filePath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`ERROR: upload of ${objectPath} failed`, res.status, text);
    process.exit(1);
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
  console.log(`SUCCESS: ${objectPath} deployed to`, publicUrl);
  console.log('  Size:', (body.length / 1024).toFixed(1), 'KB');
}

(async () => {
  await upload(bundlePath, OBJECT_PATH, 'application/javascript');
  if (fs.existsSync(identityPath)) {
    // identity.html is the cross-site identity broker iframe -- it rarely
    // changes, but redeploy it alongside the bundle so it never drifts out
    // of sync with what chat.js expects on the wire.
    await upload(identityPath, 'identity.html', 'text/html');
  }
})();
