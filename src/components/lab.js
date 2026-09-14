import { createPanel } from './panel.js';
import { icon } from './icons.js';

export function buildLab(root, vw, vh, dock, onRemove) {
  const p = createPanel(root, {
    key: "lab",
    x: Math.max(24, vw - 274),
    y: 120,
    width: 260,
    title: "Liquid Glass Controls",
    body: `
      <div class="lg-label">Edge Intensity</div>
      <input class="lg-slider" type="range" min="0" max="0.1" step="0.005" value="0.012" data-lab-edge>
      <div class="lg-label">Rim Intensity</div>
      <input class="lg-slider" type="range" min="0" max="0.2" step="0.01" value="0.05" data-lab-rim>
      <div class="lg-label">Base Intensity</div>
      <input class="lg-slider" type="range" min="0" max="0.1" step="0.005" value="0.02" data-lab-base-int>
      <div class="lg-label">Edge Distance</div>
      <input class="lg-slider" type="range" min="0" max="10" step="0.5" value="2" data-lab-edge-dist>
      <div class="lg-label">Rim Distance</div>
      <input class="lg-slider" type="range" min="0" max="20" step="1" value="8" data-lab-rim-dist>
      <div class="lg-label">Base Distance</div>
      <input class="lg-slider" type="range" min="0" max="40" step="1" value="21" data-lab-base>
      <div class="lg-label">Corner Boost</div>
      <input class="lg-slider" type="range" min="0" max="0.05" step="0.002" value="0.01" data-lab-corner>
      <div class="lg-label">Ripple Effect</div>
      <input class="lg-slider" type="range" min="0.01" max="0.1" step="0.005" value="0.05" data-lab-ripple>
      <div class="lg-label">Blur Radius</div>
      <input class="lg-slider" type="range" min="0" max="10" step="0.5" value="2" data-lab-blur>
      <div class="lg-label">Tint Opacity</div>
      <input class="lg-slider" type="range" min="0.1" max="0.9" step="0.05" value="0.6" data-lab-alpha>
      <div class="lg-row" style="margin-top:12px;"><span>Enable Center Warp</span><div class="lg-toggle" data-lab-warp></div></div>
      <div class="lg-row"><span>Hide All Buttons</span><div class="lg-toggle" data-lab-hide-btns></div></div>
      <div class="lg-btn" data-lab-random style="margin-top:12px;flex-direction:row;justify-content:center;gap:6px;">
        ${icon('<path d="M12 3.5l2.4 5 5.4.6-4 3.8 1 5.4L12 15.8l-4.8 2.5 1-5.4-4-3.8 5.4-.6z"></path>')}Randomize Glass Effects
      </div>
    `
  }, onRemove);

  const blurIn = p.querySelector("[data-lab-blur]");
  const edgeIn = p.querySelector("[data-lab-edge]");
  const rimIn = p.querySelector("[data-lab-rim]");
  const baseIntIn = p.querySelector("[data-lab-base-int]");
  const edgeDistIn = p.querySelector("[data-lab-edge-dist]");
  const rimDistIn = p.querySelector("[data-lab-rim-dist]");
  const baseIn = p.querySelector("[data-lab-base]");
  const cornerIn = p.querySelector("[data-lab-corner]");
  const rippleIn = p.querySelector("[data-lab-ripple]");
  const alphaIn = p.querySelector("[data-lab-alpha]");
  const warpToggle = p.querySelector("[data-lab-warp]");
  const hideBtnsToggle = p.querySelector("[data-lab-hide-btns]");
  const randomBtn = p.querySelector("[data-lab-random]");

  function updateRefraction() {
    root.style.setProperty("--lg-blur", blurIn.value + "px");
    root.style.setProperty("--lg-blur-base", (blurIn.value * 0.5) + "px");

    const t1 = root.querySelector("#lg-turb-1");
    const t2 = root.querySelector("#lg-turb-2");
    const d1 = root.querySelector("#lg-disp-1");
    const d2 = root.querySelector("#lg-disp-2");

    if (t1) t1.setAttribute("baseFrequency", edgeIn.value);
    if (t2) t2.setAttribute("baseFrequency", rippleIn.value);
    if (d1) {
      d1.setAttribute("scale", baseIn.value);
      d1.setAttribute("xChannelSelector", warpToggle.classList.contains("on") ? "R" : "G");
    }
    if (d2) d2.setAttribute("scale", rimIn.value * 300);

    root.style.setProperty("--lg-panel-alpha", alphaIn.value);
  }

  [blurIn, edgeIn, rimIn, baseIntIn, edgeDistIn, rimDistIn, baseIn, cornerIn, rippleIn, alphaIn].forEach(function (el) {
    el.addEventListener("input", updateRefraction);
  });

  warpToggle.addEventListener("click", function () {
    warpToggle.classList.toggle("on");
    updateRefraction();
  });

  hideBtnsToggle.addEventListener("click", function () {
    hideBtnsToggle.classList.toggle("on");
    if (dock) {
      const dockButtons = dock.querySelectorAll("button:not(.lg-close)");
      dockButtons.forEach(function (b) {
        b.style.display = hideBtnsToggle.classList.contains("on") ? "none" : "flex";
      });
    }
  });

  randomBtn.addEventListener("click", function () {
    blurIn.value = (Math.random() * 8).toFixed(1);
    edgeIn.value = (Math.random() * 0.08).toFixed(3);
    rimIn.value = (Math.random() * 0.15).toFixed(2);
    baseIn.value = Math.floor(Math.random() * 35);
    rippleIn.value = (Math.random() * 0.08 + 0.01).toFixed(3);
    alphaIn.value = (Math.random() * 0.5 + 0.3).toFixed(2);
    if (Math.random() > 0.5) warpToggle.classList.add("on"); else warpToggle.classList.remove("on");
    updateRefraction();
  });

  return p;
}
