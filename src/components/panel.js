import { ICONS } from './icons.js';

// Shared across every panel so "bring to front on click" works globally —
// each click bumps the counter and the clicked panel takes the new top slot.
let topZ = 10;

export function raisePanel(panel) {
  topZ += 1;
  panel.style.zIndex = String(topZ);
}

export function makeDraggable(panel, handle) {
  let sx, sy, sl, st, dragging = false;
  handle.addEventListener("pointerdown", function (e) {
    // Don't start a drag (and don't steal the pointer capture) when the press
    // starts on a button in the header — e.g. the close (×) button — or its
    // subsequent click event gets retargeted to the header and never reaches
    // the button's own click listener.
    if (e.target.closest("button")) return;

    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    const r = panel.getBoundingClientRect();
    sl = r.left;
    st = r.top;
    panel.style.left = sl + "px";
    panel.style.top = st + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    panel.style.left = (sl + (e.clientX - sx)) + "px";
    panel.style.top = (st + (e.clientY - sy)) + "px";
  });
  handle.addEventListener("pointerup", function () {
    dragging = false;
  });
}

export function createPanel(root, opts, onRemove) {
  const p = document.createElement("div");
  p.className = "lg-panel";
  p.style.left = opts.x + "px";
  p.style.top = opts.y + "px";
  if (opts.width) p.style.width = opts.width + "px";
  if (opts.height) p.style.height = opts.height + "px";
  p.innerHTML = `
    <div class="lg-head">
      <span class="lg-dot"></span>
      <span class="lg-title">${opts.title}</span>
      <button class="lg-x lg-fill-btn" data-fill title="Fill Window">${ICONS.windowed}</button>
      <button class="lg-x lg-fullscreen-btn" data-fullscreen title="Fullscreen">${ICONS.maximize}</button>
      <button class="lg-x" data-close>${ICONS.close}</button>
    </div>
    <div class="lg-body ${opts.bodyClass || ""}">${opts.body}</div>
  `;
  root.appendChild(p);
  raisePanel(p);
  // Bring the panel in front of every other one as soon as it's interacted
  // with — capture phase so it fires even when the click lands on a button
  // or a child element (e.g. the iframe) inside the panel.
  p.addEventListener("pointerdown", () => raisePanel(p), true);
  makeDraggable(p, p.querySelector(".lg-head"));
  p.querySelector("[data-close]").addEventListener("click", function () {
    p.remove();
    if (onRemove) onRemove(opts.key);
  });

  // ── Fill Window (CSS-only maximize within the page, toggle back to restore) ──
  const fillBtn = p.querySelector("[data-fill]");
  let savedRect = null;
  fillBtn.addEventListener("click", function () {
    if (p.classList.contains("lg-filled")) {
      p.classList.remove("lg-filled");
      if (savedRect) {
        p.style.left = savedRect.left;
        p.style.top = savedRect.top;
        p.style.width = savedRect.width;
        p.style.height = savedRect.height;
        p.style.right = savedRect.right;
        p.style.bottom = savedRect.bottom;
      }
      fillBtn.innerHTML = ICONS.windowed;
      fillBtn.title = "Fill Window";
    } else {
      savedRect = {
        left: p.style.left,
        top: p.style.top,
        width: p.style.width,
        height: p.style.height,
        right: p.style.right,
        bottom: p.style.bottom,
      };
      p.classList.add("lg-filled");
      fillBtn.innerHTML = ICONS.minimize;
      fillBtn.title = "Restore";
    }
  });

  // ── Fullscreen (real Fullscreen API) ──────────────────────────────────────
  const fsBtn = p.querySelector("[data-fullscreen]");
  fsBtn.addEventListener("click", function () {
    if (document.fullscreenElement === p) {
      document.exitFullscreen().catch(() => {});
    } else if (p.requestFullscreen) {
      p.requestFullscreen().catch(() => {});
    }
  });
  document.addEventListener("fullscreenchange", function () {
    const isFs = document.fullscreenElement === p;
    p.classList.toggle("lg-fullscreen-active", isFs);
    fsBtn.innerHTML = isFs ? ICONS.minimize : ICONS.maximize;
    fsBtn.title = isFs ? "Exit Fullscreen" : "Fullscreen";
  });

  return p;
}
