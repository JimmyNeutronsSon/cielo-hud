#!/usr/bin/env node
/**
 * build-games-catalog.mjs
 * ---------------------------------------------------------------------------
 * Generates `src/games/catalog.js` — the merged, deduplicated game library
 * used by the Cielo HUD Games widget.
 *
 * Every entry is pulled live, from the source:
 *   - gn-math/html ........................... https://github.com/gn-math/html
 *   - technonyte00/vapor-v4-games ............ https://github.com/technonyte00/vapor-v4-games
 *   - truffled.lol (aukak/truffled g.json) ... https://github.com/aukak/truffled
 *
 * Rules applied by this generator:
 *   - vapor uses the same numeric IDs as gn-math (verified at build time), so a
 *     vapor game is treated as a duplicate of the matching gn-math game and the
 *     gn-math version is kept (per project requirement).
 *   - vapor games whose numeric ID does NOT exist in gn-math are imported from
 *     vapor (IDs 184, 424, 425 at time of writing).
 *   - truffled games are imported from g.json; entries whose normalized name
 *     matches an already-imported game are dropped in favor of the gn-math one.
 *   - Display names prefer vapor's curated wrapper <title> (gn-math titles are
 *     sometimes generic, e.g. "Game 24781").
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

const GN = { owner: "gn-math", repo: "html", ref: "main", label: "GN-Math" };
const VP = { owner: "technonyte00", repo: "vapor-v4-games", ref: "main", label: "Vapor" };
const TF = { owner: "aukak", repo: "truffled", ref: "main", label: "Truffled" };

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
  return m[1].replace(/[\s\u00a0]+/g, " ").trim();
}

// Normalize a game name into a stable key used for duplicate detection.
function normKey(name) {
  return (name || "")
    .toLowerCase()
    // drop the "webport" / "remastered" style publish suffixes that are used
    // inconsistently across the three sources
    .replace(/,?\s*(web\s?port|port(ed)?|webport)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
const vpBlobs = await gitTree(VP);

const gnHtml = gnBlobs.filter((b) => b.path.endsWith(".html"));
const vpHtml = vpBlobs.filter((b) => b.path.startsWith("html/html-main/") && b.path.endsWith(".html"));
const vpCovers = new Set(
  vpBlobs
    .filter((b) => /^images\/covers-main\/\d+\.png$/.test(b.path))
    .map((b) => numericId(b.path.split("/").pop()))
);

console.log(`  gn-math html files : ${gnHtml.length}`);
console.log(`  vapor  html files  : ${vpHtml.length}`);

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
const vpById = byCanonical(vpHtml);

console.log(`  gn-math distinct ids: ${gnById.size}`);
console.log(`  vapor  distinct ids : ${vpById.size}`);

const vaporOnlyIds = [...vpById.keys()].filter((id) => !gnById.has(id)).sort((a, b) => a - b);
console.log(`  vapor-only ids      : ${vaporOnlyIds.join(", ")}`);

// ---------------------------------------------------------------------------
// 2. Download every game HTML and extract titles
// ---------------------------------------------------------------------------

console.log("Downloading gn-math titles...");
const gnTitles = await mapPool([...gnById.entries()], async ([id, f]) => {
  const html = await fetchRetry(`${RAW}/${GN.owner}/${GN.repo}/${GN.ref}/${f.path}`);
  return { id, path: f.path, title: extractTitle(html).replace(/^Unity WebGL Player\s*\|\s*/i, "") };
});
const titleForGn = new Map(gnTitles.map((t) => [t.id, t.title]));

console.log("Downloading vapor titles...");
const vpTitles = await mapPool([...vpById.entries()], async ([id, f]) => {
  const html = await fetchRetry(`${RAW}/${VP.owner}/${VP.repo}/${VP.ref}/${f.path}`);
  const base = /<base\s+href="([^"]+)"/i.exec(html);
  return {
    id,
    path: f.path,
    title: extractTitle(html).replace(/^Unity WebGL Player\s*\|\s*/i, ""),
    base: base ? base[1] : "",
  };
});
const metaForVapor = new Map(vpTitles.map((t) => [t.id, t]));

console.log("Fetching truffled games (g.json)...");
const tj = await fetchRetry(
  `${RAW}/${TF.owner}/${TF.repo}/${TF.ref}/public/js/json/g.json`,
  { isJson: true }
);
const truffledGames = Array.isArray(tj) ? tj : tj.games || [];
console.log(`  truffled games      : ${truffledGames.length}`);
// ---------------------------------------------------------------------------
// 3. Build merged catalog
// ---------------------------------------------------------------------------

const catalog = [];
const takenNormalized = new Set();

// --- 3a. gn-math entries (primary for every shared id) ---
const gnIds = [...gnById.keys()].sort((a, b) => a - b);
for (const id of gnIds) {
  const f = gnById.get(id);
  const vpMeta = metaForVapor.get(id);
  const vpTitle = vpMeta ? vpMeta.title : "";
  const gnTitleRaw = titleForGn.get(id) || "";

  // Prefer vapor's curated title when it is meaningful.
  let name;
  if (vpTitle && !GENERIC_TITLES.test(vpTitle)) {
    name = cleanTitle(vpTitle, id);
  } else {
    name = cleanTitle(gnTitleRaw, id);
  }

  catalog.push({
    s: "gn", // src
    i: id, // numeric id
    n: name,
    f: f.baseName, // file inside gn-math/html
    c: vpById.has(id) ? 1 : 0, // vapor cover available -> thumbnail URL derivable
  });
  takenNormalized.add(normKey(name));
}

// --- 3b. vapor-only entries ---
for (const id of vaporOnlyIds) {
  const f = vpById.get(id);
  const vpMeta = metaForVapor.get(id) || { title: "", base: "" };
  const name = cleanTitle(vpMeta.title, id);
  catalog.push({
    s: "vp", // src
    i: id,
    n: name,
    f: f.baseName, // file inside html/html-main
    b: vpMeta.base, // base href rewrite target ("" => self-contained)
    c: vpCovers.has(id) ? 1 : 0,
  });
  takenNormalized.add(normKey(name));
}

// --- 3c. truffled entries (deduped by normalized name) ---
let truffledTaken = 0;
for (const g of truffledGames) {
  const name = String(g.name || "").trim();
  if (!name || !g.url) continue;
  const alts = Array.isArray(g.altNames) ? g.altNames : g.altNames ? [g.altNames] : [];
  const keys = [normKey(name), ...alts.map(normKey)].filter(Boolean);
  const dup = keys.some((k) => takenNormalized.has(k));
  if (dup) {
    truffledTaken++;
    continue;
  }
  takenNormalized.add(keys[0]);
  catalog.push({
    s: "tf",
    n: name,
    u: g.url, // site-relative path, e.g. /games/1/index.html
    t: (g.thumbnail || "").replace(/^\//, "") || "", // site-relative thumb path
    k: g.frameType === "unity" ? 1 : 0, // needs the Unity (COOP/COEP) frame page
  });
}

console.log(`  truffled dropped as duplicates : ${truffledTaken}`);

catalog.sort((a, b) => {
  const rank = { gn: 0, vp: 1, tf: 2 };
  if (a.s !== b.s) return rank[a.s] - rank[b.s];
  if (a.i !== undefined && b.i !== undefined) return a.i - b.i;
  return String(a.n).localeCompare(String(b.n));
});

// ---------------------------------------------------------------------------
// 4. Emit src/games/catalog.js
// ---------------------------------------------------------------------------

const header = `// GENERATED FILE — do not edit by hand.
// Built with \`node scripts/build-games-catalog.mjs\`.
//
// Sources (imported live, from the source):
//   - gn-math/html               : ${gnIds.length} games
//   - technonyte00/vapor-v4-games : ${vaporOnlyIds.length} vapor-only games
//   - truffled.lol (g.json)      : ${truffledGames.length} games (${truffledTaken} dropped as duplicate of gn-math)
//
// Fields:
//   s : source id   ('gn'=gn-math, 'vp'=vapor, 'tf'=truffled)
//   i : numeric game id (gn/vp)
//   n : display name
//   f : source file name (gn/vp)
//   b : vapor base href to rewrite (vp only; '' = self contained)
//   c : 1 when a vapor cover thumbnail is available (gn with matching vapor id / vp)
//   u : site-relative game url (tf only)
//   t : site-relative thumbnail path (tf only)
//   k : 1 = launch via truffled Unity frame page (tf only)
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
head.push(`  vaporHtmlRaw: ${JSON.stringify(`${RAW}/${VP.owner}/${VP.repo}/${VP.ref}/html/html-main`)} ,`);
head.push(`  vaporAssetsRaw: ${JSON.stringify(`${RAW}/${VP.owner}/${VP.repo}/${VP.ref}/assets/assets-main`)} ,`);
head.push(`  vaporCoversRaw: ${JSON.stringify(`${RAW}/${VP.owner}/${VP.repo}/${VP.ref}/images/covers-main`)} ,`);
head.push(`  truffledOrigin: ${JSON.stringify("https://truffled.lol")}`);
head.push("};");

writeFileSync(OUT, header + body + footer + "\n\n" + head.join("\n") + "\n", "utf8");
console.log(`\nWrote ${catalog.length} games -> ${OUT}`);