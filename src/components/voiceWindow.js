/**
 * The video surface for a voice call.
 *
 * Video goes in its own browser window rather than inside the chat panel, and
 * that is a performance decision as much as an ergonomic one:
 *
 *  - The host page is arbitrary -- it may be running its own animations,
 *    heavy layout, or a backdrop-filter-laden HUD right on top of the tiles.
 *    Painting video into a separate window hands it its own compositor and
 *    keeps decoded frames off the host page's paint path entirely.
 *  - The HUD lives in a shadow root inside someone else's DOM. Video tiles in
 *    there get clipped, restacked and relaid-out by whatever the page does.
 *  - The call survives the user scrolling, navigating the HUD, or shrinking
 *    the panel, and can be parked on a second monitor.
 *
 * Remote *audio* deliberately stays in the host page, so leaving the video
 * window closed (the common case: a plain voice call) costs literally nothing
 * -- no window, no video elements, no decoding.
 *
 * Everything here is built with createElement and direct CSSOM property
 * assignment. Host pages frequently ship a strict Content-Security-Policy
 * that a popup inherits, and both inline <style> blocks and style="..."
 * attributes are blocked under one; assigning el.style.foo is not.
 */

function css(el, styles) {
  Object.keys(styles).forEach(k => { el.style[k] = styles[k]; });
  return el;
}

function el(doc, tag, styles, text) {
  const node = doc.createElement(tag);
  if (styles) css(node, styles);
  if (text != null) node.textContent = text;
  return node;
}

const BTN_BASE = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#e8f0ff",
  borderRadius: "10px",
  padding: "8px 14px",
  font: "600 13px/1 system-ui, -apple-system, Segoe UI, sans-serif",
  cursor: "pointer"
};

/**
 * Renders the tile grid + control bar into any document/container, so the
 * popup and the in-panel fallback share one implementation.
 */
export function createVideoStage(doc, container, actions = {}) {
  const tiles = new Map(); // id -> { wrap, video }

  css(container, {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: "0",
    background: "#070b18",
    color: "#e8f0ff",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
  });

  const grid = el(doc, "div", {
    flex: "1 1 auto",
    minHeight: "0",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "10px",
    padding: "12px",
    overflow: "auto",
    alignContent: "center"
  });

  const empty = el(doc, "div", {
    gridColumn: "1 / -1",
    textAlign: "center",
    color: "#8ea0c4",
    fontSize: "13px",
    lineHeight: "1.6"
  });
  empty.appendChild(el(doc, "div", { fontSize: "30px", marginBottom: "6px" }, "🎙️"));
  empty.appendChild(el(doc, "div", null, "Voice connected — nobody has video on yet."));
  empty.appendChild(el(doc, "div", { fontSize: "12px", color: "#64748b", marginTop: "4px" },
    "Turn on your camera or share your screen below."));
  grid.appendChild(empty);

  const bar = el(doc, "div", {
    flex: "0 0 auto",
    display: "flex",
    gap: "8px",
    alignItems: "center",
    padding: "10px 12px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(10,16,34,0.9)"
  });

  const status = el(doc, "div", {
    flex: "1 1 auto",
    fontSize: "12px",
    color: "#8bffb0",
    fontWeight: "600",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis"
  }, "Connecting…");

  function makeBtn(label, onClick) {
    const b = el(doc, "button", BTN_BASE, label);
    b.addEventListener("click", onClick);
    return b;
  }

  const muteBtn = makeBtn("🎤 Mute", () => actions.onMute && actions.onMute());
  const camBtn = makeBtn("📷 Cam", () => actions.onCam && actions.onCam());
  const shareBtn = makeBtn("🖥 Share", () => actions.onShare && actions.onShare());
  const leaveBtn = makeBtn("📞 Leave", () => actions.onLeave && actions.onLeave());
  css(leaveBtn, { background: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.45)", color: "#fecaca" });

  bar.appendChild(status);
  [muteBtn, camBtn, shareBtn, leaveBtn].forEach(b => bar.appendChild(b));

  container.appendChild(grid);
  container.appendChild(bar);

  function syncEmpty() {
    empty.style.display = tiles.size ? "none" : "block";
  }

  function addTile(id, label, stream, opts = {}) {
    let entry = tiles.get(id);
    if (!entry) {
      const wrap = el(doc, "div", {
        position: "relative",
        background: "#000",
        borderRadius: "12px",
        overflow: "hidden",
        aspectRatio: "16 / 9",
        border: opts.screen ? "1px solid rgba(94,231,255,0.5)" : "1px solid rgba(255,255,255,0.08)"
      });

      const video = doc.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true; // audio is played by the host page, never by a tile
      css(video, { width: "100%", height: "100%", objectFit: opts.screen ? "contain" : "cover", display: "block" });
      if (opts.mirror) video.style.transform = "scaleX(-1)";

      const caption = el(doc, "div", {
        position: "absolute",
        left: "8px",
        bottom: "8px",
        padding: "3px 8px",
        borderRadius: "999px",
        background: "rgba(0,0,0,0.55)",
        fontSize: "11px",
        fontWeight: "600",
        maxWidth: "80%",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis"
      }, label);

      const fsBtn = el(doc, "button", {
        position: "absolute",
        right: "8px",
        top: "8px",
        border: "none",
        background: "rgba(0,0,0,0.5)",
        color: "#fff",
        borderRadius: "8px",
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: "12px"
      }, "⛶");
      fsBtn.addEventListener("click", () => {
        const fn = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
        if (fn) fn.call(wrap).catch(() => {});
      });

      wrap.appendChild(video);
      wrap.appendChild(caption);
      wrap.appendChild(fsBtn);
      grid.appendChild(wrap);
      entry = { wrap, video, caption };
      tiles.set(id, entry);
    }

    entry.caption.textContent = label;
    entry.video.srcObject = stream;
    // Chrome-only: tells the jitter buffer to favour latency over smoothing,
    // which is the right trade for a live call.
    try { entry.video.playoutDelayHint = 0; } catch (e) {}
    entry.video.play().catch(() => {});
    syncEmpty();
  }

  function removeTile(id) {
    const entry = tiles.get(id);
    if (!entry) return;
    entry.video.srcObject = null;
    entry.wrap.remove();
    tiles.delete(id);
    syncEmpty();
  }

  function removePeerTiles(peerId) {
    Array.from(tiles.keys())
      .filter(id => id.indexOf(peerId + ":") === 0)
      .forEach(removeTile);
  }

  function setState(state) {
    muteBtn.textContent = state.muted ? "🔇 Unmute" : "🎤 Mute";
    css(muteBtn, state.muted
      ? { background: "rgba(239,68,68,0.18)", borderColor: "rgba(239,68,68,0.45)" }
      : { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)" });

    camBtn.textContent = state.cam ? "📹 Cam On" : "📷 Cam";
    css(camBtn, state.cam
      ? { background: "rgba(94,231,255,0.18)", borderColor: "rgba(94,231,255,0.45)" }
      : { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)" });

    shareBtn.textContent = state.share ? "🛑 Stop Share" : "🖥 Share";
    css(shareBtn, state.share
      ? { background: "rgba(94,231,255,0.18)", borderColor: "rgba(94,231,255,0.45)" }
      : { background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)" });

    if (state.status) status.textContent = state.status;
  }

  function destroy() {
    Array.from(tiles.keys()).forEach(removeTile);
    grid.remove();
    bar.remove();
  }

  return { addTile, removeTile, removePeerTiles, setState, destroy, get tileCount() { return tiles.size; } };
}

/**
 * Opens the call in its own window. Returns null when the browser blocks the
 * popup, and the caller falls back to the in-panel stage.
 */
export function openVoiceWindow({ title, actions, onClosed }) {
  const width = Math.min(1000, Math.max(520, Math.floor(window.screen.availWidth * 0.55)));
  const height = Math.min(680, Math.max(380, Math.floor(window.screen.availHeight * 0.6)));
  const left = Math.max(0, Math.floor((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.floor((window.screen.availHeight - height) / 2));

  let win;
  try {
    win = window.open(
      "",
      "cielo-voice",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  } catch (e) {
    return null;
  }
  if (!win || win.closed) return null;

  const doc = win.document;
  doc.title = title || "Cielo Voice";
  // The window is reused across joins (same name), so clear any old contents.
  while (doc.body && doc.body.firstChild) doc.body.removeChild(doc.body.firstChild);
  if (!doc.body) doc.documentElement.appendChild(doc.createElement("body"));

  css(doc.documentElement, { height: "100%" });
  css(doc.body, { height: "100%", margin: "0", background: "#070b18", overflow: "hidden" });

  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const stage = createVideoStage(doc, mount, actions);

  // Closing the window is "stop showing video", not "hang up" -- the call
  // keeps running as audio-only, which is the cheapest state there is.
  const onUnload = () => { if (onClosed) onClosed(); };
  win.addEventListener("pagehide", onUnload);
  win.addEventListener("beforeunload", onUnload);

  return {
    stage,
    focus() { try { win.focus(); } catch (e) {} },
    close() {
      win.removeEventListener("pagehide", onUnload);
      win.removeEventListener("beforeunload", onUnload);
      try { win.close(); } catch (e) {}
    },
    get isOpen() { return !win.closed; }
  };
}
