// Daily (Vercel cron): deletes creator uploads older than 24 hours that were never posted.
import { list, del } from "@vercel/blob";
import { handler, httpError } from "../lib/core.js";
export default handler(async (req) => {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) throw httpError(401, "Cron only.");
  const old = Date.now() - 24 * 3600e3; let cursor, n = 0;
  do {
    const r = await list({ prefix: "creator-uploads/", cursor, limit: 1000 });
    const gone = r.blobs.filter((b) => new Date(b.uploadedAt).getTime() < old).map((b) => b.url);
    if (gone.length) { await del(gone); n += gone.length; }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return { deleted: n };
});
