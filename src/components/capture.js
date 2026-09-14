import { createPanel } from './panel.js';
import { ICONS, icon } from './icons.js';

export function buildCapture(root, vw, vh, onRemove) {
  return createPanel(root, {
    key: "capture",
    x: Math.max(24, Math.floor(vw * 0.06)),
    y: 90,
    width: 230,
    title: "Capture",
    body: `
      <div class="lg-row">
        <div class="lg-btn">${ICONS.capture}Screenshot</div>
        <div class="lg-btn rec">${icon('<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"></circle>')}Record</div>
        <div class="lg-btn">${icon('<rect x="9" y="3" width="6" height="10" rx="3"></rect><path d="M6 11a6 6 0 0 0 12 0"></path>')}Mic</div>
      </div>
      <a class="lg-link" href="#" onclick="return false;">${icon('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18"></path>')} See my captures</a>
      <div class="lg-swatches">
        <div class="lg-swatch" style="background:linear-gradient(135deg,#5ee7ff55,#8b7cf655)"></div>
        <div class="lg-swatch" style="background:linear-gradient(135deg,#ffb3e655,#5ee7ff55)"></div>
        <div class="lg-swatch" style="background:linear-gradient(135deg,#8b7cf655,#ffd58a55)"></div>
      </div>
    `
  }, onRemove);
}
