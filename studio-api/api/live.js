// GET -> live YouTube numbers for every Content Studio channel (public stats via the YouTube Data API key),
//        compared with last night's snapshot (Content-Vault analytics/history.json).
// Needs the Vercel setting YT_API_KEY (a Google API key with YouTube Data API v3 enabled). ~2 quota units per call.
import { handler, readSession, checkAllowed, readFile, httpError } from "../lib/core.js";

const YT = "https://www.googleapis.com/youtube/v3";
let cache = { at: 0, data: null };

async function yt(path, params) {
  const key = process.env.YT_API_KEY;
  if (!key) throw httpError(500, "Live stats need the YT_API_KEY setting in Vercel.");
  const r = await fetch(`${YT}/${path}?${new URLSearchParams({ ...params, key })}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw httpError(502, "YouTube: " + ((j.error && j.error.message) || r.status));
  return j.items || [];
}
const load = async (p, d) => { const f = await readFile(p); return f ? JSON.parse(f.text) : d; };

export default handler(async (req) => {
  checkAllowed(readSession(req));
  if (cache.data && Date.now() - cache.at < 60_000) return { ...cache.data, cached: true };

  const channels = await load("channels.json", {});
  const keys = Object.keys(channels).filter((k) => !k.startsWith("_"));
  const [hist, ...analytics] = await Promise.all([load("analytics/history.json", []), ...keys.map((k) => load(`analytics/${k}.json`, null))]);

  // channel ids: saved by yt_stats.py, or worked out from one of the channel's videos
  const chanId = {}, recentIds = [];
  const needLookup = {};
  keys.forEach((k, i) => {
    const a = analytics[i]; if (!a) return;
    if (a.channel_id) chanId[k] = a.channel_id;
    const vids = [...(a.videos || [])].sort((x, y) => (y.published || "").localeCompare(x.published || ""));
    if (!chanId[k] && vids[0]) needLookup[vids[0].id] = k;
    vids.slice(0, k === "main" ? 4 : 6).forEach((v) => recentIds.push({ k, id: v.id, before: v.views || 0 }));
  });
  const vidList = recentIds.slice(0, 50).map((v) => v.id);
  const lookups = Object.keys(needLookup).filter((id) => !vidList.includes(id));
  const vItems = await yt("videos", { part: "snippet,statistics", id: [...vidList, ...lookups].slice(0, 50).join(","), maxResults: 50 });
  for (const v of vItems) if (needLookup[v.id] && !chanId[needLookup[v.id]]) chanId[needLookup[v.id]] = v.snippet.channelId;

  const ids = Object.values(chanId);
  const cItems = ids.length ? await yt("channels", { part: "statistics", id: ids.join(","), maxResults: 50 }) : [];
  const byId = Object.fromEntries(cItems.map((c) => [c.id, c.statistics]));

  const last = {};
  for (const h of hist) last[h.channel] = h;   // history is sorted by date, so this keeps the newest row
  const out = keys.map((k) => {
    const s = byId[chanId[k]];
    if (!s) return { key: k, label: channels[k].label || k, connected: false };
    const subs = Number(s.subscriberCount || 0), views = Number(s.viewCount || 0), videos = Number(s.videoCount || 0);
    const b = last[k];
    return { key: k, label: channels[k].label || k, connected: true, stats_only: !!channels[k].stats_only, subscribers: subs, views, videos,
             since: b ? b.date : null, subs_change: b ? subs - b.subscribers : null, views_change: b ? views - b.views : null };
  });
  const vMap = Object.fromEntries(vItems.map((v) => [v.id, v]));
  const recent = recentIds.filter((r) => vMap[r.id]).map((r) => {
    const v = vMap[r.id], views = Number(v.statistics.viewCount || 0);
    return { channel: channels[r.k].label || r.k, id: r.id, title: v.snippet.title.replace(/ #shorts/i, ""), published: v.snippet.publishedAt,
             views, likes: Number(v.statistics.likeCount || 0), change: views - r.before };
  }).sort((a, b) => b.published.localeCompare(a.published)).slice(0, 15);

  const data = { at: new Date().toISOString(), channels: out, recent };
  cache = { at: Date.now(), data };
  return data;
});
