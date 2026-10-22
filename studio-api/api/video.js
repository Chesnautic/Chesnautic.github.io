// GET ?a=<asset name>&s=<session> -> redirects to a short-lived download link for the preview player
import { handler, readSession, checkAllowed, queueAssetId, assetUrl, httpError } from "../lib/core.js";
export default handler(async (req, res) => {
  checkAllowed(readSession(req));
  const name = String(req.query.a || "");
  if (!/^[\w.-]+\.mp4$/.test(name)) throw httpError(400, "Bad video name.");
  const a = await queueAssetId(name);
  res.setHeader("Location", await assetUrl(a.id));
  res.status(302).end();
});
