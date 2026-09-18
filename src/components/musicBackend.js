// Music source for the Music widget.
//
// "ytmusic" — search/metadata comes from a small self-hosted backend
// (see scramjet-server-setup.sh's sibling ytmusic-server) wrapping the
// unofficial `ytmusicapi` Python library (https://ytmusicapi.readthedocs.io),
// which reads YouTube Music's public search endpoints unauthenticated — no
// personal Google account or cookies are involved. Playback does NOT use
// any extracted/decrypted audio stream: the returned video id is handed to
// YouTube's own IFrame Player API (loaded in music.js), the same
// officially-embeddable playback every "YouTube in an iframe" site uses.

const YTMUSIC_API = "https://api.ritebooks.com/ytmusic";

// ── Shared track shape ──────────────────────────────────────────────────────
// { id, name, artist, thumb, cover, duration (seconds), source }

function fromYtMusicTrack(t) {
  return {
    id: t.id,
    name: t.name || "",
    artist: t.artist || "",
    thumb: t.thumb || "",
    cover: t.thumb || "",
    duration: Number(t.duration) > 0 ? Number(t.duration) : 0,
    source: "ytmusic",
  };
}

async function ytMusicFetch(path) {
  const res = await fetch(`${YTMUSIC_API}${path}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json && json.error) throw new Error(json.error);
  return json;
}

const YTMUSIC = {
  async trending() {
    const json = await ytMusicFetch("/trending");
    return (json.results || []).map(fromYtMusicTrack).filter((t) => t.id);
  },
  async search(query) {
    const json = await ytMusicFetch(`/search?q=${encodeURIComponent(query)}`);
    return (json.results || []).map(fromYtMusicTrack).filter((t) => t.id);
  },
  // No network call: the id goes straight to YouTube's own IFrame Player API.
  async resolve(track) {
    return { kind: "youtube", id: track.id };
  },
};

const BACKENDS = { ytmusic: YTMUSIC };

export function backendFor(track) {
  return BACKENDS[track.source] || YTMUSIC;
}

export function sourceLabel() {
  return "YouTube Music";
}

export async function loadTracks(method, arg) {
  return YTMUSIC[method](arg);
}
