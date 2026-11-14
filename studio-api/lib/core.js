// Content Studio API: shared helpers (TikTok, GitHub storage, sessions, crypto).
// Secrets come only from Vercel environment variables, never from this file:
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET  - from the TikTok developer app (sandbox or production)
//   GITHUB_TOKEN    - GitHub token with read/write access to Chesnautic/Content-Vault
//   (the token-encryption key and the session-signing key are derived from TIKTOK_CLIENT_SECRET, so the daily
//    GitHub Action can read the stored tokens with just TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET as Actions secrets)
//   OWNER_OPEN_IDS (optional) - comma list of the owner's TikTok accounts (Creek Bay Records). If unset, the accounts
//                    already listed in Content-Vault tiktok/accounts.json are the owner's.
//   BLOB_READ_WRITE_TOKEN - Vercel Blob store for creators' uploads (deleted right after they post)
//
// Two kinds of users (Nov 14, 2026, E: "We can make it so other people are able to use the content studio, but they
// wouldn't give them access to our channels obviously"):
//   owner   - E's own TikTok accounts: the Content-Vault queue, history, auto-post settings, live stats.
//   creator - anyone else: uploads their own video and posts it to their own TikTok. Nothing about them is stored
//             in Content-Vault; their TikTok login lives only inside their own encrypted session.
import crypto from "node:crypto";

export const SITE = "https://contentstudioapp.vercel.app";
export const REDIRECT_URI = `${SITE}/studio/callback`;
// the old GitHub Pages studio keeps working until the TikTok app settings point at the new site
const OLD_SITE = "https://chesnautic.github.io", REDIRECTS = [REDIRECT_URI, `${OLD_SITE}/studio/callback.html`];
export const REPO = "Chesnautic/Content-Vault";
const TT = "https://open.tiktokapis.com/v2";
const env = (k) => {
  const v = process.env[k];
  if (!v) throw httpError(500, `Server is missing the ${k} setting.`);
  return v;
};

const derive = (label) => crypto.createHmac("sha256", env("TIKTOK_CLIENT_SECRET")).update(label).digest();

export function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

// ---------- request plumbing ----------
export function handler(fn) {
  return async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin === OLD_SITE ? OLD_SITE : SITE);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Expose-Headers", "X-Session");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") return res.status(204).end();
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.status(200).json(out);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) res.status(status).json({ error: e.message || "Something went wrong." });
    }
  };
}
export async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = []; for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}

// ---------- sessions (HMAC-signed, 7 days) ----------
// payload: {o: open_id, e: expiry, r: "owner"|"creator", t?: encrypted TikTok token record (creators only)}
const b64u = (b) => Buffer.from(b).toString("base64url");
export function makeSession(openId, role = "owner", tokRec = null) {
  const pl = { o: openId, e: Date.now() + 7 * 864e5, r: role };
  if (tokRec) pl.t = encrypt(tokRec);
  const p = b64u(JSON.stringify(pl));
  return `${p}.${b64u(crypto.createHmac("sha256", derive("content-studio-session")).update(p).digest())}`;
}
export function readAuth(req) {
  const raw = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || (req.query && req.query.s) || "";
  const [p, sig] = raw.split(".");
  if (!p || !sig) throw httpError(401, "Please connect your TikTok account first.");
  const good = b64u(crypto.createHmac("sha256", derive("content-studio-session")).update(p).digest());
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) throw httpError(401, "Your session isn't valid. Connect TikTok again.");
  const { o, e, r, t } = JSON.parse(Buffer.from(p, "base64url").toString());
  if (Date.now() > e) throw httpError(401, "Your session expired. Connect TikTok again.");
  return { openId: o, owner: (r || "owner") === "owner", tok: t || null };
}
export function readSession(req) { return readAuth(req).openId; }
// owner-only endpoints (the Content-Vault queue, channels, stats, auto-post)
export async function requireOwner(req) {
  const a = readAuth(req);
  if (!a.owner || !(await isOwner(a.openId))) throw httpError(403, "This part of Content Studio is only for its owner.");
  return a.openId;
}
let ownerCache = null;
export async function isOwner(openId) {
  const list = (process.env.OWNER_OPEN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) return list.includes(openId);
  if (!ownerCache) { const f = await readFile("tiktok/accounts.json"); ownerCache = (f ? JSON.parse(f.text) : []).map((a) => a.open_id); }
  return ownerCache.includes(openId);
}
export function checkAllowed() { /* everyone may sign in; owner-only parts use requireOwner */ }
// a short folder name for a creator's uploads (never the raw open_id)
export const userKey = (openId) => crypto.createHash("sha256").update("cs-user:" + openId).digest("hex").slice(0, 20);

// ---------- encryption (AES-256-GCM) ----------
const key = () => derive("content-studio-token-key");
export function encrypt(obj) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
export function decrypt(s) {
  const b = Buffer.from(s, "base64"); const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
}

// ---------- GitHub (Content-Vault is the store) ----------
export async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts, redirect: opts.redirect || "follow",
    headers: { Authorization: `Bearer ${env("GITHUB_TOKEN")}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
  });
  return r;
}
export async function ghJson(path, opts) {
  const r = await gh(path, opts);
  if (!r.ok) throw httpError(r.status === 404 ? 404 : 502, `GitHub ${r.status} on ${path}`);
  return r.json();
}
export async function readFile(path) {
  const r = await gh(`/contents/${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw httpError(502, `GitHub ${r.status} reading ${path}`);
  const j = await r.json(); return { text: Buffer.from(j.content, "base64").toString(), sha: j.sha };
}
export async function writeFile(path, text, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await readFile(path);
    const r = await gh(`/contents/${path}`, { method: "PUT", body: JSON.stringify({ message, content: Buffer.from(text).toString("base64"), sha: cur?.sha }) });
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) throw httpError(502, `GitHub ${r.status} writing ${path}`);
  }
  throw httpError(502, `Couldn't save ${path} to GitHub.`);
}

// ---------- TikTok ----------
async function ttForm(path, params) {
  const r = await fetch(`${TT}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw httpError(400, `TikTok login failed: ${j.error_description || j.error || r.status}`);
  return j;
}
export async function exchangeCode(code, redirectUri) {
  const redirect_uri = REDIRECTS.includes(redirectUri) ? redirectUri : REDIRECT_URI;
  return ttForm("/oauth/token/", { client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), code, grant_type: "authorization_code", redirect_uri });
}
async function refresh(refreshToken) {
  return ttForm("/oauth/token/", { client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), grant_type: "refresh_token", refresh_token: refreshToken });
}
export async function tt(path, token, { method = "POST", json, query = "" } = {}) {
  const r = await fetch(`${TT}${path}${query}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: json ? JSON.stringify(json) : undefined });
  const j = await r.json().catch(() => ({}));
  const err = j.error && j.error.code && j.error.code !== "ok" ? j.error : null;
  if (!r.ok || err) {
    const code = err?.code || "";
    const FRIENDLY = {
      unaudited_client_can_only_post_to_private_accounts: "TikTok only lets apps that haven't passed review post to PRIVATE accounts. In the TikTok app: Profile > Settings and privacy > Privacy > turn on Private account, then try again (you can switch it back after the test).",
      spam_risk_too_many_posts: "TikTok says this account has posted too many times today. Try again tomorrow.",
      spam_risk_user_banned_from_posting: "TikTok isn't letting this account post right now.",
      reached_active_user_cap: "This app has reached TikTok's daily limit of posting accounts. Try again tomorrow.",
      access_token_invalid: "The TikTok login expired. Disconnect and connect TikTok again.",
      scope_not_authorized: "This TikTok account didn't approve posting. Disconnect and connect TikTok again, and approve every permission.",
    };
    throw httpError(r.status >= 500 ? 502 : 400, FRIENDLY[code] || `TikTok: ${err?.message || code || r.status}${code ? ` (${code})` : ""}`);
  }
  return j.data || {};
}

// stored token record: tiktok/tokens/<open_id>.enc in Content-Vault
const tokenPath = (openId) => `tiktok/tokens/${openId.replace(/[^A-Za-z0-9_-]/g, "_")}.enc`;
export function tokenRecord(tok) {
  return { open_id: tok.open_id, access_token: tok.access_token, refresh_token: tok.refresh_token, scope: tok.scope,
    expires_at: Date.now() + (tok.expires_in - 120) * 1000, refresh_expires_at: Date.now() + tok.refresh_expires_in * 1000 };
}
export async function saveTokens(tok) {
  const rec = tokenRecord(tok);
  await writeFile(tokenPath(tok.open_id), encrypt(rec), "Content Studio: save TikTok login");
  return rec;
}
export async function accessToken(openId, req, res) {
  const a = req ? readAuth(req) : { owner: true };
  if (!a.owner) {
    let rec;
    try { rec = decrypt(a.tok); } catch { throw httpError(401, "Your session isn't valid. Connect TikTok again."); }
    if (Date.now() > rec.expires_at) {
      rec = tokenRecord({ ...(await refresh(rec.refresh_token)), open_id: openId });
      if (res) res.setHeader("X-Session", makeSession(openId, "creator", rec));
    }
    return rec.access_token;
  }
  const f = await readFile(tokenPath(openId));
  if (!f) throw httpError(401, "This TikTok account isn't connected. Connect it again.");
  let rec;
  try { rec = decrypt(f.text.trim()); }
  catch { throw httpError(401, "This TikTok login was saved with a different app key. Disconnect and connect TikTok again."); }
  if (Date.now() > rec.expires_at) rec = await saveTokens({ ...(await refresh(rec.refresh_token)), open_id: openId });
  return rec.access_token;
}
export async function userInfo(token) {
  const d = await tt("/user/info/", token, { method: "GET", query: "?fields=open_id,avatar_url,display_name" });
  return d.user || {};
}

// queue release asset id by file name
export async function queueAssetId(name) {
  const rel = await ghJson("/releases/tags/queue");
  const a = (rel.assets || []).find((x) => x.name === name);
  if (!a) throw httpError(404, `Video ${name} isn't in the queue release.`);
  return a;
}
// short-lived signed download URL for a private release asset
export async function assetUrl(id) {
  const r = await gh(`/releases/assets/${id}`, { headers: { Accept: "application/octet-stream" }, redirect: "manual" });
  const loc = r.headers.get("location");
  if (!loc) throw httpError(502, `GitHub didn't return a download link (${r.status}).`);
  return loc;
}
