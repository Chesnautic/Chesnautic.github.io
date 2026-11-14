// POST {code} -> exchanges the TikTok login code and returns a session + profile.
// The owner's accounts: tokens stored encrypted in Content-Vault (for the daily auto-post). Everyone else: nothing is
// stored; the encrypted login lives only in the session their browser keeps.
import { handler, body, exchangeCode, saveTokens, tokenRecord, userInfo, makeSession, isOwner, readFile, writeFile, httpError } from "../lib/core.js";
export default handler(async (req) => {
  if (req.method !== "POST") throw httpError(405, "Use POST.");
  const { code, redirect_uri } = await body(req);
  if (!code) throw httpError(400, "Missing login code.");
  const tok = await exchangeCode(code, redirect_uri || (req.headers.origin === "https://chesnautic.github.io" ? "https://chesnautic.github.io/studio/callback.html" : undefined));
  if (!(await isOwner(tok.open_id))) {
    const rec = tokenRecord(tok);
    const user = await userInfo(rec.access_token);
    return { session: makeSession(tok.open_id, "creator", rec), open_id: tok.open_id, owner: false,
      user: { display_name: user.display_name || "", avatar_url: user.avatar_url || "" }, scope: tok.scope };
  }
  const rec = await saveTokens(tok);
  const user = await userInfo(rec.access_token);
  const f = await readFile("tiktok/accounts.json");
  const list = f ? JSON.parse(f.text) : [];
  const i = list.findIndex((a) => a.open_id === tok.open_id);
  const entry = { ...(i >= 0 ? list[i] : {}), open_id: tok.open_id, display_name: user.display_name || "", avatar_url: user.avatar_url || "", scope: tok.scope, connected_at: new Date().toISOString() };
  if (i >= 0) list[i] = entry; else list.push(entry);
  await writeFile("tiktok/accounts.json", JSON.stringify(list, null, 1) + "\n", `Content Studio: connected TikTok ${entry.display_name || tok.open_id}`);
  return { session: makeSession(tok.open_id, "owner"), open_id: tok.open_id, owner: true, user: { display_name: entry.display_name, avatar_url: entry.avatar_url, channel: entry.channel || null }, scope: tok.scope };
});
