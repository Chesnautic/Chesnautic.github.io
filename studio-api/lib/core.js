// Content Studio API: shared helpers (TikTok, GitHub storage, sessions, crypto).
// Secrets come only from Vercel environment variables, never from this file:
//   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET  - from the TikTok developer app (sandbox or production)
//   GITHUB_TOKEN    - GitHub token with read/write access to Chesnautic/Content-Vault
//   (the token-encryption key and the session-signing key are derived from TIKTOK_CLIENT_SECRET, so the daily
//    GitHub Action can read the stored tokens with just TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET as Actions secrets)
//   ALLOWED_OPEN_IDS (optional) - comma list; if set, only these TikTok accounts can use the studio
import crypto from "node:crypto";

export const SITE = "https://chesnautic.github.io";
export const REDIRECT_URI = `${SITE}/studio/callback.html`;
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
    res.setHeader("Access-Control-Allow-Origin", SITE);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
const b64u = (b) => Buffer.from(b).toString("base64url");
export function makeSession(openId) {
  const p = b64u(JSON.stringify({ o: openId, e: Date.now() + 7 * 864e5 }));
  return `${p}.${b64u(crypto.createHmac("sha256", derive("content-studio-session")).update(p).digest())}`;
}
export function readSession(req) {
  const raw = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || (req.query && req.query.s) || "";
  const [p, sig] = raw.split(".");
  if (!p || !sig) throw httpError(401, "Please connect your TikTok account first.");
  const good = b64u(crypto.createHmac("sha256", derive("content-studio-session")).update(p).digest());
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) throw httpError(401, "Your session isn't valid. Connect TikTok again.");
  const { o, e } = JSON.parse(Buffer.from(p, "base64url").toString());
  if (Date.now() > e) throw httpError(401, "Your session expired. Connect TikTok again.");
  return o;
}
export function checkAllowed(openId) {
  const list = (process.env.ALLOWED_OPEN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length && !list.includes(openId)) throw httpError(403, "This TikTok account isn't set up for Content Studio.");
}

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
export async function exchangeCode(code) {
  return ttForm("/oauth/token/", { client_key: env("TIKTOK_CLIENT_KEY"), client_secret: env("TIKTOK_CLIENT_SECRET"), code, grant_type: "authorization_code", redirect_uri: REDIRECT_URI });
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
export async function saveTokens(tok) {
  const rec = { open_id: tok.open_id, access_token: tok.access_token, refresh_token: tok.refresh_token, scope: tok.scope,
    expires_at: Date.now() + (tok.expires_in - 120) * 1000, refresh_expires_at: Date.now() + tok.refresh_expires_in * 1000 };
  await writeFile(tokenPath(tok.open_id), encrypt(rec), "Content Studio: save TikTok login");
  return rec;
}
export async function accessToken(openId) {
  const f = await readFile(tokenPath(openId));
  if (!f) throw httpError(401, "This TikTok account isn't connected. Connect it again.");
  let rec = decrypt(f.text.trim());
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
