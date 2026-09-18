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

await new Promise((resolve) => server.listen(5510, resolve));
console.log("Local server on http://localhost:5510");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
cdp.on("Network.requestWillBeSentExtraInfo", (e) => {});
cdp.on("Network.responseReceivedExtraInfo", (e) => {
  console.log("[CDP responseExtraInfo]", JSON.stringify(e.headers));
  if (e.blockedReason) console.log("[CDP blockedReason]", e.blockedReason);
});
cdp.on("Network.loadingFailed", (e) => {
  console.log("[CDP loadingFailed]", e.errorText, e.blockedReason || "", e.corsErrorStatus || "");
});

page.on("console", (msg) => console.log(`[console:${msg.type()}]`, msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("requestfailed", (req) => console.log("[requestfailed]", req.url(), req.failure()?.errorText));
page.on("response", async (res) => {
  if (res.url().includes("/~/sj/")) {
    console.log("[response]", res.status(), res.url());
    console.log("[response headers]", JSON.stringify(res.headers(), null, 2));
  }
});

await page.goto("http://localhost:5510/");

// Preload localStorage settings for the browser widget before the HUD script runs its logic
await page.evaluate(() => {
  localStorage.setItem("lg_browser_engine", "proxy");
  localStorage.setItem("lg_custom_gateway", "https://api.ritebooks.com");
});

// Trigger the "preview" button which injects bundle.js into this page
await page.click("#preview-btn");
await page.waitForTimeout(1500);

// Open the browser widget from the dock
await page.click('[data-key="browser"]');
await page.waitForTimeout(1000);

// Confirm engine select reflects proxy mode
const engineVal = await page.$eval('[data-engine-select]', (el) => el.value).catch(() => null);
console.log("engine select value:", engineVal);

// Trigger navigation from the HUD's own home search box
await page.fill("[data-home-search]", "wikipedia.org");
await page.click("[data-home-search-btn]");
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(__dirname, "..", "scramjet-test-early.png"), fullPage: false });
await page.waitForTimeout(9000);

const iframeSrc = await page.$eval("[data-proxy-frame]", (el) => el.src).catch(() => null);
console.log("iframe src:", iframeSrc);

const frame = page.frames().find((f) => f.url().includes("ritebooks"));
if (frame) {
  console.log("Found gateway frame (should include ?goto=):", frame.url());
} else {
  console.log("No gateway frame found. Frames present:", page.frames().map(f => f.url()));
}
await page.screenshot({ path: path.join(__dirname, "..", "scramjet-test-after-nav.png"), fullPage: false });

await page.screenshot({ path: path.join(__dirname, "..", "scramjet-test-screenshot.png"), fullPage: false });
console.log("Screenshot saved to scramjet-test-screenshot.png");

await browser.close();
server.close();
