// GET -> the connected account + fresh creator info (nickname, privacy options, interaction limits, max duration) + role
import { handler, readAuth, isOwner, userKey, accessToken, userInfo, tt } from "../lib/core.js";
export default handler(async (req, res) => {
  const a = readAuth(req);
  const token = await accessToken(a.openId, req, res);
  const [user, creator] = await Promise.all([userInfo(token), tt("/post/publish/creator_info/query/", token)]);
  return { user, creator, owner: a.owner && (await isOwner(a.openId)), key: userKey(a.openId) };
});
