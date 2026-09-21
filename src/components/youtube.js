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

// Fallback search engines for unblocked/restricted-free video search & metadata
const INVIDIOUS_INSTANCES = [
  "https://vid.puffyan.us",
  "https://inv.tux.pizza",
  "https://invidious.drgns.space",
  "https://yt.drgnz.club"
];

async function searchYouTube(query) {
  const videoId = extractVideoId(query);
  if (videoId) {
    return [{
      id: videoId,
      title: `Direct Video (${videoId})`,
      uploader: "YouTube",
      duration: "",
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    }];
  }

  // Attempt search across invidious API instances
  for (const baseUrl of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
        signal: AbortSignal.timeout(3500)
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.slice(0, 15).map(item => ({
          id: item.videoId,
          title: item.title || "Untitled Video",
          uploader: item.author || "YouTube",
          duration: item.lengthSeconds ? `${Math.floor(item.lengthSeconds / 60)}:${(item.lengthSeconds % 60).toString().padStart(2, '0')}` : "",
          thumbnail: item.videoThumbnails?.find(t => t.quality === "medium")?.url || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`
        }));
      }
    } catch {
      // continue fallback loop
    }
  }

  return [];
}

export function buildYouTube(root, vw, vh, onRemove) {
  const width = Math.min(480, Math.max(340, Math.floor(vw * 0.38)));
  const height = Math.min(620, Math.max(440, Math.floor(vh * 0.78)));
  const x = Math.max(20, Math.floor((vw - width) / 2));
  const y = Math.max(40, Math.floor((vh - height) / 2));

  let currentVideoId = null;
  let activeIframe = null;
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
          <button class="lg-yt-popout-btn" data-popout title="Open in separate detached window (Max resource efficiency)" hidden>
            ${ICONS.external} Detach
          </button>
        </div>

        <div class="lg-yt-player-container" data-player-box hidden>
          <div class="lg-yt-player-frame" data-player-frame></div>
          <div class="lg-yt-player-meta">
            <span class="lg-yt-player-title" data-player-title></span>
            <div class="lg-yt-player-actions">
              <select class="lg-yt-mode-select" data-embed-mode title="Select Bypass Embed Source">
                <option value="nocookie">Embed Bypass (nocookie)</option>
                <option value="piped">Piped Proxy</option>
                <option value="invidious">Invidious Proxy</option>
              </select>
              <button class="lg-yt-btn lg-yt-close-player" data-close-player title="Close Player & Free Memory">Close Player</button>
            </div>
          </div>
        </div>

        <div class="lg-yt-results" data-results>
          <div class="lg-yt-status">Search for videos above or paste a video URL.</div>
        </div>
      </div>
    `
  });

  const searchInput = panel.querySelector(".lg-yt-search");
  const resultsContainer = panel.querySelector("[data-results]");
  const playerBox = panel.querySelector("[data-player-box]");
  const playerFrame = panel.querySelector("[data-player-frame]");
  const playerTitle = panel.querySelector("[data-player-title]");
  const popoutBtn = panel.querySelector("[data-popout]");
  const closePlayerBtn = panel.querySelector("[data-close-player]");
  const modeSelect = panel.querySelector("[data-embed-mode]");

  // Resource-efficient iframe cleanup
  function destroyPlayer() {
    if (activeIframe) {
      activeIframe.src = "about:blank";
      activeIframe.remove();
      activeIframe = null;
    }
    playerFrame.innerHTML = "";
    playerBox.hidden = true;
    popoutBtn.hidden = true;
    currentVideoId = null;
  }

  function getEmbedUrl(videoId, mode) {
    switch (mode) {
      case "piped":
        return `https://piped.video/embed/${videoId}?autoplay=1`;
      case "invidious":
        return `https://yewtu.be/embed/${videoId}?autoplay=1`;
      case "nocookie":
      default:
        // Simple YouTube Age Restriction Bypass technique: nocookie embed with raw parameters
        return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0`;
    }
  }

  function loadPlayer(videoId, title = "") {
    destroyPlayer();
    currentVideoId = videoId;
    playerTitle.textContent = title || `Video (${videoId})`;
    
    const embedUrl = getEmbedUrl(videoId, modeSelect.value);
    const iframe = document.createElement("iframe");
    iframe.className = "lg-yt-iframe";
    iframe.src = embedUrl;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "no-referrer";
    
    playerFrame.appendChild(iframe);
    activeIframe = iframe;
    playerBox.hidden = false;
    popoutBtn.hidden = false;
  }

  // Open detached window for maximum resource efficiency & performance isolation
  function openDetachedWindow(videoId) {
    if (!videoId) return;
    const mode = modeSelect.value;
    const embedUrl = getEmbedUrl(videoId, mode);
    
    const win = window.open(
      "",
      `yt_popup_${videoId}`,
      `width=854,height=480,resizable=yes,status=no,toolbar=no,menubar=no`
    );
    if (win) {
      win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>YouTube Player - ${videoId}</title>
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
      // Destroy in-panel iframe once detached window is opened to save memory
      destroyPlayer();
    }
  }

  // Event handlers
  modeSelect.addEventListener("change", () => {
    if (currentVideoId) {
      loadPlayer(currentVideoId, playerTitle.textContent);
    }
  });

  closePlayerBtn.addEventListener("click", () => {
    destroyPlayer();
  });

  popoutBtn.addEventListener("click", () => {
    if (currentVideoId) {
      openDetachedWindow(currentVideoId);
    }
  });

  async function handleSearch() {
    const q = searchInput.value.trim();
    if (!q) {
      resultsContainer.innerHTML = `<div class="lg-yt-status">Search for videos above or paste a video URL.</div>`;
      return;
    }

    const directId = extractVideoId(q);
    if (directId) {
      loadPlayer(directId, `Direct Video (${directId})`);
      resultsContainer.innerHTML = `<div class="lg-yt-status">Playing direct video: <strong>${directId}</strong></div>`;
      return;
    }

    resultsContainer.innerHTML = `<div class="lg-yt-status">Searching YouTube…</div>`;

    const items = await searchYouTube(q);
    if (!items || items.length === 0) {
      resultsContainer.innerHTML = `
        <div class="lg-yt-status">
          No direct API results. <button class="lg-yt-link-btn" data-direct-play>Try playing raw video URL/ID</button>
        </div>
      `;
      const directBtn = resultsContainer.querySelector("[data-direct-play]");
      if (directBtn) {
        directBtn.addEventListener("click", () => {
          if (q) loadPlayer(q, q);
        });
      }
      return;
    }

    resultsContainer.innerHTML = "";
    const list = document.createElement("div");
    list.className = "lg-yt-grid";

    items.forEach(item => {
      const card = document.createElement("div");
      card.className = "lg-yt-card";
      card.innerHTML = `
        <div class="lg-yt-thumb-wrap">
          <img class="lg-yt-thumb" src="${item.thumbnail}" loading="lazy" alt="" />
          ${item.duration ? `<span class="lg-yt-dur">${item.duration}</span>` : ""}
        </div>
        <div class="lg-yt-meta">
          <div class="lg-yt-card-title">${escapeHtml(item.title)}</div>
          <div class="lg-yt-card-sub">${escapeHtml(item.uploader)}</div>
        </div>
      `;
      card.addEventListener("click", () => {
        loadPlayer(item.id, item.title);
      });
      list.appendChild(card);
    });

    resultsContainer.appendChild(list);
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(handleSearch, 350);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchDebounceTimer);
      handleSearch();
    }
  });

  // Resource cleanup on unmount / HUD tear down
  const onHudClose = () => {
    destroyPlayer();
    clearTimeout(searchDebounceTimer);
  };
  root.addEventListener("lg:hud-close", onHudClose, { once: true });

  const originalRemove = panel.remove.bind(panel);
  panel.remove = () => {
    onHudClose();
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
