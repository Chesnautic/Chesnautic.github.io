// GET -> the connected account + fresh creator info (nickname, privacy options, interaction limits, max duration)
import { handler, readSession, checkAllowed, accessToken, userInfo, tt } from "../lib/core.js";
export default handler(async (req) => {
  const openId = readSession(req); checkAllowed(openId);
  const token = await accessToken(openId);
  const [user, creator] = await Promise.all([userInfo(token), tt("/post/publish/creator_info/query/", token)]);
  return { user, creator };
});
