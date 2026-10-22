// GET  -> which channel this TikTok account is for + its auto-post settings
// POST {channel, autopost: {enabled, privacy_level, allow_comment, allow_duet, allow_stitch}}
//      -> saves them to Content-Vault tiktok/accounts.json + tiktok/autopost.json (the daily GitHub Action reads these)
import { handler, body, readSession, checkAllowed, accessToken, tt, readFile, writeFile, httpError } from "../lib/core.js";
const load = async (p, d) => { const f = await readFile(p); return f ? JSON.parse(f.text) : d; };
export default handler(async (req) => {
  const openId = readSession(req); checkAllowed(openId);
  const channels = JSON.parse((await readFile("channels.json")).text);
  const chList = Object.keys(channels).filter((k) => !k.startsWith("_")).map((k) => ({ key: k, label: channels[k].label || k }));
  const accounts = await load("tiktok/accounts.json", []);
  const auto = await load("tiktok/autopost.json", {});
  const me = accounts.find((a) => a.open_id === openId) || {};
  if (req.method === "GET") return { channels: chList, channel: me.channel || null, autopost: me.channel ? auto[me.channel] || null : null };
  if (req.method !== "POST") throw httpError(405, "Use GET or POST.");
  const b = await body(req);
  const ch = String(b.channel || "");
  if (!chList.some((c) => c.key === ch)) throw httpError(400, "Pick which channel this TikTok account is for.");
  const ap = b.autopost || {};
  if (ap.enabled) {
    const creator = await tt("/post/publish/creator_info/query/", await accessToken(openId));
    if (!(creator.privacy_level_options || []).includes(ap.privacy_level)) throw httpError(400, "Choose who can view auto-posted videos.");
  }
  // one account per channel
  for (const a of accounts) if (a.open_id !== openId && a.channel === ch) delete a.channel;
  const i = accounts.findIndex((a) => a.open_id === openId);
  if (i < 0) throw httpError(400, "Connect this TikTok account again first.");
  accounts[i].channel = ch;
  await writeFile("tiktok/accounts.json", JSON.stringify(accounts, null, 1) + "\n", `Content Studio: ${accounts[i].display_name || "account"} is the ${ch} TikTok`);
  auto[ch] = { open_id: openId, enabled: !!ap.enabled, privacy_level: ap.enabled ? ap.privacy_level : null,
    allow_comment: !!ap.allow_comment, allow_duet: !!ap.allow_duet, allow_stitch: !!ap.allow_stitch,
    updated_at: new Date().toISOString() };
  await writeFile("tiktok/autopost.json", JSON.stringify(auto, null, 1) + "\n", `Content Studio: ${ch} auto-post ${ap.enabled ? "on" : "off"}`);
  return { channel: ch, autopost: auto[ch] };
});
