const fs = require('fs');
const bm = fs.readFileSync('./dist/bookmarklet.txt', 'utf8');
const sq = String.fromCharCode(39);

// The problematic pattern is a bare apostrophe that appears as a regex character: /'/g
// In the bundle it would appear as the regex /\u0027/g after our fix.
// Let's check if ANY bare apostrophe appears directly in JS syntax positions.

// Count apostrophes that are NOT inside escaped strings (preceded by \")
let inString = false;
let stringChar = null;
let problems = [];

for (let i = 0; i < bm.length; i++) {
  const c = bm[i];
  const prev = i > 0 ? bm[i-1] : '';
  
  if (!inString) {
    if (c === '"' && prev !== '\\') { inString = true; stringChar = '"'; }
    else if (c === sq && prev !== '\\') {
      // Bare apostrophe NOT inside a string!
      problems.push({ pos: i, ctx: bm.substring(Math.max(0,i-40), i+40) });
    }
  } else {
    if (c === stringChar && prev !== '\\') { inString = false; stringChar = null; }
  }
}

console.log('Bare apostrophes in JS code (outside strings):', problems.length);
problems.slice(0, 10).forEach(p => {
  console.log('  pos', p.pos, ':', JSON.stringify(p.ctx));
});
if (problems.length === 0) {
  console.log('SAFE: No bare apostrophes that could break javascript: URL parsing!');
}
