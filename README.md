# Site Template

This folder contains a zero-dependency static site you can deploy alongside `runs/index.json`. Usage:

1. Copy the entire `site-template/` directory to your log repository (e.g. `multi-llm-query-logs`).
2. Copy `runs/index.json` (and actual JSON/CSV artifacts referenced in the index) into the same repo, keeping the `runs/` folder structure.
3. Host the repo via GitHub Pages / Cloudflare Pages. The `index.html` file fetches `runs/index.json` via relative path and renders the latest entries.

Controls:
- The dropdowns filter by schedule/model/scenario。
- “今日总结” 卡片会读取 `daily-resume` 最新一次运行的第 11 个问题，将大模型的纯文本总结与自动聚合的关键词统计放在醒目位置。
- “站点影响力” 基于 `runs/site-dictionary.json` 展示最常被提及的简历工具及其出现次数。
- `刷新` forces a re-fetch (with cache-busting query param).
- Links in each card point directly to the JSON/CSV artifacts.

To adjust styles or behavior, edit `styles.css` or `app.js`. Keep everything static so it can run on any CDN without server logic.
