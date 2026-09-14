const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, 'dist/bundle.js');
const bookmarkletTxtPath = path.resolve(__dirname, 'dist/bookmarklet.txt');
const indexPath = path.resolve(__dirname, 'index.html');

if (!fs.existsSync(bundlePath)) {
  console.log("Please run 'npm run build' first!");
  process.exit(1);
}

// Sanity-check the local build still parses, even though it's not what ships
// in the bookmarklet anymore — this catches build breakage before deploy.
try {
  new Function(fs.readFileSync(bundlePath, 'utf8'));
} catch (e) {
  console.error('ERROR: dist/bundle.js does not parse:', e.message);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADER BOOKMARKLET
// Instead of embedding the whole bundle in the javascript: URL (which means
// every code change requires re-dragging a new bookmarklet), this bookmarklet
// is a tiny, stable loader: it injects a <script> tag pointing at the bundle
// hosted on Supabase Storage. Updating the HUD is then just `npm run deploy`
// (uploads dist/bundle.js) -- everyone's existing bookmarklet picks up the
// change on their next click, no re-install needed.
//
// A cache-busting query param (?v=timestamp) forces the browser to fetch the
// latest file instead of a cached copy.
// ─────────────────────────────────────────────────────────────────────────────
const BUNDLE_URL = 'https://mtusdkooiuoocyffsznx.supabase.co/storage/v1/object/public/bookmarklet/bundle.js';

const loaderSrc = `void function(){var d=document,s=d.createElement("script");s.src=${JSON.stringify(BUNDLE_URL)}+"?v="+Date.now();d.head.appendChild(s);}();`;

// Round-trip check.
try {
  new Function(loaderSrc);
} catch (e) {
  console.error('ERROR: loader script does not parse:', e.message);
  process.exit(1);
}

const bookmarkletString = 'javascript:' + encodeURIComponent(loaderSrc);

fs.writeFileSync(bookmarkletTxtPath, bookmarkletString);
console.log('SUCCESS: Loader bookmarklet generated at dist/bookmarklet.txt');
console.log('  Size:', bookmarkletString.length, 'bytes');
console.log('  Points to:', BUNDLE_URL);
console.log("  Remember: this bookmarklet never needs updating again -- just run 'npm run deploy' after 'npm run build'.");

// Sync into index.html
if (fs.existsSync(indexPath)) {
  let indexHtml = fs.readFileSync(indexPath, 'utf8');
  const encodedBookmarklet = bookmarkletString
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  indexHtml = indexHtml.replace(
    /id="bookmarklet-link"\s+href="[^"]*"/,
    `id="bookmarklet-link" href="${encodedBookmarklet}"`
  );
  fs.writeFileSync(indexPath, indexHtml);
  console.log('SUCCESS: index.html drag-and-drop link synced.');
}
