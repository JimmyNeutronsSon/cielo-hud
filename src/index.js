import hudCss from './styles.css';
import { captureBootstrapUsername } from './components/identity.js';

// Must run synchronously at the top of the bundle -- document.currentScript
// is only valid during the initial synchronous script execution, so this
// can't be deferred into buildChat() which runs later, after the user opens
// the chat panel.
captureBootstrapUsername();

import { buildDock } from './components/dock.js';
import { buildChat } from './components/chat.js';
import { buildSettings, applySavedTheme } from './components/settings.js';
import { buildBrowser } from './components/browser.js';
import { buildGames } from './components/games.js';
import { buildMusic } from './components/music.js';

export function liquidGlassHUD() {
  const ROOT_ID = "lg-hud-root-v1";
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    existing.style.display = (existing.style.display === "none") ? "block" : "none";
    return;
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.body.appendChild(host);

  // Everything lives inside a shadow root so the host page's own CSS (resets,
  // global `svg`/`button`/`*` rules, icon-font overrides, etc.) can never leak
  // in and break our icons/layout, and our styles can never leak out either.
  const shadow = host.attachShadow({ mode: "open" });

  const styleTag = document.createElement("style");
  styleTag.textContent = hudCss;
  shadow.appendChild(styleTag);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  shadow.appendChild(root);

  // Restore the accent theme picked in Settings before anything renders, so
  // there's no flash of the default colors.
  applySavedTheme(root);

  // SVG filter setup for liquid refraction
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden;");
  svg.innerHTML = `
    <filter id="lg-refraction" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feTurbulence id="lg-turb-1" type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="9" result="rimNoise"/>
      <feGaussianBlur in="rimNoise" stdDeviation="2" result="rimNoiseSoft"/>
      <feTurbulence id="lg-turb-2" type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="4" result="rippleNoise"/>
      <feComposite in="rimNoiseSoft" in2="rippleNoise" operator="arithmetic" k1="0" k2="0.7" k3="0.3" k4="0" result="combinedNoise"/>
      <feDisplacementMap id="lg-disp-1" in="SourceGraphic" in2="combinedNoise" scale="3" xChannelSelector="R" yChannelSelector="G" result="baseWarp"/>
      <feDisplacementMap id="lg-disp-2" in="baseWarp" in2="combinedNoise" scale="21" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  `;
  root.appendChild(svg);

  const dim = document.createElement("div");
  dim.className = "lg-dim";
  root.appendChild(dim);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panels = {};

  const onRemovePanel = (key) => {
    delete panels[key];
    const btn = dock.querySelector(`.lg-dock button[data-key="${key}"]`);
    if (btn) btn.classList.remove("active");
  };

  let dock = null;

  const builders = {
    chat: (r, w, h) => buildChat(r, w, h, onRemovePanel),
    settings: (r, w, h) => buildSettings(r, w, h, dock, onRemovePanel),
    browser: (r, w, h) => buildBrowser(r, w, h, onRemovePanel),
    games: (r, w, h) => buildGames(r, w, h, onRemovePanel),
    music: (r, w, h) => buildMusic(r, w, h, onRemovePanel)
  };

  const togglePanel = (key, btn) => {
    if (panels[key] && panels[key].isConnected) {
      panels[key].remove();
      delete panels[key];
      btn.classList.remove("active");
    } else {
      if (builders[key]) {
        panels[key] = builders[key](root, vw, vh);
        btn.classList.add("active");
      }
    }
  };

  dock = buildDock(root, togglePanel, () => {
    // Let any open widgets tear down their own resources (e.g. an active mic
    // stream in a voice call) before the HUD is removed from the page.
    root.dispatchEvent(new CustomEvent("lg:hud-close"));
    root.remove();
  });

  // No panels open by default — the user picks them from the dock.
}

// Auto-run when injected as a bookmarklet
liquidGlassHUD();
