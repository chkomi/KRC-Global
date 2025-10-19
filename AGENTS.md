# Repository Guidelines

## Project Structure & Module Organization
- Root files: `index.html`, `script.js`, `styles.css`.
- Data: `data/shanghai-data.json` (image paths under `images/...`).
- Assets: `images/attractions|restaurants|hotels|airports/`.
- Test sandbox: `test/` mirrors the root (safe place to prototype and validate changes).

## Build, Test, and Development Commands
- Local server (no build step):
  - `cd KRC-Global && python3 -m http.server 8000`
  - Open `http://localhost:8000/index.html` or `http://localhost:8000/test/index.html`.
- GitHub Pages (if enabled): `https://chkomi.github.io/KRC-Global/` and `/test/` for the sandbox.
- Promote from test → main (after validation): copy changed files from `test/` to root as noted in `test/README.md`.

## Coding Style & Naming Conventions
- JavaScript: 4-space indent, semicolons, ES6+ where practical; use `camelCase` for variables/functions and descriptive names.
- CSS: 4-space indent; class/selectors in `kebab-case`.
- Files/images: lowercase `kebab-case` (e.g., `shanghai-museum.jpg`).
- Data schema: keep keys consistent with existing entries (type, name, coords, image). Image paths are relative to `images/`.

## Testing Guidelines
- Manual verification in a modern browser:
  - Map renders, clustering works, day filters toggle correctly, geolocation button responds.
  - No errors in DevTools Console; network requests for images/JSON succeed (200).
- Data changes: ensure valid JSON before commit; confirm new images exist at referenced paths.
- Use `test/` to try UI/UX changes; ensure parity before promoting to root.

## Commit & Pull Request Guidelines
- Commits: small, focused, imperative mood (e.g., "Add day filter animation"). Korean/English acceptable; be consistent and specific.
- PRs include: summary, screenshots (before/after), steps to verify locally, impacted files (root vs `test/`), and linked issues.
- Avoid bundling image optimizations with feature changes unless directly related.

## Assets & Performance Tips
- Compress images (prefer JPEG/WebP), target ≤200KB when possible; store under the correct category folder.
- Keep external CDN versions aligned with those in HTML; remove unused code and assets to reduce load time.

