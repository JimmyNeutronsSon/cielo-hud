import { createPanel } from "./panel.js";
import { ICONS } from "./icons.js";

// Extracts YouTube video ID from various standard URL patterns or returns the string if already an ID
function extractVideoId(input) {
  if (!input) return null;
  const str = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

// Public Invidious/Piped mirrors rotate and die within weeks, so a hardcoded
// list goes stale fast. These are only the last-resort fallback if the live
// instance directory below can't be reached at all.
const INVIDIOUS_FALLBACK = [
  "https://invidious.f5.si",
  "https://yewtu.be"
];

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt"
];

// api.invidious.io tracks which public mirrors are currently up and which
// ones actually expose the API with CORS enabled, so pulling this list live
// (once per session) is far more reliable than any hardcoded snapshot.
let invidiousInstancesPromise = null;
async function getInvidiousInstances() {
  if (!invidiousInstancesPromise) {
    invidiousInstancesPromise = fetch("https://api.invidious.io/instances.json", {
      signal: AbortSignal.timeout(5000)
    })
      .then(res => res.json())
      .then(data => {
        const hosts = data
          .filter(([, info]) => info.type === "https" && info.api === true && info.monitor && !info.monitor.down)
          .sort((a, b) => (b[1].monitor.uptime || 0) - (a[1].monitor.uptime || 0))
          .slice(0, 8)
          .map(([, info]) => info.uri);
        return hosts.length > 0 ? hosts : INVIDIOUS_FALLBACK;
      })
      .catch(() => INVIDIOUS_FALLBACK);
  }
  return invidiousInstancesPromise;
}

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function formatViews(views) {
  if (views === null || views === undefined || isNaN(views)) return "";
  try {
    return `${new Intl.NumberFormat("en", { notation: "compact" }).format(views)} views`;
  } catch {
    return `${views} views`;
  }
}

// Races a fetch across every mirror in the list and returns whichever
// responds first with usable data -- far faster than trying them one at a
// time, since a dead mirror otherwise costs the full timeout before moving on.
async function raceMirrors(urls, timeoutMs) {
  const attempts = urls.map(url =>
    fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
  );
  return Promise.any(attempts);
}

async function searchPiped(query) {
  const data = await raceMirrors(
    PIPED_INSTANCES.map(base => `${base}/search?q=${encodeURIComponent(query)}&filter=videos`),
    4500
  );
  const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  return items
    .map(item => {
      const id = extractVideoId(item.url) || item.url?.split("v=")[1];
      if (!id) return null;
      return {
        id,
        title: item.title || "Untitled Video",
        uploader: item.uploaderName || "YouTube",
        duration: formatDuration(item.duration),
        views: formatViews(item.views),
        uploaded: item.uploadedDate || "",
        thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
      };
    })
    .filter(Boolean)
    .slice(0, 24);
}

async function searchInvidious(query) {
  const instances = await getInvidiousInstances();
  const data = await raceMirrors(
    instances.map(base => `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`),
    4500
  );
  const items = Array.isArray(data) ? data : [];
  return items
    .map(item => ({
      id: item.videoId,
      title: item.title || "Untitled Video",
      uploader: item.author || "YouTube",
      duration: formatDuration(item.lengthSeconds),
      views: formatViews(item.viewCount),
      uploaded: item.publishedText || "",
      thumbnail: item.videoThumbnails?.find(t => t.quality === "medium")?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`
    }))
    .filter(item => item.id)
    .slice(0, 24);
}

// Returns { items } on success or { error: true } if every mirror failed,
// so the caller can tell "no results" apart from "couldn't reach a proxy".
async function searchYouTube(query) {
  const videoId = extractVideoId(query);
  if (videoId) {
    return {
      items: [{
        id: videoId,
        title: `Direct Video (${videoId})`,
        uploader: "YouTube",
        duration: "",
        views: "",
        uploaded: "",
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      }]
    };
  }

  try {
    return { items: await searchInvidious(query) };
  } catch {
    // fall through to piped
  }

  try {
    return { items: await searchPiped(query) };
  } catch {
    return { error: true };
  }
}

export function buildYouTube(root, vw, vh, onRemove) {
  const width = Math.min(480, Math.max(340, Math.floor(vw * 0.38)));
  const height = Math.min(620, Math.max(440, Math.floor(vh * 0.78)));
  const x = Math.max(20, Math.floor((vw - width) / 2));
  const y = Math.max(40, Math.floor((vh - height) / 2));

  let searchDebounceTimer = null;

  const panel = createPanel(root, {
    key: "youtube",
    x,
    y,
    width,
    height,
    title: "YouTube",
    bodyClass: "lg-yt-body",
    body: `
      <div class="lg-yt">
        <div class="lg-yt-toolbar">
          <div class="lg-yt-search-wrap">
            <span class="lg-yt-search-ic">${ICONS.search}</span>
            <input type="text" class="lg-yt-search" placeholder="Search YouTube or paste URL / ID…" spellcheck="false" />
          </div>
        </div>

        <div class="lg-yt-results" data-results>
          <div class="lg-yt-status">
            <span class="lg-yt-status-icon">${ICONS.search}</span>
            Search for videos above, or paste a video URL / ID.
          </div>
        </div>
      </div>
    `
  });

  const searchInput = panel.querySelector(".lg-yt-search");
  const resultsContainer = panel.querySelector("[data-results]");

  // Same lightweight, unrestricted embed technique used by the Welkin
  // YouTube widget: a plain nocookie iframe with `origin` set, opened in its
  // own about:blank window rather than inline, so playback survives the HUD
  // panel closing and doesn't get torn down when panels are swapped.
  function getEmbedUrl(videoId) {
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&origin=${encodeURIComponent(window.location.origin)}`;
  }

  function playInNewWindow(videoId, title = "") {
    if (!videoId) return;
    const embedUrl = getEmbedUrl(videoId);

    const win = window.open("about:blank", `yt_popup_${videoId}`, "width=854,height=480,resizable=yes,status=no,toolbar=no,menubar=no");
    if (!win) return;

    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${escapeHtml(title || `YouTube - ${videoId}`)}</title>
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
          iframe { width: 100%; height: 100%; border: none; }
        </style>
      </head>
      <body>
        <iframe src="${embedUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerPolicy="no-referrer"></iframe>
      </body>
      </html>
    `);
    win.document.close();
  }

  let searchToken = 0;

  async function handleSearch() {
    const q = searchInput.value.trim();
    if (!q) {
      resultsContainer.innerHTML = `
        <div class="lg-yt-status">
          <span class="lg-yt-status-icon">${ICONS.search}</span>
          Search for videos above, or paste a video URL / ID.
        </div>
      `;
      return;
    }

    const directId = extractVideoId(q);
    if (directId) {
      playInNewWindow(directId, `Direct Video (${directId})`);
      resultsContainer.innerHTML = `<div class="lg-yt-status">Opened direct video in a new window: <strong>${directId}</strong></div>`;
      return;
    }

    const token = ++searchToken;
    resultsContainer.innerHTML = `
      <div class="lg-yt-status">
        <span class="lg-yt-spinner"></span>
        Searching for "${escapeHtml(q)}"…
      </div>
    `;

    const result = await searchYouTube(q);
    if (token !== searchToken) return; // a newer search superseded this one

    if (result.error) {
      resultsContainer.innerHTML = `
        <div class="lg-yt-status lg-yt-status-error">
          Couldn't reach any search proxy right now — they're often flaky.
          <div class="lg-yt-status-actions">
            <button class="lg-yt-link-btn" data-retry>Retry search</button>
            <button class="lg-yt-link-btn" data-direct-play>Play as raw URL/ID instead</button>
          </div>
        </div>
      `;
      resultsContainer.querySelector("[data-retry]")?.addEventListener("click", handleSearch);
      resultsContainer.querySelector("[data-direct-play]")?.addEventListener("click", () => playInNewWindow(q, q));
      return;
    }

    const items = result.items || [];
    if (items.length === 0) {
      resultsContainer.innerHTML = `
        <div class="lg-yt-status">
          No results for "${escapeHtml(q)}".
          <div class="lg-yt-status-actions">
            <button class="lg-yt-link-btn" data-direct-play>Try playing raw video URL/ID</button>
          </div>
        </div>
      `;
      resultsContainer.querySelector("[data-direct-play]")?.addEventListener("click", () => playInNewWindow(q, q));
      return;
    }

    resultsContainer.innerHTML = "";
    const list = document.createElement("div");
    list.className = "lg-yt-grid";

    items.forEach(item => {
      const sub = [item.uploader, item.views, item.uploaded].filter(Boolean).join(" • ");
      const card = document.createElement("div");
      card.className = "lg-yt-card";
      card.innerHTML = `
        <div class="lg-yt-thumb-wrap">
          <img class="lg-yt-thumb" src="${item.thumbnail}" loading="lazy" alt="" />
          ${item.duration ? `<span class="lg-yt-dur">${item.duration}</span>` : ""}
        </div>
        <div class="lg-yt-meta">
          <div class="lg-yt-card-title">${escapeHtml(item.title)}</div>
          <div class="lg-yt-card-sub">${escapeHtml(sub)}</div>
        </div>
      `;
      card.addEventListener("click", () => {
        playInNewWindow(item.id, item.title);
      });
      list.appendChild(card);
    });

    resultsContainer.appendChild(list);
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(handleSearch, 450);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchDebounceTimer);
      handleSearch();
    }
  });

  root.addEventListener("lg:hud-close", () => clearTimeout(searchDebounceTimer), { once: true });

  const originalRemove = panel.remove.bind(panel);
  panel.remove = () => {
    clearTimeout(searchDebounceTimer);
    if (onRemove) onRemove("youtube");
    originalRemove();
  };

  return panel;
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, m => {
    switch (m) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return m;
    }
  });
}
