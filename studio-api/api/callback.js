// POST {code} -> exchanges the TikTok login code, stores the tokens (encrypted) in Content-Vault, returns a session + profile
import { handler, body, exchangeCode, saveTokens, userInfo, makeSession, checkAllowed, readFile, writeFile, httpError } from "../lib/core.js";
export default handler(async (req) => {
  if (req.method !== "POST") throw httpError(405, "Use POST.");
  const { code } = await body(req);
  if (!code) throw httpError(400, "Missing login code.");
  const tok = await exchangeCode(code);
  checkAllowed(tok.open_id);
  const rec = await saveTokens(tok);
  const user = await userInfo(rec.access_token);
  // account list (no tokens) so the daily task knows which accounts are connected
  const f = await readFile("tiktok/accounts.json");
  const list = f ? JSON.parse(f.text) : [];
  const i = list.findIndex((a) => a.open_id === tok.open_id);
  const entry = { ...(i >= 0 ? list[i] : {}), open_id: tok.open_id, display_name: user.display_name || "", avatar_url: user.avatar_url || "", scope: tok.scope, connected_at: new Date().toISOString() };
  if (i >= 0) list[i] = entry; else list.push(entry);
  await writeFile("tiktok/accounts.json", JSON.stringify(list, null, 1) + "\n", `Content Studio: connected TikTok ${entry.display_name || tok.open_id}`);
  return { session: makeSession(tok.open_id), user: { display_name: entry.display_name, avatar_url: entry.avatar_url, channel: entry.channel || null }, scope: tok.scope };
});
