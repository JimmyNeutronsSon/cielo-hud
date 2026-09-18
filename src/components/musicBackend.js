// Music source for the Music widget.
//
// "youtube" — metadata (title/artist/thumb/duration) comes from public Piped
// instances (open-source, CORS-open mirrors of YouTube's search/trending
// pages: https://github.com/TeamPiped/Piped). Playback does NOT go through
// Piped's own audio-stream extraction — that path is routinely rate-limited
// by YouTube ("Sign in to confirm you're not a bot") on public instances.
// Instead the resolved video id is handed to YouTube's own IFrame Player API
// (loaded in music.js), which is the same officially-embeddable playback
// every "YouTube in an iframe" site uses — no proxying of audio required,
// and nothing here bypasses any playback restriction YouTube itself enforces.

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

const BACKENDS = { youtube: YOUTUBE };

export function backendFor(track) {
  return BACKENDS[track.source] || YOUTUBE;
}

export function sourceLabel() {
  return "YouTube";
}

export async function loadTracks(method, arg) {
  return YOUTUBE[method](arg);
}
