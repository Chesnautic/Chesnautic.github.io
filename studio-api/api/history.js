// GET -> this account's recent Content Studio posts with their live TikTok status
import { handler, readSession, checkAllowed, accessToken, tt, readFile } from "../lib/core.js";
export default handler(async (req) => {
  const openId = readSession(req); checkAllowed(openId);
  const f = await readFile("tiktok/posts.json");
  const mine = (f ? JSON.parse(f.text) : []).filter((p) => p.open_id === openId).slice(-8).reverse();
  if (!mine.length) return { posts: [] };
  const token = await accessToken(openId);
  const posts = await Promise.all(mine.map(async (p) => {
    let status = null, fail_reason = null;
    try { const s = await tt("/post/publish/status/fetch/", token, { json: { publish_id: p.publish_id } }); status = s.status; fail_reason = s.fail_reason || null; } catch (e) { status = "UNKNOWN"; }
    return { at: p.at, asset: p.asset, mode: p.mode, privacy_level: p.privacy_level, status, fail_reason };
  }));
  return { posts };
});
