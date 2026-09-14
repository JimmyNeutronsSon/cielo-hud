import { createPanel } from './panel.js';

export function buildAudio(root, vw, vh, onRemove) {
  const p = createPanel(root, {
    key: "audio",
    x: Math.max(24, Math.floor(vw * 0.06)),
    y: 300,
    width: 230,
    title: "Audio",
    body: `
      <div class="lg-row"><span>Output</span><div class="lg-toggle on" data-t></div></div>
      <div class="lg-row"><span>Microphone</span><div class="lg-toggle on" data-t></div></div>
      <div class="lg-label">Input level</div>
      <input class="lg-slider" type="range" min="0" max="100" value="42">
      <div class="lg-label">Output level</div>
      <input class="lg-slider" type="range" min="0" max="100" value="79">
      <div class="lg-label">Output device</div>
      <select class="lg-select"><option>Studio Monitor 27"</option><option>Wired Headset</option></select>
      <div class="lg-label">Input device</div>
      <select class="lg-select"><option>Array Mic (Built-in)</option><option>USB Condenser</option></select>
    `
  }, onRemove);

  p.querySelectorAll("[data-t]").forEach(function (t) {
    t.addEventListener("click", function () {
      t.classList.toggle("on");
    });
  });

  return p;
}
