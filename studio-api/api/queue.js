// GET -> videos waiting in the Content-Vault queue (today and later), newest last
import { handler, readSession, checkAllowed, ghJson, readFile } from "../lib/core.js";
export default handler(async (req) => {
  checkAllowed(readSession(req));
  const channels = JSON.parse((await readFile("channels.json")).text);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const out = [];
  for (const ch of Object.keys(channels).filter((k) => !k.startsWith("_"))) {
    let files = [];
    try { files = await ghJson(`/contents/queue/${ch}`); } catch { continue; }
    for (const f of files.filter((f) => f.name.endsWith(".json") && f.name.slice(0, 10) >= today)) {
      const item = JSON.parse((await readFile(`queue/${ch}/${f.name}`)).text);
      const yt = item.youtube || {};
      out.push({ id: `${ch}/${f.name}`, channel: ch, channel_label: channels[ch].label || ch, date: f.name.slice(0, 10),
        title: (yt.title || "").replace(/\s*#shorts\b/i, "").trim(), description: yt.description || "", tags: yt.tags || [],
        video_asset: item.video_asset || f.name.replace(/\.json$/, ".mp4"), tiktok: item.tiktok || null });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
  return { items: out };
});
