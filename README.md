# Site Template

This folder contains a zero-dependency static site you can deploy alongside `runs/index.json`. Usage:

1. Copy the entire `site-template/` directory to your log repository (e.g. `multi-llm-query-logs`).
2. Copy `runs/index.json` (and actual JSON/CSV artifacts referenced in the index) into the same repo, keeping the `runs/` folder structure.
3. Host the repo via GitHub Pages / Cloudflare Pages. The `index.html` file fetches `runs/index.json` via relative path and renders the latest entries.

Controls:
- The dropdowns filter by schedule/model/scenario.
- `刷新` forces a re-fetch (with cache-busting query param).
- Links in each card point directly to the JSON/CSV artifacts.

To adjust styles or behavior, edit `styles.css` or `app.js`. Keep everything static so it can run on any CDN without server logic.
