import { ICONS } from './icons.js';

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
      <button class="lg-x" data-close>${ICONS.close}</button>
    </div>
    <div class="lg-body">${opts.body}</div>
  `;
  root.appendChild(p);
  makeDraggable(p, p.querySelector(".lg-head"));
  p.querySelector("[data-close]").addEventListener("click", function () {
    p.remove();
    if (onRemove) onRemove(opts.key);
  });
  return p;
}
