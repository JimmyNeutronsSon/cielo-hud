const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, 'dist');
const bundlePath = path.join(distDir, 'bundle.js');
const indexPath = path.resolve(__dirname, 'index.html');
const distIndexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(bundlePath)) {
  console.error("ERROR: dist/bundle.js not found. Run 'npm run build' first.");
  process.exit(1);
}

// index.html at the repo root is the source of truth for local previews, where
// the bundle lives at ./dist/bundle.js. On a static host (see render.yaml) the
// publish directory IS dist/, so the deployed copy must point the preview
// button at ./bundle.js relative to the site root instead.
let html = fs.readFileSync(indexPath, 'utf8');
const deployed = html.replace('"./dist/bundle.js?t="', '"./bundle.js?t="');

if (deployed === html) {
  console.error('ERROR: could not find the preview bundle reference to rewrite.');
  process.exit(1);
}

fs.writeFileSync(distIndexPath, deployed);
console.log('SUCCESS: static-site index.html written to dist/index.html');
console.log('  Preview reference: ./bundle.js (site-relative)');