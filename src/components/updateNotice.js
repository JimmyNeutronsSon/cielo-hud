import { ICONS } from './icons.js';
import { lgStore } from './storage.js';

// Bump this whenever a new one-time notice needs to show even to people who
// dismissed a previous one -- each version gets its own dismissed flag.
const NOTICE_ID = "youtube-2026-09";
const DISMISS_KEY = "_lg_hud_notice_" + NOTICE_ID;

/**
 * A one-time "heads up" card, styled like every other glass surface in the
 * HUD. Shows once per browser (tracked via the safe localStorage wrapper, so
 * it still behaves -- just non-persistently -- on pages that block storage),
 * then never again once dismissed.
 */
export function buildUpdateNotice(root) {
  if (lgStore(DISMISS_KEY)) return null;

  const card = document.createElement("div");
  card.className = "lg-notice";
  card.innerHTML = `
    <div class="lg-notice-icon">${ICONS.alert}</div>
    <div class="lg-notice-body">
      <div class="lg-notice-title">v0.0.8 (Beta)</div>
      <div class="lg-notice-text">New: YouTube search &amp; playback. Some songs and games still aren't working right now.</div>
    </div>
    <button class="lg-notice-close" data-notice-close title="Dismiss">${ICONS.close}</button>
  `;
  root.appendChild(card);

  function dismiss() {
    lgStore(DISMISS_KEY, "1");
    card.classList.add("lg-notice-out");
    // Let the exit animation play before actually removing the node.
    setTimeout(() => card.remove(), 200);
  }

  card.querySelector("[data-notice-close]").addEventListener("click", dismiss);

  return card;
}
