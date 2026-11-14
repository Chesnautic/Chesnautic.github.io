// POST {publish_id} -> TikTok processing status for a post
import { handler, body, readAuth, accessToken, tt, httpError } from "../lib/core.js";
export default handler(async (req, res) => {
  const { openId } = readAuth(req);
  const { publish_id } = await body(req);
  if (!publish_id) throw httpError(400, "Missing publish_id.");
  return tt("/post/publish/status/fetch/", await accessToken(openId, req, res), { json: { publish_id } });
});
