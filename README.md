# E The Experience

Personal site for E The Experience. Plain HTML, hosted free on GitHub Pages.

- `index.html` – home (name, line, links)
- `privacy.html`, `terms.html` – privacy policy and terms (used by the Rank Rex Uploader YouTube app and the Content Studio TikTok app)

Brand pink: `#FF1F5A`. Add pages as plain `.html` files next to these.

## Content Studio (TikTok)
- `studio/` – Content Studio page (connect TikTok, pick a queued video, post or send to drafts). `studio/config.js` has the public client key and the API address.
- `studio-api/` – the small backend, deployed on Vercel (project root = `studio-api`). Needs Vercel env vars `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `GITHUB_TOKEN` (read/write on Chesnautic/Content-Vault). TikTok logins are stored encrypted in Content-Vault `tiktok/`.

## Content Studio App (Nov 14, 2026)
The TikTok app is now a public tool at **https://contentstudioapp.vercel.app** (the `studio-api/` folder is the whole site: home page, `/privacy-policy`, `/terms-of-service`, `/studio`, `/api/*`). Name, site title and domain all match "Content Studio App" (TikTok review, Nov 14).
- Anyone can connect TikTok and post their own uploaded video to their own account. Nothing about them is stored: their login lives only in their encrypted browser session, their upload is deleted right after posting (a daily cron deletes unposted uploads after 24 h).
- The owner's TikTok accounts (the ones in Content-Vault `tiktok/accounts.json`, or `OWNER_OPEN_IDS`) still get the vault queue, auto-post settings and live stats. Other users never see any of it.
- `studio/` here (GitHub Pages) is the old copy; it keeps working until the TikTok app's redirect URI points at the new site.
