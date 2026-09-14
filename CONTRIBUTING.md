# Contributing to Liquid Glass HUD

Thanks for taking the time to contribute! 🎉 Your help makes this project better.

## Getting started

1. **Fork** the repository and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/liquid-glass-hud.git
   cd liquid-glass-hud
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create a branch** for your work:

   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development workflow

- `npm run build` — compiles `src/` into `dist/bundle.js` (Webpack production build).
- `npm run pack` — generates `dist/bookmarklet.txt` and syncs `index.html`.
- `npm run deploy` — uploads the bundle to Supabase Storage (needs `.env.local`).

Run the full pipeline before submitting to make sure nothing is broken:

```bash
npm run build && npm run pack
```

## Code style

- **Plain ES modules** — the bundle has zero runtime dependencies and no framework.
- **Double quotes** for strings and a trailing `;` — the terser config is set up so output uses double quotes to survive `javascript:` URL encoding.
- Keep components self-contained in `src/components/` and register them in `src/index.js`.
- Reuse the `createPanel()` factory for any new panel widget.

## Commit conventions

Use clear, imperative commit messages:

```text
feat: add a new weather widget to the dock
fix: stop voice call leaking the mic when the HUD closes
docs: clarify the deploy flow in the README
refactor: extract avatar color helper
```

## Opening a pull request

1. Push your branch to your fork.
2. Open a pull request against `main` with a clear title and description.
3. Reference any related issue (e.g. `Closes #12`).
4. Make sure CI (build + pack + verify) passes.

## Reporting issues

Found a bug? Open an issue and include:

- What you did and what happened.
- The page/site where it occurred (if relevant).
- Browser and OS versions.

**Please do not share secrets** (e.g. Supabase service-role keys) in issues or PRs.
