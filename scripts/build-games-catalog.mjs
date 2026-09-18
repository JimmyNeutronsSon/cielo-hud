#!/usr/bin/env node
/**
 * build-games-catalog.mjs
 * ---------------------------------------------------------------------------
 * Generates `src/games/catalog.js` — the game library used by the Cielo HUD
 * Games widget.
 *
 * Every entry is pulled live, from the source:
 *   - gn-math/html ........................... https://github.com/gn-math/html
 *
 * Cover thumbnails aren't hosted by gn-math itself, so they're pulled from
 * technonyte00/vapor-v4-games' cover image mirror (images only — no game
 * code or pages come from that repo).
 *
 * Run:  node scripts/build-games-catalog.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "games", "catalog.js");

const RAW = "https://raw.githubusercontent.com";
const API = "https://api.github.com/repos";

const GN = { owner: "gn-math", repo: "html", ref: "main" };
const COVERS = { owner: "technonyte00", repo: "vapor-v4-games", ref: "main" };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CONCURRENCY = 14;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function fetchRetry(url, { tries = 4, isJson = false } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return isJson ? await res.json() : await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr;
}

async function mapPool(items, fn, limit = CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

function numericId(fileName) {
  const m = /^(\d+)/.exec(fileName);
  return m ? parseInt(m[1], 10) : null;
}

function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m || !m[1]) return "";
  return m[1].replace(/[\s ]+/g, " ").trim();
}

// Titles produced by generic players / sandboxes carry no game identity.
const GENERIC_TITLES = /^\s*(ruffle player|unity webgl player(\s*\||$)|game \d+|untitled|loading\.\.\.|\.|_|"undefined")\.?\s*$/i;

function cleanTitle(raw, fallbackId) {
  let t = raw.replace(/^Unity WebGL Player\s*\|\s*/i, "").trim();
  if (!t || GENERIC_TITLES.test(t)) {
    return `Game ${fallbackId}`;
  }
  // Truncate absurdly long names.
  if (t.length > 80) t = t.slice(0, 77).trim() + "...";
  return t;
}

async function gitTree({ owner, repo, ref }) {
  const url = `${API}/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const data = await fetchRetry(url, { isJson: true });
  return (data.tree || []).filter((f) => f.type === "blob");
}

// ---------------------------------------------------------------------------
// 1. Pull repository trees
// ---------------------------------------------------------------------------

console.log("Fetching repo trees...");
const gnBlobs = await gitTree(GN);
const coverBlobs = await gitTree(COVERS);

const gnHtml = gnBlobs.filter((b) => b.path.endsWith(".html"));
const coverIds = new Set(
  coverBlobs
    .filter((b) => /^images\/covers-main\/\d+\.png$/.test(b.path))
    .map((b) => numericId(b.path.split("/").pop()))
);

console.log(`  gn-math html files : ${gnHtml.length}`);

// ---- pick the canonical gn-math file per numeric id ----
// Prefer the plain "N.html" variant, otherwise the lexicographically first
// fix-variant (e.g. id 1 -> "1-fde.html", id 164 -> "164.html").
function byCanonical(files) {
  const byId = new Map();
  for (const f of files) {
    const base = f.path.split("/").pop();
    const id = numericId(base);
    if (id === null) continue;
    const cur = byId.get(id);
    const plain = /^\d+\.html$/.test(base);
    if (!cur || (plain && !/^\d+\.html$/.test(cur.baseName))) {
      byId.set(id, { path: f.path, baseName: base, size: f.size });
    }
  }
  return byId;
}

const gnById = byCanonical(gnHtml);
console.log(`  gn-math distinct ids: ${gnById.size}`);

// ---------------------------------------------------------------------------
// 2. Download every game HTML and extract titles
// ---------------------------------------------------------------------------

console.log("Downloading gn-math titles...");
const gnTitles = await mapPool([...gnById.entries()], async ([id, f]) => {
  const html = await fetchRetry(`${RAW}/${GN.owner}/${GN.repo}/${GN.ref}/${f.path}`);
  return { id, path: f.path, title: extractTitle(html).replace(/^Unity WebGL Player\s*\|\s*/i, "") };
});
const titleForGn = new Map(gnTitles.map((t) => [t.id, t.title]));

// ---------------------------------------------------------------------------
// 3. Build catalog
// ---------------------------------------------------------------------------

const gnIds = [...gnById.keys()].sort((a, b) => a - b);
const catalog = gnIds.map((id) => {
  const f = gnById.get(id);
  const name = cleanTitle(titleForGn.get(id) || "", id);
  return {
    s: "gn", // src
    i: id, // numeric id
    n: name,
    f: f.baseName, // file inside gn-math/html
    c: coverIds.has(id) ? 1 : 0, // cover thumbnail available
  };
});

// ---------------------------------------------------------------------------
// 4. Emit src/games/catalog.js
// ---------------------------------------------------------------------------

const header = `// GENERATED FILE — do not edit by hand.
// Built with \`node scripts/build-games-catalog.mjs\`.
//
// Source (imported live, from the source):
//   - gn-math/html : ${catalog.length} games
//
// Fields:
//   s : source id   (always 'gn')
//   i : numeric game id
//   n : display name
//   f : source file name
//   c : 1 when a cover thumbnail is available for this id
//
export const GAME_CATALOG = [
`;
const body = catalog.map((e) => `  ${JSON.stringify(e)},`).join("\n");
const footer = `];
export const GAME_COUNT = ${catalog.length};
`;

const head = [];
head.push("// URL templates used by the widget launcher");
head.push("export const GAME_SOURCES = {");
head.push(`  gnMathRaw: ${JSON.stringify(`${RAW}/${GN.owner}/${GN.repo}/${GN.ref}`)},`);
head.push(`  coversRaw: ${JSON.stringify(`${RAW}/${COVERS.owner}/${COVERS.repo}/${COVERS.ref}/images/covers-main`)}`);
head.push("};");

writeFileSync(OUT, header + body + footer + "\n\n" + head.join("\n") + "\n", "utf8");
console.log(`\nWrote ${catalog.length} games -> ${OUT}`);
