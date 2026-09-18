// Music source for the Music widget.
//
// "jiosaavn" — search/metadata/streaming all come from public unofficial
// JioSaavn API mirrors (open-source wrappers around jiosaavn.com's own
// endpoints: https://github.com/sumitkolhe/jiosaavn-api). Songs stream
// directly from JioSaavn's own CDN (saavncdn.com) via a plain <audio>
// element — no separate proxying needed, since <audio> playback doesn't
// require CORS the way reading raw samples with Web Audio API would.

// Public instances rotate in and out of service, so each call tries them in
// order and uses the first one that answers rather than pinning one host.
const JIOSAAVN_HOSTS = [
  "https://jiosaavn-api-seven-xi.vercel.app",
  "https://jiosaavn-api3.jj192837465jj.workers.dev",
  "https://jiosaavn-api.jj192837465jj.workers.dev",
  "https://jiosaavn-api.fantoo.workers.dev",
  "https://jiosaavn-api.softyangel8.workers.dev",
];

// ── Shared track shape ──────────────────────────────────────────────────────
// { id, name, artist, thumb, cover, duration (seconds), source }

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function bestImage(images) {
  if (!Array.isArray(images) || !images.length) return "";
  return images[images.length - 1].url || images[0].url || "";
}

function bestDownloadUrl(urls) {
  if (!Array.isArray(urls) || !urls.length) return "";
  return urls[urls.length - 1].url || urls[0].url || "";
}

function artistNames(song) {
  if (song.artists && song.artists.primary && song.artists.primary.length) {
    return song.artists.primary.map((a) => decodeHtmlEntities(a.name)).join(", ");
  }
  return decodeHtmlEntities(song.subtitle || song.primaryArtists || "");
}

function fromJioSaavnSong(song) {
  return {
    id: song.id,
    name: decodeHtmlEntities(song.name || song.title || ""),
    artist: artistNames(song),
    thumb: bestImage(song.image),
    cover: bestImage(song.image),
    duration: Number(song.duration) > 0 ? Number(song.duration) : 0,
    downloadUrl: song.downloadUrl,
    source: "jiosaavn",
  };
}

// ── JioSaavn backend ─────────────────────────────────────────────────────
async function jioSaavnFetch(path) {
  let lastErr = null;
  for (const host of JIOSAAVN_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json || json.success === false) throw new Error((json && json.message) || "API error");
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("No JioSaavn instance responded");
}

const JIOSAAVN = {
  async trending() {
    const json = await jioSaavnFetch("/api/search/songs?query=top%20hits&page=1&limit=20");
    return (json.data?.results || []).map(fromJioSaavnSong).filter((t) => t.id);
  },
  async search(query) {
    const json = await jioSaavnFetch(`/api/search/songs?query=${encodeURIComponent(query)}&page=1&limit=20`);
    return (json.data?.results || []).map(fromJioSaavnSong).filter((t) => t.id);
  },
  // No network call: the highest-quality download URL streams directly.
  async resolve(track) {
    const url = bestDownloadUrl(track.downloadUrl);
    if (!url) throw new Error("No playable stream available for this track");
    return { kind: "audio", url };
  },
};

const BACKENDS = { jiosaavn: JIOSAAVN };

export function backendFor(track) {
  return BACKENDS[track.source] || JIOSAAVN;
}

export function sourceLabel() {
  return "JioSaavn";
}

export async function loadTracks(method, arg) {
  return JIOSAAVN[method](arg);
}
