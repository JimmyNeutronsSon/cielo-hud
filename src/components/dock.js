import { ICONS } from './icons.js';

export function buildDock(root, onTogglePanel, onCloseAll) {
  const dock = document.createElement("div");
  dock.className = "lg-dock";

  const dockItems = [
    ["chat", "Chat", ICONS.chat],
    ["youtube", "YouTube", ICONS.youtube],
    ["browser", "Scramjet Browser", ICONS.browser],
    ["games", "Games", ICONS.games],
    ["music", "Music", ICONS.music],
    ["settings", "Settings", ICONS.gear]
  ];

  dockItems.forEach(function (d) {
    const b = document.createElement("button");
    b.title = d[1];
    b.setAttribute("data-key", d[0]);
    b.innerHTML = d[2];
    b.addEventListener("click", function () {
      onTogglePanel(d[0], b);
    });
    dock.appendChild(b);
  });

  const sep = document.createElement("div");
  sep.className = "lg-sep";
  dock.appendChild(sep);

  const closeAll = document.createElement("button");
  closeAll.className = "lg-close";
  closeAll.title = "Close HUD";
  closeAll.innerHTML = ICONS.close;
  closeAll.addEventListener("click", function () {
    if (onCloseAll) onCloseAll();
  });
  dock.appendChild(closeAll);

  root.appendChild(dock);
  return dock;
}
