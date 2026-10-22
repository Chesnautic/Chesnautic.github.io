// GET -> every connected TikTok account with its channel and auto-post status (no tokens)
import { handler, readSession, checkAllowed, readFile } from "../lib/core.js";
export default handler(async (req) => {
  checkAllowed(readSession(req));
  const load = async (p, d) => { const f = await readFile(p); return f ? JSON.parse(f.text) : d; };
  const [accounts, auto, channels] = await Promise.all([load("tiktok/accounts.json", []), load("tiktok/autopost.json", {}), load("channels.json", {})]);
  return { accounts: accounts.map((a) => ({ open_id: a.open_id, display_name: a.display_name, avatar_url: a.avatar_url, connected_at: a.connected_at,
    channel: a.channel || null, channel_label: a.channel ? (channels[a.channel] || {}).label || a.channel : null,
    autopost: a.channel && auto[a.channel] && auto[a.channel].open_id === a.open_id ? auto[a.channel] : null })) };
});
