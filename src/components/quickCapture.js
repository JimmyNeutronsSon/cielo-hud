// Snapchat-style quick photo capture for chat: open the camera just long
// enough to grab one frame, then release it immediately. We never keep the
// stream alive while the user reviews the shot or picks a filter -- that's
// the main resource cost of a camera feature, so it gets cut as soon as
// possible in every path (snap, retake, cancel, or the panel closing).

const FILTERS = [
  { id: "none", label: "Normal", css: "none" },
  { id: "bw", label: "Mono", css: "grayscale(1) contrast(1.1)" },
  { id: "sepia", label: "Sepia", css: "sepia(0.75) saturate(1.3)" },
  { id: "vivid", label: "Vivid", css: "saturate(1.6) contrast(1.15)" },
  { id: "cool", label: "Cool", css: "hue-rotate(-15deg) saturate(1.2) brightness(1.05)" },
  { id: "warm", label: "Warm", css: "sepia(0.2) saturate(1.3) hue-rotate(-8deg) brightness(1.05)" },
  { id: "invert", label: "Invert", css: "invert(1)" }
];

// Cap the output size so a filtered selfie doesn't bloat the message payload
// (chat images travel as inline data: URLs -- see chat.js's 3MB file cap).
const MAX_OUTPUT_DIM = 720;
const JPEG_QUALITY = 0.82;

// Modest capture constraints -- a still frame doesn't need more than this,
// and asking for less means less work for the camera pipeline. Mirrors the
// budget voice.js uses for its video calls.
const CAMERA_CONSTRAINTS = {
  video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 }, facingMode: "user" },
  audio: false
};

// Renders into `container` (an empty, initially-hidden element already in
// the DOM) and tears itself back down to nothing once closed. Returns
// `{ close }` so the caller can force it shut (e.g. when the chat panel
// itself is closed).
export function openQuickCapture(container, { onCapture, onClose } = {}) {
  let stream = null;
  let closed = false;
  let activeFilter = FILTERS[0];

  container.innerHTML = `
    <div class="lg-capture-panel">
      <div class="lg-capture-head">
        <span>📷 Quick Photo</span>
        <button class="lg-capture-x" data-cap="close" title="Close">×</button>
      </div>
      <div class="lg-capture-stage">
        <video class="lg-capture-video" autoplay playsinline muted></video>
        <canvas class="lg-capture-canvas" style="display:none;"></canvas>
        <img class="lg-capture-shot" style="display:none;" alt="Captured photo" />
        <div class="lg-capture-status" data-cap="status">Starting camera…</div>
      </div>
      <div class="lg-capture-filters" data-cap="filters">
        ${FILTERS.map(f => `<button class="lg-capture-filter-btn${f.id === "none" ? " active" : ""}" data-filter="${f.id}">${f.label}</button>`).join("")}
      </div>
      <div class="lg-capture-actions" data-cap="live-actions">
        <button class="lg-capture-btn" data-cap="close">Cancel</button>
        <button class="lg-capture-btn primary" data-cap="snap">⚪ Snap</button>
      </div>
      <div class="lg-capture-actions" data-cap="shot-actions" style="display:none;">
        <button class="lg-capture-btn" data-cap="retake">↺ Retake</button>
        <button class="lg-capture-btn primary" data-cap="use">Use Photo</button>
      </div>
    </div>
  `;
  container.style.display = "block";

  const videoEl = container.querySelector(".lg-capture-video");
  const canvasEl = container.querySelector(".lg-capture-canvas");
  const shotImg = container.querySelector(".lg-capture-shot");
  const statusEl = container.querySelector("[data-cap='status']");
  const filterBar = container.querySelector("[data-cap='filters']");
  const liveActions = container.querySelector("[data-cap='live-actions']");
  const shotActions = container.querySelector("[data-cap='shot-actions']");

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    stopStream();
    container.innerHTML = "";
    container.style.display = "none";
    if (onClose) onClose();
  }

  async function startCamera() {
    statusEl.style.display = "flex";
    statusEl.textContent = "Starting camera…";
    try {
      const s = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (closed) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      videoEl.srcObject = stream;
      statusEl.style.display = "none";
    } catch (err) {
      statusEl.textContent = err && err.name === "NotAllowedError"
        ? "Camera permission denied."
        : "Couldn't access the camera.";
    }
  }

  filterBar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    activeFilter = FILTERS.find(f => f.id === btn.dataset.filter) || FILTERS[0];
    videoEl.style.filter = activeFilter.css;
    filterBar.querySelectorAll(".lg-capture-filter-btn").forEach(b => b.classList.toggle("active", b === btn));
  });

  container.addEventListener("click", (e) => {
    if (e.target.closest("[data-cap='close']")) {
      close();
      return;
    }

    if (e.target.closest("[data-cap='snap']")) {
      if (!stream || !videoEl.videoWidth) return;
      const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
      const scale = Math.min(1, MAX_OUTPUT_DIM / Math.max(vw, vh));
      canvasEl.width = Math.round(vw * scale);
      canvasEl.height = Math.round(vh * scale);
      const ctx = canvasEl.getContext("2d");
      ctx.filter = activeFilter.css;
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      shotImg.src = canvasEl.toDataURL("image/jpeg", JPEG_QUALITY);

      // The frame is baked into the canvas now -- no reason to keep the
      // camera running while the user decides what to do with the shot.
      stopStream();

      videoEl.style.display = "none";
      shotImg.style.display = "block";
      liveActions.style.display = "none";
      shotActions.style.display = "flex";
      return;
    }

    if (e.target.closest("[data-cap='use']")) {
      const dataUrl = shotImg.src;
      close();
      if (onCapture) onCapture(dataUrl);
      return;
    }

    if (e.target.closest("[data-cap='retake']")) {
      shotImg.style.display = "none";
      videoEl.style.display = "block";
      shotActions.style.display = "none";
      liveActions.style.display = "flex";
      startCamera();
    }
  });

  startCamera();

  return { close };
}
