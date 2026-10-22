# E The Experience

Personal site for E The Experience. Plain HTML, hosted free on GitHub Pages.

- `index.html` – home (name, line, links)
- `privacy.html`, `terms.html` – privacy policy and terms (used by the Rank Rex Uploader YouTube app and the Content Studio TikTok app)

Brand pink: `#FF1F5A`. Add pages as plain `.html` files next to these.

## Content Studio (TikTok)
- `studio/` – Content Studio page (connect TikTok, pick a queued video, post or send to drafts). `studio/config.js` has the public client key and the API address.
- `studio-api/` – the small backend, deployed on Vercel (project root = `studio-api`). Needs Vercel env vars `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `GITHUB_TOKEN` (read/write on Chesnautic/Content-Vault). TikTok logins are stored encrypted in Content-Vault `tiktok/`.
