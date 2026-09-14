import { createPanel } from './panel.js';
import { ICONS } from './icons.js';
import { lgStore } from './storage.js';

const BOOKMARKS = [
  { name: "CrazyGames", url: "https://games.crazygames.com", color: "#ec4899" },
  { name: "Wikipedia", url: "https://en.m.wikipedia.org", color: "#38bdf8" },
  { name: "DevDocs", url: "https://devdocs.io", color: "#a78bfa" },
  { name: "DuckDuckGo", url: "https://duckduckgo.com", color: "#f97316" },
  { name: "Archive.org", url: "https://archive.org", color: "#e2e8f0" },
  { name: "CodePen", url: "https://codepen.io/pen/", color: "#34d399" },
  { name: "Frogies Arcade", url: "https://frogiesarcade.com", color: "#10b981" },
  { name: "Scratch", url: "https://scratch.mit.edu/explore/projects/all", color: "#f59e0b" }
];

export function buildBrowser(root, vw, vh, onRemove) {
  let currentEngine = lgStore("lg_browser_engine") || "direct";
  let customGateway = lgStore("lg_custom_gateway") || "";

  let historyStack = [];
  let historyIndex = -1;
  let isHome = true;

  const p = createPanel(root, {
    key: "browser",
    x: Math.max(20, Math.floor(vw * 0.05)),
    y: 120,
    width: Math.min(840, Math.max(480, Math.floor(vw * 0.72))),
    height: Math.min(600, Math.max(400, Math.floor(vh * 0.68))),
    title: "Liquid Scramjet Browser",
    body: `
      <div class="lg-browser-container">
        <!-- Top Toolbar -->
        <div class="lg-browser-toolbar">
          <div class="lg-browser-nav-btns">
            <button class="lg-browser-icon-btn" data-btn="back" title="Back" disabled>${ICONS.back}</button>
            <button class="lg-browser-icon-btn" data-btn="forward" title="Forward" disabled>${ICONS.forward}</button>
            <button class="lg-browser-icon-btn" data-btn="reload" title="Reload">${ICONS.reload}</button>
            <button class="lg-browser-icon-btn" data-btn="home" title="Home">${ICONS.home}</button>
          </div>

          <div class="lg-browser-address-bar">
            <div class="lg-browser-mode-select-wrap">
              <select data-engine-select class="lg-browser-mode-select" title="Proxy / Browsing Engine">
                <option value="direct" ${currentEngine === "direct" ? "selected" : ""}>Direct Embed</option>
                <option value="proxy" ${currentEngine === "proxy" ? "selected" : ""}>Scramjet Proxy</option>
              </select>
            </div>
            <input type="text" class="lg-browser-input" data-url-in placeholder="Enter URL or search term..." value="" />
            <button class="lg-browser-go-btn" data-btn="go" title="Navigate">${ICONS.search}</button>
          </div>

          <div class="lg-browser-aux-btns">
            <button class="lg-browser-icon-btn" data-btn="popout" title="Open in New Tab">${ICONS.external}</button>
            <button class="lg-browser-icon-btn" data-btn="settings" title="Custom Gateway Settings">${ICONS.gear}</button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="lg-browser-progress" data-progress></div>

        <!-- Settings Drawer -->
        <div class="lg-browser-settings-drawer" data-settings-drawer style="display:none;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5ee7ff;margin-bottom:6px;">Scramjet Proxy Server URL</div>
          <div style="display:flex;gap:6px;">
            <input type="text" class="lg-browser-settings-input" data-custom-input value="${customGateway}" placeholder="e.g. https://your-scramjet-host.com" />
            <button class="lg-browser-settings-save-btn" data-btn="save-custom">Save</button>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:6px;">Point this at a Scramjet instance you deploy yourself (see docs). When 'Scramjet Proxy' is selected, navigation goes through this server.</div>
        </div>

        <!-- Main Viewport -->
        <div class="lg-browser-viewport" data-browser-wrap>
          <!-- Home Portal (visible on launch or when pressing home) -->
          <div class="lg-browser-home-portal" data-home-portal>
            <div class="lg-home-hero">
              <div class="lg-home-icon">${ICONS.browser}</div>
              <div class="lg-home-title">Scramjet Proxy Browser</div>
              <div class="lg-home-desc">Unrestricted web navigation & games powered by Scramjet & web proxy engines</div>
            </div>

            <div class="lg-home-search-box">
              <input type="text" data-home-search placeholder="Search DuckDuckGo or enter any URL..." />
              <button data-home-search-btn>Browse</button>
            </div>

            <div class="lg-home-bookmarks-title">Quick Portals & Games</div>
            <div class="lg-home-bookmarks-grid" data-bookmarks-grid></div>

            <div class="lg-home-tips">
              <span><strong>Modes:</strong> <em>Direct Embed</em> loads sites straight into the frame (works for embeddable sites only). <em>Scramjet Proxy</em> routes through your own Scramjet server to bypass frame restrictions — set its URL in Settings (⚙).</span>
            </div>
          </div>

          <!-- Live Iframe -->
          <iframe
            data-proxy-frame
            class="lg-browser-iframe"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
            allow="fullscreen; autoplay; clipboard-write; camera; microphone;"
            style="display:none;"
          ></iframe>

          <!-- Fallback Error Overlay -->
          <div class="lg-browser-error-overlay" data-error-overlay style="display:none;">
            <div class="lg-error-card">
              <div style="font-size:28px;margin-bottom:8px;">🛡️</div>
              <div style="font-weight:700;font-size:14px;color:#ffffff;margin-bottom:6px;">Navigation Blocked or Failed</div>
              <div style="font-size:12px;color:#cbd5e1;line-height:1.5;margin-bottom:14px;" data-error-msg>
                This site may enforce strict frame-security policies (X-Frame-Options/CSP).
              </div>
              <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                <button class="lg-error-btn primary" data-btn="open-external">Open in New Tab ↗</button>
                <button class="lg-error-btn" data-btn="switch-scramjet">Switch to Scramjet Proxy</button>
                <button class="lg-error-btn" data-btn="back-to-home">Back to Home</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  }, onRemove);

  // Selections
  const input = p.querySelector("[data-url-in]");
  const engineSelect = p.querySelector("[data-engine-select]");
  const btnGo = p.querySelector("[data-btn='go']");
  const btnBack = p.querySelector("[data-btn='back']");
  const btnForward = p.querySelector("[data-btn='forward']");
  const btnReload = p.querySelector("[data-btn='reload']");
  const btnHome = p.querySelector("[data-btn='home']");
  const btnPopout = p.querySelector("[data-btn='popout']");
  const btnSettings = p.querySelector("[data-btn='settings']");
  const settingsDrawer = p.querySelector("[data-settings-drawer]");
  const customInput = p.querySelector("[data-custom-input]");
  const btnSaveCustom = p.querySelector("[data-btn='save-custom']");
  const progressBar = p.querySelector("[data-progress]");
  const homePortal = p.querySelector("[data-home-portal]");
  const homeSearch = p.querySelector("[data-home-search]");
  const homeSearchBtn = p.querySelector("[data-home-search-btn]");
  const bookmarksGrid = p.querySelector("[data-bookmarks-grid]");
  const iframe = p.querySelector("[data-proxy-frame]");
  const errorOverlay = p.querySelector("[data-error-overlay]");
  const errorMsg = p.querySelector("[data-error-msg]");
  const btnOpenExternal = p.querySelector("[data-btn='open-external']");
  const btnSwitchScramjet = p.querySelector("[data-btn='switch-scramjet']");
  const btnBackToHome = p.querySelector("[data-btn='back-to-home']");

  let currentRawUrl = "";

  // Populate Bookmarks
  BOOKMARKS.forEach(bm => {
    const card = document.createElement("button");
    card.className = "lg-bm-card";
    card.innerHTML = `
      <div class="lg-bm-dot" style="background:${bm.color};box-shadow:0 0 10px ${bm.color};"></div>
      <span>${bm.name}</span>
    `;
    card.addEventListener("click", () => {
      navigateTo(bm.url);
    });
    bookmarksGrid.appendChild(card);
  });

  function isLink(val) {
    val = val.trim();
    return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z0-9]{2,}(\/.*)?$/i.test(val) || val.startsWith("http://") || val.startsWith("https://");
  }

  function resolveTargetUrl(query) {
    query = query.trim();
    if (!query) return "";
    if (isLink(query)) {
      if (!query.startsWith("http://") && !query.startsWith("https://")) {
        return "https://" + query;
      }
      return query;
    }
    return "https://duckduckgo.com/?q=" + encodeURIComponent(query);
  }

  function updateNavButtons() {
    btnBack.disabled = historyIndex <= 0;
    btnForward.disabled = historyIndex >= historyStack.length - 1;
  }

  function showLoading(isLoading) {
    if (isLoading) {
      progressBar.classList.add("loading");
    } else {
      progressBar.classList.remove("loading");
    }
  }

  function showHome() {
    isHome = true;
    homePortal.style.display = "flex";
    iframe.style.display = "none";
    errorOverlay.style.display = "none";
    input.value = "";
    currentRawUrl = "";
    showLoading(false);
  }

  function showError(msg) {
    errorMsg.textContent = msg || "Navigation failed or connection timed out.";
    errorOverlay.style.display = "flex";
    showLoading(false);
  }

  function hideError() {
    errorOverlay.style.display = "none";
  }

  function navigateTo(targetUrl, pushHistory = true) {
    if (!targetUrl) return;

    hideError();
    isHome = false;
    homePortal.style.display = "none";
    iframe.style.display = "block";
    showLoading(true);

    currentRawUrl = targetUrl;
    input.value = targetUrl;

    if (pushHistory) {
      if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
      }
      historyStack.push(targetUrl);
      historyIndex = historyStack.length - 1;
      updateNavButtons();
    }

    const engine = engineSelect.value;

    try {
      if (engine === "proxy") {
        if (!customGateway) {
          showError("Please set your Scramjet Proxy server URL in Settings (⚙).");
          return;
        }
        // Self-hosted Scramjet exposes its own proxy UI/address bar at its root.
        // We load that UI here; navigate to specific sites using the address bar inside it.
        iframe.src = customGateway;
      } else {
        // Direct Embed Mode
        iframe.src = targetUrl;
      }
    } catch (e) {
      showError(e.message);
    }
  }

  iframe.addEventListener("load", () => {
    showLoading(false);
  });

  iframe.addEventListener("error", () => {
    showLoading(false);
    showError("Failed to load: " + currentRawUrl);
  });

  btnGo.addEventListener("click", () => {
    const resolved = resolveTargetUrl(input.value);
    if (resolved) navigateTo(resolved);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const resolved = resolveTargetUrl(input.value);
      if (resolved) navigateTo(resolved);
    }
  });

  btnBack.addEventListener("click", () => {
    if (historyIndex > 0) {
      historyIndex--;
      updateNavButtons();
      navigateTo(historyStack[historyIndex], false);
    }
  });

  btnForward.addEventListener("click", () => {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      updateNavButtons();
      navigateTo(historyStack[historyIndex], false);
    }
  });

  btnReload.addEventListener("click", () => {
    if (!isHome && currentRawUrl) {
      navigateTo(currentRawUrl, false);
    }
  });

  btnHome.addEventListener("click", () => {
    showHome();
  });

  btnPopout.addEventListener("click", () => {
    const url = currentRawUrl || resolveTargetUrl(input.value) || customGateway || "";
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  });

  btnSettings.addEventListener("click", () => {
    const isShown = settingsDrawer.style.display !== "none";
    settingsDrawer.style.display = isShown ? "none" : "block";
  });

  btnSaveCustom.addEventListener("click", () => {
    const val = customInput.value.trim();
    customGateway = val;
    lgStore("lg_custom_gateway", val);
    settingsDrawer.style.display = "none";
    if (engineSelect.value === "proxy" && currentRawUrl) {
      navigateTo(currentRawUrl, false);
    }
  });

  engineSelect.addEventListener("change", () => {
    lgStore("lg_browser_engine", engineSelect.value);
    if (!isHome && currentRawUrl) {
      navigateTo(currentRawUrl, false);
    }
  });

  homeSearchBtn.addEventListener("click", () => {
    const query = homeSearch.value.trim();
    if (query) {
      const resolved = resolveTargetUrl(query);
      navigateTo(resolved);
    }
  });

  homeSearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const query = homeSearch.value.trim();
      if (query) {
        const resolved = resolveTargetUrl(query);
        navigateTo(resolved);
      }
    }
  });

  btnOpenExternal.addEventListener("click", () => {
    if (currentRawUrl) {
      window.open(currentRawUrl, "_blank", "noopener,noreferrer");
    }
  });

  btnSwitchScramjet.addEventListener("click", () => {
    engineSelect.value = "proxy";
    lgStore("lg_browser_engine", "proxy");
    if (currentRawUrl) {
      navigateTo(currentRawUrl, false);
    }
  });

  btnBackToHome.addEventListener("click", () => {
    showHome();
  });

  showHome();

  return p;
}
