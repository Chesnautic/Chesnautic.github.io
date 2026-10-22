// POST {asset, title, privacy_level, allow_comment, allow_duet, allow_stitch, brand_organic, brand_content, mode, consent}
// -> uploads the queued video to TikTok (Direct Post, or Upload to drafts) and returns the publish_id
import { handler, body, readSession, checkAllowed, accessToken, tt, queueAssetId, assetUrl, httpError, readFile, writeFile } from "../lib/core.js";
export default handler(async (req) => {
  if (req.method !== "POST") throw httpError(405, "Use POST.");
  const openId = readSession(req); checkAllowed(openId);
  const b = await body(req);
  if (b.consent !== true) throw httpError(400, "Please confirm you want to post this video.");
  if (!/^[\w.-]+\.mp4$/.test(String(b.asset || ""))) throw httpError(400, "Pick a video first.");
  const token = await accessToken(openId);
  const direct = b.mode !== "inbox";
  let creator = null;
  if (direct) {
    creator = await tt("/post/publish/creator_info/query/", token);
    if (!b.privacy_level || !(creator.privacy_level_options || []).includes(b.privacy_level)) throw httpError(400, "Choose who can view this post.");
    if (b.brand_content && b.privacy_level === "SELF_ONLY") throw httpError(400, "Branded content visibility cannot be set to private.");
  }
  const a = await queueAssetId(b.asset);
  const vid = await fetch(await assetUrl(a.id));
  if (!vid.ok) throw httpError(502, "Couldn't download the video from the vault.");
  const bytes = Buffer.from(await vid.arrayBuffer());
  const size = bytes.length;
  if (size > 64 * 1024 * 1024) throw httpError(400, "This video is over 64 MB; Content Studio sends single-chunk uploads only.");
  const source_info = { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 };
  const init = direct
    ? await tt("/post/publish/video/init/", token, { json: { source_info, post_info: {
        title: String(b.title || "").slice(0, 2200), privacy_level: b.privacy_level,
        disable_comment: !b.allow_comment || !!creator.comment_disabled, disable_duet: !b.allow_duet || !!creator.duet_disabled, disable_stitch: !b.allow_stitch || !!creator.stitch_disabled,
        brand_organic_toggle: !!b.brand_organic, brand_content_toggle: !!b.brand_content, video_cover_timestamp_ms: 1000 } } })
    : await tt("/post/publish/inbox/video/init/", token, { json: { source_info } });
  const up = await fetch(init.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Content-Range": `bytes 0-${size - 1}/${size}` }, body: bytes });
  if (!up.ok) throw httpError(502, `TikTok upload failed (${up.status}).`);
  // log the post (no tokens) so the queue knows it went to TikTok
  try {
    const f = await readFile("tiktok/posts.json"); const log = f ? JSON.parse(f.text) : [];
    log.push({ at: new Date().toISOString(), open_id: openId, asset: b.asset, mode: direct ? "direct" : "inbox", privacy_level: b.privacy_level || null, publish_id: init.publish_id, by: "studio" });
    await writeFile("tiktok/posts.json", JSON.stringify(log, null, 1) + "\n", `Content Studio: sent ${b.asset} to TikTok`);
  } catch (e) { console.error("log failed", e); }
  return { publish_id: init.publish_id, mode: direct ? "direct" : "inbox" };
});
