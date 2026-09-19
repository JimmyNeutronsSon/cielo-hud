const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, 'dist');
const bundlePath = path.join(distDir, 'bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.error("ERROR: dist/bundle.js not found. Run 'npm run build' first.");
  process.exit(1);
}

// The static host (see render.yaml) publishes dist/ as the site root, so
// index.html and every local asset it references must live alongside
// dist/bundle.js there.
const assets = ['index.html', 'cloak.js', 'favicon-192.png'];

for (const asset of assets) {
  const src = path.resolve(__dirname, asset);
  if (!fs.existsSync(src)) {
    console.error(`ERROR: ${asset} not found at repo root.`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(distDir, asset));
  console.log(`SUCCESS: copied ${asset} to dist/`);
}
