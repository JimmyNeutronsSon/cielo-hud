import { createPanel } from './panel.js';

export function buildPerf(root, vw, vh, onRemove) {
  const p = createPanel(root, {
    key: "perf",
    x: Math.max(24, Math.floor(vw * 0.06)),
    y: 620,
    width: 230,
    title: "Performance",
    body: `
      <div class="lg-stat"><span class="k">CPU</span><div class="track"><div class="fill" data-cpu style="width:22%"></div></div><span class="v" data-cpu-v>22%</span></div>
      <div class="lg-stat"><span class="k">GPU</span><div class="track"><div class="fill" data-gpu style="width:38%"></div></div><span class="v" data-gpu-v>38%</span></div>
      <div class="lg-stat"><span class="k">VRAM</span><div class="track"><div class="fill" data-vram style="width:31%"></div></div><span class="v" data-vram-v>31%</span></div>
      <div class="lg-stat"><span class="k">RAM</span><div class="track"><div class="fill" data-ram style="width:54%"></div></div><span class="v" data-ram-v>54%</span></div>
      <div class="lg-stat"><span class="k">FPS</span><div class="track"><div class="fill" data-fps style="width:96%;background:linear-gradient(90deg,#8bffb0,#5ee7ff)"></div></div><span class="v" data-fps-v>60</span></div>
    `
  }, onRemove);

  function jiggle(panel, key, lo, hi, suffix, isFps) {
    const v = Math.round(lo + Math.random() * (hi - lo));
    const fill = panel.querySelector("[data-" + key + "]");
    const label = panel.querySelector("[data-" + key + "-v]");
    if (fill) fill.style.width = (isFps ? (v / 60 * 100) : v) + "%";
    if (label) label.textContent = v + suffix;
  }

  const iv = setInterval(function () {
    if (!document.body.contains(p)) {
      clearInterval(iv);
      return;
    }
    jiggle(p, "cpu", 8, 45, "%");
    jiggle(p, "gpu", 20, 70, "%");
    jiggle(p, "vram", 15, 55, "%");
    jiggle(p, "ram", 40, 75, "%");
    jiggle(p, "fps", 50, 60, "", true);
  }, 1200);

  return p;
}
