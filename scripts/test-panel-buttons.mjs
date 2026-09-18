import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");

const server = createServer(async (req, res) => {
  let filePath = path.join(distDir, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    const type = ext === ".js" ? "application/javascript" : ext === ".html" ? "text/html" : "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((resolve) => server.listen(5512, resolve));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (err) => console.log("[pageerror]", err.message));

await page.goto("http://localhost:5512/");
await page.click("#preview-btn");
await page.waitForTimeout(800);

for (const key of ["chat", "browser", "music"]) {
  await page.click(`[data-key="${key}"]`);
  await page.waitForTimeout(400);
  const panel = page.locator(".lg-panel").last();
  const hasFill = await panel.locator("[data-fill]").count();
  const hasFs = await panel.locator("[data-fullscreen]").count();
  console.log(`${key}: fill-btn=${hasFill} fullscreen-btn=${hasFs}`);
}

// Test fill toggle on the last opened panel (music)
const panel = page.locator(".lg-panel").last();
const before = await panel.evaluate(el => ({ w: el.style.width, cls: el.className }));
console.log("before fill:", before);
await panel.locator("[data-fill]").click();
await page.waitForTimeout(300);
const after = await panel.evaluate(el => ({ cls: el.className, rect: el.getBoundingClientRect() }));
console.log("after fill click:", after);

await panel.locator("[data-fill]").click();
await page.waitForTimeout(300);
const restored = await panel.evaluate(el => ({ cls: el.className, rect: el.getBoundingClientRect() }));
console.log("after restore click:", restored);

await page.screenshot({ path: path.join(__dirname, "..", "panel-buttons-test.png") });
await browser.close();
server.close();
