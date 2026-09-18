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

await new Promise((resolve) => server.listen(5511, resolve));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("request", (req) => {
  if (req.url().includes("saavncdn")) console.log("[audio request]", req.url());
});

await page.goto("http://localhost:5511/");
await page.click("#preview-btn");
await page.waitForTimeout(1000);

await page.click('[data-key="music"]');
await page.waitForTimeout(500);

// Check panel title
const title = await page.locator(".lg-panel-title, [data-panel-title]").first().textContent().catch(() => null);
console.log("panel title area:", title);

await page.fill(".lg-music-search", "blinding lights");
await page.waitForTimeout(2500);

const rows = await page.$$eval(".lg-music-row .lg-music-row-name", els => els.map(e => e.textContent));
console.log("search results:", rows);

const heading = await page.$eval(".lg-music-heading", el => el.textContent).catch(() => null);
console.log("heading (source label):", heading);

if (rows.length) {
  await page.click(".lg-music-row");
  await page.waitForTimeout(3000);
  const nowName = await page.$eval("[data-now-name]", el => el.textContent).catch(() => null);
  const nowArtist = await page.$eval("[data-now-artist]", el => el.textContent).catch(() => null);
  console.log("now playing:", nowName, "-", nowArtist);

  const audioState = await page.evaluate(() => {
    const audios = document.querySelectorAll("audio");
    if (!audios.length) return null;
    const a = audios[0];
    return { src: a.src, paused: a.paused, currentTime: a.currentTime, readyState: a.readyState, error: a.error && a.error.message };
  });
  console.log("audio element state:", audioState);
}

await page.screenshot({ path: path.join(__dirname, "..", "music-test.png") });
await browser.close();
server.close();
