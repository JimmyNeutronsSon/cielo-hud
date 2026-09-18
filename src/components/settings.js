import { createPanel } from './panel.js';
import { icon, ICONS } from './icons.js';
import { lgStore } from './storage.js';

const THEME_KEY = "cielo.theme";
const ZOOM_KEY = "cielo.panelZoom";
const ZOOM_DEFAULT_AMT = 1.06;

function readSavedPanelZoom() {
  try {
    const raw = lgStore(ZOOM_KEY);
    if (!raw) return { on: false, amt: ZOOM_DEFAULT_AMT };
    const parsed = JSON.parse(raw);
    return {
      on: !!parsed.on,
      amt: typeof parsed.amt === "number" ? parsed.amt : ZOOM_DEFAULT_AMT
    };
  } catch {
    return { on: false, amt: ZOOM_DEFAULT_AMT };
  }
}

/**
 * Real glass magnifies whatever sits behind it, so a panel you're looking at
 * should read as very slightly larger than one you aren't. This just applies
 * that as a CSS custom property + class on the root; the actual hover-scale
 * rule lives in styles.css so it works even before Settings has ever opened
 * to wire up JS for it.
 */
export function applySavedPanelZoom(root) {
  const { on, amt } = readSavedPanelZoom();
  root.classList.toggle("lg-panel-zoom-on", on);
  root.style.setProperty("--lg-panel-zoom-amt", amt);
}

function savePanelZoom(root, on, amt) {
  root.classList.toggle("lg-panel-zoom-on", on);
  root.style.setProperty("--lg-panel-zoom-amt", amt);
  try {
    lgStore(ZOOM_KEY, JSON.stringify({ on, amt }));
  } catch {
    /* storage blocked on this page — setting just won't persist */
  }
}

// Each theme is just the two accent colors every gradient/glow/highlight in
// styles.css reads through --lg-accent(-rgb)/--lg-accent2(-rgb) — see the
// var() fallbacks added there. Picking one restyles the whole HUD, not just
// this panel.
const THEMES = [
  { id: "aurora", name: "Aurora", a: "94, 231, 255", a2: "139, 92, 246" }, // default
  { id: "sunset", name: "Sunset", a: "255, 158, 94", a2: "236, 72, 153" },
  { id: "emerald", name: "Emerald", a: "74, 222, 128", a2: "45, 212, 191" },
  { id: "crimson", name: "Crimson", a: "248, 113, 113", a2: "251, 191, 36" },
  { id: "mono", name: "Mono", a: "226, 232, 240", a2: "148, 163, 184" },
];

function rgb(str) {
  return `rgb(${str})`;
}

export function applySavedTheme(root) {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch {
    /* storage blocked on this page — fall back to the default theme */
  }
  const theme = THEMES.find((t) => t.id === saved) || THEMES[0];
  root.style.setProperty("--lg-accent-rgb", theme.a);
  root.style.setProperty("--lg-accent2-rgb", theme.a2);
  root.style.setProperty("--lg-accent", rgb(theme.a));
  root.style.setProperty("--lg-accent2", rgb(theme.a2));
}

function setTheme(root, theme) {
  root.style.setProperty("--lg-accent-rgb", theme.a);
  root.style.setProperty("--lg-accent2-rgb", theme.a2);
  root.style.setProperty("--lg-accent", rgb(theme.a));
  root.style.setProperty("--lg-accent2", rgb(theme.a2));
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    /* storage blocked on this page — theme just won't persist */
  }
}

export function buildSettings(root, vw, vh, dock, onRemove) {
  const width = 300;
  const height = Math.min(560, Math.max(420, Math.floor(vh * 0.72)));

  const panel = createPanel(
    root,
    {
      key: "settings",
      x: Math.max(24, vw - width - 24),
      y: 96,
      width: width,
      height: height,
      title: "Settings",
      bodyClass: "lg-settings-body",
      body: `
      <div class="lg-settings">
        <div class="lg-settings-tabs" data-tabs>
          <button class="lg-settings-tab active" data-tab="lab">Glass Lab</button>
          <button class="lg-settings-tab" data-tab="themes">Themes</button>
          <button class="lg-settings-tab" data-tab="playground">Playground</button>
        </div>

        <div class="lg-settings-pane" data-pane="lab">
          <div class="lg-label">Edge Intensity</div>
          <input class="lg-slider" type="range" min="0" max="0.1" step="0.005" value="0.012" data-lab-edge>
          <div class="lg-label">Rim Intensity</div>
          <input class="lg-slider" type="range" min="0" max="0.2" step="0.01" value="0.05" data-lab-rim>
          <div class="lg-label">Base Intensity</div>
          <input class="lg-slider" type="range" min="0" max="0.1" step="0.005" value="0.02" data-lab-base-int>
          <div class="lg-label">Edge Distance</div>
          <input class="lg-slider" type="range" min="0" max="10" step="0.5" value="2" data-lab-edge-dist>
          <div class="lg-label">Rim Distance</div>
          <input class="lg-slider" type="range" min="0" max="20" step="1" value="8" data-lab-rim-dist>
          <div class="lg-label">Base Distance</div>
          <input class="lg-slider" type="range" min="0" max="40" step="1" value="21" data-lab-base>
          <div class="lg-label">Corner Boost</div>
          <input class="lg-slider" type="range" min="0" max="0.05" step="0.002" value="0.01" data-lab-corner>
          <div class="lg-label">Ripple Effect</div>
          <input class="lg-slider" type="range" min="0.01" max="0.1" step="0.005" value="0.05" data-lab-ripple>
          <div class="lg-label">Blur Radius</div>
          <input class="lg-slider" type="range" min="0" max="10" step="0.5" value="2" data-lab-blur>
          <div class="lg-label">Tint Opacity</div>
          <input class="lg-slider" type="range" min="0.1" max="0.9" step="0.05" value="0.6" data-lab-alpha>
          <div class="lg-label">Glass Zoom <span class="lg-settings-hint">(dock magnification)</span></div>
          <input class="lg-slider" type="range" min="1" max="2.6" step="0.1" value="1.8" data-lab-zoom-amt>
          <div class="lg-row" style="margin-top:12px;"><span>Enable Center Warp</span><div class="lg-toggle" data-lab-warp></div></div>
          <div class="lg-row"><span>Hide All Buttons</span><div class="lg-toggle" data-lab-hide-btns></div></div>
          <div class="lg-row"><span>Glass Zoom on Dock</span><div class="lg-toggle" data-lab-zoom></div></div>
          <div class="lg-label" style="margin-top:12px;">Panel Magnification <span class="lg-settings-hint">(peek through the glass)</span></div>
          <input class="lg-slider" type="range" min="1" max="1.15" step="0.01" value="1.06" data-lab-panel-zoom-amt>
          <div class="lg-row"><span>Magnify Panel on Hover</span><div class="lg-toggle" data-lab-panel-zoom></div></div>
          <div class="lg-btn" data-lab-random style="margin-top:12px;flex-direction:row;justify-content:center;gap:6px;">
            ${icon('<path d="M12 3.5l2.4 5 5.4.6-4 3.8 1 5.4L12 15.8l-4.8 2.5 1-5.4-4-3.8 5.4-.6z"></path>')}Randomize Glass Effects
          </div>
        </div>

        <div class="lg-settings-pane" data-pane="themes" hidden>
          <div class="lg-label">Accent Theme</div>
          <div class="lg-settings-swatches" data-swatches></div>
          <div class="lg-settings-hint" style="margin-top:10px;">
            Recolors every glow, chip, and highlight across the whole HUD — not just this panel.
          </div>
        </div>

        <div class="lg-settings-pane" data-pane="playground" hidden>
          <div class="lg-settings-playground">
            <p style="margin:0 0 8px;font-weight:600;color:#fff;">Blank Sizable Area</p>
            <p style="margin:0;font-size:12px;">Drag the bottom-right corner to resize this widget, or drag the header to move it around.</p>
          </div>
        </div>
      </div>
    `,
    },
    onRemove
  );

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = panel.querySelectorAll("[data-tab]");
  const panes = panel.querySelectorAll("[data-pane]");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("active", t === tab));
      panes.forEach((p) => {
        p.hidden = p.dataset.pane !== tab.dataset.tab;
      });
    });
  });

  // ── Glass Lab ─────────────────────────────────────────────────────────────
  const blurIn = panel.querySelector("[data-lab-blur]");
  const edgeIn = panel.querySelector("[data-lab-edge]");
  const rimIn = panel.querySelector("[data-lab-rim]");
  const baseIntIn = panel.querySelector("[data-lab-base-int]");
  const edgeDistIn = panel.querySelector("[data-lab-edge-dist]");
  const rimDistIn = panel.querySelector("[data-lab-rim-dist]");
  const baseIn = panel.querySelector("[data-lab-base]");
  const cornerIn = panel.querySelector("[data-lab-corner]");
  const rippleIn = panel.querySelector("[data-lab-ripple]");
  const alphaIn = panel.querySelector("[data-lab-alpha]");
  const zoomAmtIn = panel.querySelector("[data-lab-zoom-amt]");
  const warpToggle = panel.querySelector("[data-lab-warp]");
  const hideBtnsToggle = panel.querySelector("[data-lab-hide-btns]");
  const zoomToggle = panel.querySelector("[data-lab-zoom]");
  const panelZoomAmtIn = panel.querySelector("[data-lab-panel-zoom-amt]");
  const panelZoomToggle = panel.querySelector("[data-lab-panel-zoom]");
  const randomBtn = panel.querySelector("[data-lab-random]");

  function updateRefraction() {
    root.style.setProperty("--lg-blur", blurIn.value + "px");
    root.style.setProperty("--lg-blur-base", (blurIn.value * 0.5) + "px");

    const t1 = root.querySelector("#lg-turb-1");
    const t2 = root.querySelector("#lg-turb-2");
    const d1 = root.querySelector("#lg-disp-1");
    const d2 = root.querySelector("#lg-disp-2");

    if (t1) t1.setAttribute("baseFrequency", edgeIn.value);
    if (t2) t2.setAttribute("baseFrequency", rippleIn.value);
    if (d1) {
      d1.setAttribute("scale", baseIn.value);
      d1.setAttribute("xChannelSelector", warpToggle.classList.contains("on") ? "R" : "G");
    }
    if (d2) d2.setAttribute("scale", rimIn.value * 300);

    root.style.setProperty("--lg-panel-alpha", alphaIn.value);
  }

  [blurIn, edgeIn, rimIn, baseIntIn, edgeDistIn, rimDistIn, baseIn, cornerIn, rippleIn, alphaIn].forEach(
    function (el) {
      el.addEventListener("input", updateRefraction);
    }
  );

  warpToggle.addEventListener("click", function () {
    warpToggle.classList.toggle("on");
    updateRefraction();
  });

  hideBtnsToggle.addEventListener("click", function () {
    hideBtnsToggle.classList.toggle("on");
    if (dock) {
      const dockButtons = dock.querySelectorAll("button:not(.lg-close)");
      dockButtons.forEach(function (b) {
        b.style.display = hideBtnsToggle.classList.contains("on") ? "none" : "flex";
      });
    }
  });

  randomBtn.addEventListener("click", function () {
    blurIn.value = (Math.random() * 8).toFixed(1);
    edgeIn.value = (Math.random() * 0.08).toFixed(3);
    rimIn.value = (Math.random() * 0.15).toFixed(2);
    baseIn.value = Math.floor(Math.random() * 35);
    rippleIn.value = (Math.random() * 0.08 + 0.01).toFixed(3);
    alphaIn.value = (Math.random() * 0.5 + 0.3).toFixed(2);
    if (Math.random() > 0.5) warpToggle.classList.add("on");
    else warpToggle.classList.remove("on");
    updateRefraction();
  });

  // ── Glass Zoom (macOS-dock-style magnification on hover) ────────────────
  let onDockMove = null;
  let onDockLeave = null;

  function clearDockZoom() {
    if (!dock) return;
    dock.querySelectorAll("button").forEach((b) => {
      b.style.transform = "";
    });
  }

  function enableDockZoom() {
    if (!dock || onDockMove) return;
    const influence = 95; // px radius of the magnification falloff
    onDockMove = (e) => {
      const maxScale = Number(zoomAmtIn.value) || 1.8;
      dock.querySelectorAll("button").forEach((b) => {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const t = Math.max(0, 1 - dist / influence);
        const scale = 1 + t * (maxScale - 1);
        const lift = t * 6;
        b.style.transform = `translateY(${-lift}px) scale(${scale})`;
      });
    };
    onDockLeave = () => clearDockZoom();
    dock.addEventListener("pointermove", onDockMove);
    dock.addEventListener("pointerleave", onDockLeave);
  }

  function disableDockZoom() {
    if (!dock || !onDockMove) return;
    dock.removeEventListener("pointermove", onDockMove);
    dock.removeEventListener("pointerleave", onDockLeave);
    onDockMove = null;
    onDockLeave = null;
    clearDockZoom();
  }

  zoomToggle.addEventListener("click", function () {
    zoomToggle.classList.toggle("on");
    if (zoomToggle.classList.contains("on")) enableDockZoom();
    else disableDockZoom();
  });

  // ── Panel Magnification (glass makes what's behind it read slightly bigger) ──
  const savedPanelZoom = readSavedPanelZoom();
  panelZoomAmtIn.value = savedPanelZoom.amt;
  panelZoomToggle.classList.toggle("on", savedPanelZoom.on);

  panelZoomToggle.addEventListener("click", function () {
    panelZoomToggle.classList.toggle("on");
    savePanelZoom(root, panelZoomToggle.classList.contains("on"), Number(panelZoomAmtIn.value));
  });

  panelZoomAmtIn.addEventListener("input", function () {
    savePanelZoom(root, panelZoomToggle.classList.contains("on"), Number(panelZoomAmtIn.value));
  });

  // ── Themes ────────────────────────────────────────────────────────────────
  const swatchesEl = panel.querySelector("[data-swatches]");
  let activeThemeId = null;
  try {
    activeThemeId = localStorage.getItem(THEME_KEY);
  } catch {
    /* storage blocked on this page */
  }
  THEMES.forEach((theme) => {
    const b = document.createElement("button");
    b.className = "lg-settings-swatch" + (theme.id === (activeThemeId || THEMES[0].id) ? " active" : "");
    b.dataset.theme = theme.id;
    b.style.setProperty("--sw-a", rgb(theme.a));
    b.style.setProperty("--sw-b", rgb(theme.a2));
    b.innerHTML = `<span class="lg-settings-swatch-dot"></span><span>${theme.name}</span>`;
    b.addEventListener("click", () => {
      setTheme(root, theme);
      swatchesEl.querySelectorAll(".lg-settings-swatch").forEach((s) => {
        s.classList.toggle("active", s === b);
      });
    });
    swatchesEl.appendChild(b);
  });

  // Dock magnification only makes sense while the dock exists — tear it down
  // with the panel or the whole HUD, same as any other listener this widget adds.
  const teardown = () => {
    disableDockZoom();
    root.removeEventListener("lg:hud-close", teardown);
  };
  root.addEventListener("lg:hud-close", teardown);
  panel.querySelector("[data-close]").addEventListener("click", teardown);

  return panel;
}
