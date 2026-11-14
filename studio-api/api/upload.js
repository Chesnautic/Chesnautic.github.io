// Vercel Blob client upload: a signed-in user's browser sends their own video straight to temporary storage
// (creator-uploads/<user key>/...), then /api/post sends it to TikTok and deletes it.
import { handleUpload } from "@vercel/blob/client";
import { handler, body, readAuth, userKey, httpError } from "../lib/core.js";
export default handler(async (req) => {
  if (req.method !== "POST") throw httpError(405, "Use POST.");
  const b = await body(req);
  return handleUpload({
    body: b, request: req,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      // the session comes in the Authorization header, or in clientPayload from the upload helper
      const { openId } = readAuth(req.headers.authorization ? req : { headers: { authorization: "Bearer " + String(clientPayload || "") } });
      if (!pathname.startsWith(`creator-uploads/${userKey(openId)}/`)) throw httpError(400, "Bad upload path.");
      return { allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"], maximumSizeInBytes: 64 * 1024 * 1024, addRandomSuffix: true };
    },
    onUploadCompleted: async () => {},
  });
});
