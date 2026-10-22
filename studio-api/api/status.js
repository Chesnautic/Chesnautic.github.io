// POST {publish_id} -> TikTok processing status for a post
import { handler, body, readSession, checkAllowed, accessToken, tt, httpError } from "../lib/core.js";
export default handler(async (req) => {
  const openId = readSession(req); checkAllowed(openId);
  const { publish_id } = await body(req);
  if (!publish_id) throw httpError(400, "Missing publish_id.");
  return tt("/post/publish/status/fetch/", await accessToken(openId), { json: { publish_id } });
});
