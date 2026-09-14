import { createPanel } from './panel.js';
import { ICONS } from './icons.js';

export function buildHighlights(root, vw, vh, onRemove) {
  const items = [
    { title: "Explorer", sub: "Visited 10 new pages", icon: ICONS.star },
    { title: "Streak", sub: "7-day open streak", icon: ICONS.star },
    { title: "Night owl", sub: "Active after midnight", icon: ICONS.star }
  ];

  const rows = items.map(function (it) {
    return `
      <div class="lg-highlight">
        <div class="lg-badge">${it.icon}</div>
        <div style="flex:1;margin-left:10px;"><div class="h-title">${it.title}</div><div class="h-sub">${it.sub}</div></div>
      </div>
    `;
  }).join("");

  return createPanel(root, {
    key: "highlights",
    x: Math.max(24, vw - 254),
    y: 90,
    width: 230,
    title: "Highlights",
    body: rows
  }, onRemove);
}
