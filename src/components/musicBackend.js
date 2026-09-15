// Music sources for the Music widget, tried in this order:
//
// 1. "youtube" — the default. Metadata (title/artist/thumb/duration) comes
//    from public Piped instances (open-source, CORS-open mirrors of YouTube's
//    search/trending pages: https://github.com/TeamPiped/Piped). Playback
//    does NOT go through Piped's own audio-stream extraction — that path is
//    routinely rate-limited by YouTube ("Sign in to confirm you're not a
//    bot") on public instances. Instead the resolved video id is handed to
//    YouTube's own IFrame Player API (loaded in music.js), which is the
//    same officially-embeddable playback every "YouTube in an iframe" site
//    uses — no proxying of audio required, and nothing here bypasses any
//    playback restriction YouTube itself enforces.
//
// 2. "audius" — last-resort fallback if every Piped instance is unreachable.
//    Free, no key, `Access-Control-Allow-Origin: *` on every endpoint.
const AUDIUS_REGISTRY = "https://api.audius.co";
const AUDIUS_FALLBACK = "https://discoveryprovider.audius.co";
const APP_NAME = "cielo-hud";

// Public instances rotate in and out of service, so each call tries them in
// order and uses the first one that answers rather than pinning one host.
const PIPED_HOSTS = [
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.r4fo.com",
  "https://piped-api.hostux.net",
];

// ── Shared track shape ──────────────────────────────────────────────────────
// { id, name, artist, thumb, cover, duration (seconds), source }

function fromAudius(t) {
  const art = t.artwork || {};
  return {
    id: t.id,
    name: t.title || "",
    artist: (t.user && (t.user.name || t.user.handle)) || "",
    thumb: art["150x150"] || art["480x480"] || "",
    cover: art["480x480"] || art["1000x1000"] || art["150x150"] || "",
    duration: Number(t.duration) || 0,
    source: "audius",
  };
}

function videoIdFromUrl(url) {
  const m = /[?&]v=([^&]+)/.exec(url || "");
  return m ? m[1] : (url || "").split("/").pop();
}

function fromPipedStream(t) {
  return {
    id: videoIdFromUrl(t.url),
    name: t.title || "",
    artist: t.uploaderName || "",
    thumb: t.thumbnail || "",
    cover: t.thumbnail || "",
    duration: Number(t.duration) > 0 ? Number(t.duration) : 0,
    source: "youtube",
  };
}

// ── YouTube (via Piped metadata) backend ────────────────────────────────────
async function pipedFetch(path) {
  let lastErr = null;
  for (const host of PIPED_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.error) throw new Error(json.error);
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("No Piped instance responded");
}

const YOUTUBE = {
  async trending() {
    const items = await pipedFetch("/trending?region=US");
    return (Array.isArray(items) ? items : []).map(fromPipedStream).filter((t) => t.id);
  },
  async search(query) {
    // `music_songs` only matches YouTube Music's official catalog metadata,
    // which misses anything not released through it (unofficial uploads,
    // fan edits, leaks, etc.) — `videos` is the same search youtube.com
    // itself uses and finds those too.
    const json = await pipedFetch(`/search?q=${encodeURIComponent(query)}&filter=videos`);
    return (json.items || [])
      .filter((it) => it.type === "stream")
      .map(fromPipedStream)
      .filter((t) => t.id);
  },
  // No network call: the id goes straight to YouTube's own IFrame Player API.
  async resolve(track) {
    return { kind: "youtube", id: track.id };
  },
};

// ── Audius backend ──────────────────────────────────────────────────────────
let audiusHost = null;

async function audiusResolveHost() {
  if (audiusHost) return audiusHost;
  audiusHost = await fetch(AUDIUS_REGISTRY)
    .then((r) => r.json())
    .then((j) => {
      const hosts = (j && j.data) || [];
      if (!hosts.length) return AUDIUS_FALLBACK;
      return hosts[Math.floor(Math.random() * hosts.length)].replace(/\/+$/, "");
    })
    .catch(() => AUDIUS_FALLBACK);
  return audiusHost;
}

async function audiusFetch(path) {
  const host = await audiusResolveHost();
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${host}${path}${sep}app_name=${APP_NAME}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json && json.data) ? json.data : [];
}

const AUDIUS = {
  async trending() {
    const list = await audiusFetch("/v1/tracks/trending?limit=25");
    // Gated uploads still appear in listings but 404 on the stream endpoint.
    return list.filter((t) => t.is_streamable !== false).map(fromAudius);
  },
  async search(query) {
    const list = await audiusFetch(
      `/v1/tracks/search?query=${encodeURIComponent(query)}&limit=25`
    );
    return list.filter((t) => t.is_streamable !== false).map(fromAudius);
  },
  async resolve(track) {
    const host = await audiusResolveHost();
    return {
      kind: "audio",
      // 302s to whichever content node holds the track, so it goes straight
      // into <audio src> rather than through fetch().
      url: `${host}/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=${APP_NAME}`,
    };
  },
};

const BACKENDS = { youtube: YOUTUBE, audius: AUDIUS };

export function backendFor(track) {
  return BACKENDS[track.source] || YOUTUBE;
}

export function sourceLabel(source) {
  return source === "audius" ? "Audius" : "YouTube";
}

// Runs `method` (trending | search) against YouTube first, falling back to
// Audius if every Piped instance is unreachable. `onFallback` reports why, so
// the panel can say so instead of silently showing different music than was
// asked for.
export async function loadTracks(method, arg, onFallback) {
  try {
    const tracks = await YOUTUBE[method](arg);
    if (tracks.length) return tracks;
  } catch (err) {
    if (onFallback) onFallback("YouTube", err.message);
  }
  return AUDIUS[method](arg);
}
