import { createPanel } from './panel.js';

export function buildTestWidget(root, vw, vh, onRemove) {
  return createPanel(root, {
    key: "testWidget",
    x: Math.max(24, Math.floor(vw / 2 - 140)),
    y: 220,
    width: 280,
    height: 200,
    title: "Test Widget",
    body: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center;color:#b0c4de;">
        <p style="margin:0 0 8px;font-weight:600;color:#fff;">Blank Sizable Area</p>
        <p style="margin:0;font-size:12px;">Drag the bottom-right corner to resize this widget, or drag the header to move it around.</p>
      </div>
    `
  }, onRemove);
}
