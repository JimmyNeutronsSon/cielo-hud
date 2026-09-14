# Comprehensive Guide: Building and Bundling the Liquid Glass HUD Bookmarklet with Webpack

This guide details how advanced client-side bookmarklets (inspired by projects like `car-axle-client`) are architected, bundled using **Webpack**, and turned into a single-file executable bookmarklet string.

---

## 1. Understanding Webpack Architecture for Bookmarklets

In standard web applications, Webpack outputs separate `.js`, `.css`, and asset files loaded via HTML tags. However, for a **bookmarklet**, external asset files fail due to cross-origin restrictions (CORS) and strict Content Security Policies (CSP) enforced by target websites.

Webpack solves this by bundling everything into a **self-executing IIFE (Immediately Invoked Function Expression)**:
- **`style-loader` & `css-loader`**: Instead of linking separate stylesheets, Webpack injects styles directly into a dynamic `<style>` tag created at runtime in the host page's `document.head`.
- **Asset Inline-Loading (`asset/inline`)**: Images, fonts, and SVGs are converted to Base64 data URIs so they live entirely inside the compiled JavaScript payload.
- **Output Configuration**: Webpack wraps the output bundle so it can be prepended with `javascript:` and dropped straight into a browser bookmarks bar.

---

## 2. Project Directory Structure

```text
liquid-glass-hud/
├── package.json
├── webpack.config.js
└── src/
    ├── index.js         # Main entry point & HUD toggle logic
    ├── styles.css       # Glass styling, chrome-purple glow animations, and Jim Nightshade font integration
    └── components/
        ├── dock.js      # Bottom navigation dock
        ├── browser.js   # Scramjet proxy frame widget with DuckDuckGo fallback
        └── lab.js       # Liquid glass parameter lab (Edge, Rim, Base, Blur, etc.)
```

---

## 3. Configuration Files

### `package.json`
```json
{
  "name": "liquid-glass-hud",
  "version": "1.0.0",
  "description": "Standalone Webpack-bundled Liquid Glass HUD Bookmarklet",
  "main": "src/index.js",
  "scripts": {
    "build": "webpack",
    "pack": "node pack.js"
  },
  "devDependencies": {
    "css-loader": "^6.8.1",
    "style-loader": "^3.3.3",
    "webpack": "^5.88.2",
    "webpack-cli": "^5.1.4"
  }
}
```

### `webpack.config.js`
```javascript
const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    iife: true,
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/inline',
      },
    ],
  },
};
```

---

## 4. Core Source Files

### `src/styles.css`
```css
@import url('https://fonts.googleapis.com/css2?family=Jim+Nightshade&display=swap');

:root {
  --hud-font: 'Jim Nightshade', cursive, sans-serif;
  --hud-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

#lg-hud-root-v1 * { box-sizing: border-box; }
#lg-hud-root-v1 {
  position: fixed; inset: 0; z-index: 2147483000;
  pointer-events: none;
  font-family: var(--hud-sans);
  color: #e9f1ff;
}

@keyframes lg-chrome-glow {
  0% {
    box-shadow:
      0 14px 46px rgba(0,0,0,.6),
      0 0 0 1px rgba(255,255,255,.05) inset,
      0 1px 0 rgba(255,255,255,.2) inset,
      -12px 12px 35px rgba(50, 120, 255, 0.4),
      12px -12px 45px rgba(139, 92, 246, 0.35);
  }
  50% {
    box-shadow:
      0 14px 46px rgba(0,0,0,.6),
      0 0 0 1px rgba(255,255,255,.05) inset,
      0 1px 0 rgba(255,255,255,.2) inset,
      12px -12px 45px rgba(50, 120, 255, 0.55),
      -12px 12px 55px rgba(139, 92, 246, 0.5);
  }
  100% {
    box-shadow:
      0 14px 46px rgba(0,0,0,.6),
      0 0 0 1px rgba(255,255,255,.05) inset,
      0 1px 0 rgba(255,255,255,.2) inset,
      -12px 12px 35px rgba(50, 120, 255, 0.4),
      12px -12px 45px rgba(139, 92, 246, 0.35);
  }
}

#lg-hud-root-v1 .lg-dock,
#lg-hud-root-v1 .lg-panel {
  animation: lg-chrome-glow 4s ease-in-out infinite;
}
```

### `src/components/browser.js` (Scramjet & DuckDuckGo Integration)
```javascript
export function buildBrowser(root, vw, vh, panelFactory) {
  const bodyContent = `
    <div style="display:flex; gap:6px; margin-bottom:8px;">
      <input type="text" id="lg-url-input" placeholder="Enter URL or search term..." 
             style="flex:1; padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.2); background:rgba(0,0,0,.3); color:#fff; font-size:12px;">
      <button id="lg-url-go" style="padding:0 12px; border-radius:8px; border:none; background:#3b82f6; color:#fff; font-weight:bold; cursor:pointer;">Go</button>
    </div>
    <iframe id="lg-proxy-frame" src="https://html.duckduckgo.com/html/" 
            style="width:100%; height:320px; border-radius:8px; border:1px solid rgba(255,255,255,.1); background:#fff;"></iframe>
  `;

  const p = panelFactory({
    key: "browser",
    x: vw / 2 - 150,
    y: vh / 2 - 200,
    width: 320,
    title: "Scramjet Proxy Browser",
    body: bodyContent
  });

  const input = p.querySelector("#lg-url-input");
  const btn = p.querySelector("#lg-url-go");
  const frame = p.querySelector("#lg-proxy-frame");

  function navigate() {
    let query = input.value.trim();
    if (!query) return;

    // Check if input is a valid URL or a plain text search query
    const urlPattern = /^(https?:\/\/)?([\w\-]+(\.[\w\-]+)+)([\/#?].*)?$/i;
    if (urlPattern.test(query)) {
      if (!query.startsWith('http://') && !query.startsWith('https://')) {
        query = 'https://' + query;
      }
      // Route through Scramjet or proxy endpoint if configured, or direct if permitted
      frame.src = query;
    } else {
      // Automatically fallback to DuckDuckGo search query within proxy
      frame.src = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    }
  }

  btn.addEventListener("click", navigate);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") navigate();
  });

  return p;
}
```

---

## 5. Automated Bookmarklet Packer (`pack.js`)

To package the Webpack output into a production-ready bookmarklet string, create a helper script `pack.js` in your root directory:

```javascript
const fs = require('fs');
const path = require('path');

const bundlePath = path.resolve(__dirname, 'dist/bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.log("Please run 'npm run build' first!");
  process.exit(1);
}

const code = fs.readFileSync(bundlePath, 'utf8');
const bookmarkletString = `javascript:(function(){${code}})();`;

fs.writeFileSync(path.resolve(__dirname, 'dist/bookmarklet.txt'), bookmarkletString);
console.log("SUCCESS: Bookmarklet generated at dist/bookmarklet.txt");
```

---

## 6. How to Install and Use

1. Run the build pipeline in your terminal:
   ```bash
   npm install
   npm run build
   npm run pack
   ```
2. Open the generated `dist/bookmarklet.txt` file and copy the entire string (starting with `javascript:(function(){...}`).
3. Open your browser's bookmarks bar (`Ctrl + Shift + B` or `Cmd + Shift + B`).
4. Create a new bookmark, name it **"Liquid Glass HUD"**, and paste the code into the URL field.
5. Click the bookmark on any webpage to trigger your Webpack-bundled HUD client!
