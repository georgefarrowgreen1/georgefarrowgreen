/* ---------- disappearing messages ----------
   A chat (two friends, or a group) can have its messages disappear a while after
   they're read: 1 day, 7 days or 30 days. Either friend (or anyone in the group)
   sets it, everyone in the chat sees it, and it holds for pigeons sent after.

   What disappears is what was said: the sealed message, its photo or voice
   pigeon, its stopover note and its reactions are wiped from the server (and
   the phones stop showing it). The flight itself stays (the miles, the route,
   the stamps), so the Flight Log and the passport still count it.

   One to one: gone once the friend has read it and the time has passed. In a
   group: once everyone it flew to has read it (or it was lost), after the last
   of them read it. Where read receipts are off (either friend's, or anyone's in
   the group: they go both ways), the time counts from landing instead, so its
   going says nothing of when, or whether, it was read. */
import { json, db, requireUser, body, HttpError, DAY } from "./_pigeon.js";

export const VANISH = [DAY, 7 * DAY, 30 * DAY];
export const vanishOk = (ms) => ms === 0 || VANISH.includes(ms);
export const vanishSay = (ms) => (ms ? `${ms / DAY} day${ms === DAY ? "" : "s"}` : "off");
const pair = (a, b) => (a < b ? [a, b] : [b, a]);

// the setting between two friends: { ms, by, at } or null
export async function pairVanish(D, a, b) {
  const [x, y] = pair(a, b);
  const r = await D.prepare("SELECT ms, by, at FROM pg_vanish WHERE a = ? AND b = ?").bind(x, y).first();
  return r && r.ms ? r : null;
}
// every setting of yours, by friend
export async function vanishFor(D, uid) {
  const { results } = await D.prepare("SELECT a, b, ms, by, at FROM pg_vanish WHERE (a = ?1 OR b = ?1) AND ms > 0").bind(uid).all();
  return new Map(results.map((r) => [r.a === uid ? r.b : r.a, { ms: r.ms, by: r.by, at: r.at }]));
}

async function setPair({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request), ms = Number(b.ms), other = String(b.with || "");
  if (!vanishOk(ms)) throw new HttpError(400, "Choose off, 1 day, 7 days or 30 days.");
  const D = await db(env);
  const ok = await D.prepare("SELECT 1 FROM pg_links WHERE status = 'ok' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))").bind(u.id, other).first();
  if (!ok) throw new HttpError(403, "You can only change this with a friend.");
  const [x, y] = pair(u.id, other), t = Date.now();
  await D.prepare("INSERT INTO pg_vanish (a, b, ms, by, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(a, b) DO UPDATE SET ms = excluded.ms, by = excluded.by, at = excluded.at").bind(x, y, ms, u.id, t).run();
  return json({ vanish: ms ? { ms, by: u.id, at: t } : null });
}

// Wipes what's due (from the minute tick): a batch at a time.
export async function vanishSweep(env) {
  const D = await db(env), t = Date.now();
  // one to one
  // (90 at a time: D1 takes at most 100 bound values in a statement. A lost one goes its time after it was lost.
  // With either one's read receipts off, it's timed from landing: the sender would otherwise see when it was read.)
  const { results: ms } = await D.prepare(`SELECT m.id, m.photo FROM pg_msgs m
      LEFT JOIN pg_users s ON s.id = m.sender LEFT JOIN pg_users r ON r.id = m.recipient
    WHERE m.vanish IS NOT NULL AND m.gone_at IS NULL
      AND ((CASE WHEN s.no_receipts = 1 OR r.no_receipts = 1 THEN m.deliver_at ELSE m.read_at END) + m.vanish <= ?1
        OR (m.lost_at IS NOT NULL AND m.lost_at + m.vanish <= ?1)) LIMIT 90`).bind(t).all();
  if (ms.length) {
    const photos = ms.filter((m) => m.photo === 1).map((m) => `pigeon/${m.id}`);
    if (photos.length && env.BIO_R2) await env.BIO_R2.delete(photos).catch(() => {});
    const ids = ms.map((m) => m.id), q = ids.map(() => "?").join(",");
    await D.batch([
      D.prepare(`UPDATE pg_msgs SET ct = '', via_ct = NULL, via_note = NULL, photo = CASE WHEN photo = 1 THEN 2 ELSE photo END, gone_at = ? WHERE id IN (${q})`).bind(t, ...ids),
      D.prepare(`DELETE FROM pg_reacts WHERE msg_id IN (${q})`).bind(...ids),
    ]);
  }
  // groups: everyone it flew to has read it (or it was lost), and the time has passed since the last of them did
  // (with the sender's or anyone's read receipts off: since the last of its pigeons landed, or was lost)
  const { results: gs } = await D.prepare(`SELECT m.id, m.photo FROM pg_gmsgs m WHERE m.vanish IS NOT NULL AND m.gone_at IS NULL AND (CASE
      WHEN EXISTS (SELECT 1 FROM pg_users x WHERE x.id = m.sender AND x.no_receipts = 1)
        OR EXISTS (SELECT 1 FROM pg_gdeliv d JOIN pg_users x ON x.id = d.user_id WHERE d.msg_id = m.id AND x.no_receipts = 1)
        THEN (SELECT MAX(COALESCE(d.lost_at, d.deliver_at)) FROM pg_gdeliv d WHERE d.msg_id = m.id)
      WHEN NOT EXISTS (SELECT 1 FROM pg_gdeliv d WHERE d.msg_id = m.id AND d.read_at IS NULL AND d.lost_at IS NULL)
        THEN (SELECT MAX(COALESCE(d.read_at, d.lost_at)) FROM pg_gdeliv d WHERE d.msg_id = m.id)
      END) + m.vanish <= ?1 LIMIT 90`).bind(t).all();
  if (gs.length) {
    const photos = gs.filter((m) => m.photo === 1).map((m) => `pigeon-g/${m.id}`);
    if (photos.length && env.BIO_R2) await env.BIO_R2.delete(photos).catch(() => {});
    const ids = gs.map((m) => m.id), q = ids.map(() => "?").join(",");
    await D.batch([
      D.prepare(`UPDATE pg_gmsgs SET body = '', sender_key = '', photo = CASE WHEN photo = 1 THEN 2 ELSE photo END, gone_at = ? WHERE id IN (${q})`).bind(t, ...ids),
      D.prepare(`UPDATE pg_gdeliv SET wrap = '' WHERE msg_id IN (${q})`).bind(...ids),
      D.prepare(`DELETE FROM pg_reacts WHERE msg_id IN (${q})`).bind(...ids),
    ]);
  }
  return ms.length + gs.length;
}

export const VANISH_ROUTES = { "POST vanish": setPair };
