# ⬡ Cielo

**Cielo** (see-ELL-oh — *"sky"* in Spanish & Italian) is a floating, frosted-glass **heads-up display** that drops onto any website as a drag-and-drop bookmarklet. Built with Webpack and shipped as a single self-contained script — featuring a built-in proxy browser, live chat & voice, performance monitors, screen-capture tools, and a real-time liquid-refraction lab.

> **No installs. No extensions. Just drag, click, done.**

![version](https://img.shields.io/badge/version-1.0.0-5ee7ff?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-3ddc84?style=flat-square)
![build](https://img.shields.io/badge/build-passing-brightgreen?style=flat-square)
![platform](https://img.shields.io/badge/platform-any%20browser-8b7cf6?style=flat-square)

---

## ✨ Features

| Widget | What it does |
| --- | --- |
| 🧭 **Liquid Scramjet Browser** | A full in-page browser with two modes: **Direct Embed** or **Scramjet Proxy** (point it at your own [Scramjet](https://github.com/MercuryWorkshop/scramjet) server) — with back/forward/reload, quick bookmarks, home search, and a settings drawer. |
| 💬 **Cielo Live Chat & Voice** | Supabase-backed text channels, presence, and voice chat with mute, camera, and screen-share. |
| 📊 **Performance Monitor** | Live CPU, GPU, VRAM, RAM, and FPS gauges. |
| 📸 **Capture** | Screenshot, record, and mic controls. |
| 🧪 **Glass Lab** | Tune the glass in real time — edge & rim intensity, blur, tint, ripple, center-warp, and a one-click **randomize** button. |
| 🎚️ **Audio** | Output/input device selection and levels. |
| 👥 **Friends** | Online status and colored avatars. |
| ⭐ **Highlights** | Achievements, streaks, and badges. |
| 🧩 **Test Widget** | A blank, resizable canvas for testing panel behavior. |

**And more:** every panel is draggable, all widgets toggle from the bottom dock, and the entire HUD hides with a single click.

---

## 🚀 Install

The quickest way: open `index.html` (hosted anywhere) and drag the **⬡ Cielo LIVE** button onto your bookmarks bar.

1. **Show your bookmarks bar** — `Ctrl + Shift + B` (Windows/Linux) or `Cmd + Shift + B` (Mac).
2. **Drag, don't click** — drag the `⬡ Cielo` button from the page up onto the bar.
3. **Use it** — visit any site and click the bookmark. Click it again to hide the HUD.

### How the tiny loader works

Instead of embedding the whole bundle in the `javascript:` URL (which would force you to re-drag the bookmark every time the code changes), the bookmarklet is a tiny **loader**. It injects a `<script>` tag pointing at the latest `bundle.js` hosted on Supabase Storage, cache-busted with a timestamp:

```js
void function () {
  var d = document,
    s = d.createElement("script");
  s.src = "https://….supabase.co/storage/v1/object/public/bookmarklet/bundle.js" + "?v=" + Date.now();
  d.head.appendChild(s);
}();
```

Every click pulls the newest version automatically — **no re-install needed after an update**.

---

## 🛠️ Development

```bash
# 1. Install dependencies
npm install

# 2. Build the production bundle → dist/bundle.js
npm run build

# 3. Generate the loader bookmarklet → dist/bookmarklet.txt + sync index.html
npm run pack

# 4. Deploy the bundle to Supabase Storage (requires the env key)
npm run deploy

# 5. One-shot release pipeline (build + deploy)
npm run release
```

### Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Webpack production build → `dist/bundle.js` |
| `npm run pack` | Generates the tiny loader bookmarklet → `dist/bookmarklet.txt` and syncs `index.html` |
| `npm run site` | Generates `dist/index.html` — the install page optimized for static hosting (Render) |
| `npm run deploy` | Uploads `dist/bundle.js` to the Supabase Storage bucket |
| `npm run release` | `build` → `deploy` |

### Environment

`deploy.js` reads `SUPABASE_SERVICE_ROLE_KEY` from your environment or a local `.env.local` file:

```bash
# .env.local
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> ⚠️ **Never commit `.env.local`.** It holds a Supabase **service-role** key with admin rights. It's already excluded via `.gitignore` — copy [`.env.example`](.env.example) to `.env.local` to get started.

## 🌩️ Deploy the landing page (Render)

The `index.html` install/demo page is a plain static site and drops onto [Render](https://render.com) for free. The repo ships a [`render.yaml`](render.yaml) blueprint, so Render can configure itself from the repo:

1. Push the repo to GitHub, then in Render go to **New + → Static Site** and connect the `cielo-hud` repo.
2. Render auto-detects the blueprint. To set it up manually instead, use:
   - **Build Command:** `npm ci && npm run build && npm run pack && npm run site`
   - **Publish Directory:** `dist`

`npm run site` produces `dist/index.html` — an install-page copy whose preview button loads the bundle from the site root (`./bundle.js`) instead of `./dist/bundle.js`, so the preview works once the publish directory *is* `dist`. The drag-and-drop bookmarklet button is unaffected (it points at the hosted Supabase bundle).

---

## 🏗️ Architecture

A bookmarklet can't load external CSS or asset files — host pages enforce **CORS** and strict **Content-Security-Policies** that block them. So everything is bundled into one self-executing **IIFE**:

- **`style-loader` + `css-loader`** — inject the glass stylesheet into a runtime `<style>` tag inside the host page's `document.head`.
- **`asset/inline`** — images, icons, and fonts become Base64 data URIs baked directly into the compiled JS.
- **SVG filters** — `feTurbulence` + `feDisplacementMap` create the animated liquid-refraction and chrome-glow effect, driven by CSS variables that the Glass Lab tweaks live.
- **`terser-webpack-plugin`** — mangles and minifies with `ascii_only` and double quotes so the output survives being URL-encoded into a `javascript:` bookmarklet.

```
cielo-hud/
├── src/
│   ├── index.js              # Entry point & HUD toggle logic
│   ├── styles.css            # Glass styling & animations
│   └── components/
│       ├── dock.js           # Bottom navigation dock
│       ├── panel.js          # Draggable panel factory
│       ├── browser.js        # Scramjet proxy browser
│       ├── chat.js           # Live chat & voice (Supabase)
│       ├── lab.js            # Glass refraction lab
│       ├── perf.js           # Performance monitors
│       ├── capture.js        # Screenshot / record
│       ├── audio.js          # Audio controls
│       ├── social.js         # Friends list
│       ├── highlights.js     # Achievements & streaks
│       ├── testWidget.js     # Blank resizable widget
│       ├── icons.js          # Inline SVG icon set
│       └── storage.js        # Safe localStorage wrapper
├── index.html                # Install / demo landing page
├── webpack.config.js         # Webpack build config
├── pack.js                   # Loader bookmarklet generator
├── deploy.js                 # Supabase Storage uploader
├── site.js                   # Static-site build (dist/index.html for Render)
├── check_sq.js               # Apostrophe-safety checker for the bookmarklet
├── render.yaml               # Render static-site blueprint
├── .github/workflows/ci.yml  # CI build + pack + site + verify
└── package.json
```

---

## 🔐 Security

- The Supabase **service-role** key lives only in `.env.local` (git-ignored) and is used by `deploy.js` at build time — it is **never** bundled into client code.
- The chat widget ships with Supabase's **anon** (public) key, which is safe to include in a client-side bundle.
- `deploy.js` aborts immediately if the key is missing.

---

## 🛠️ Tech Stack

- [Webpack 5](https://webpack.js.org/) — bundling & minification
- [terser-webpack-plugin](https://github.com/webpack-contrib/terser-webpack-plugin)
- [Supabase](https://supabase.com/) — Storage (hosting the bundle) + live chat backend
- Vanilla JavaScript (ES modules) — no framework, **zero runtime dependencies**

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first, then open an issue or a pull request.

## 📄 License

[MIT](LICENSE) © 2026 [JimmyNeutronsSon](https://github.com/JimmyNeutronsSon)
