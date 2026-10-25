// The Skies: every pigeon in the air to or from you, one to one and in groups,
// for one map. Only what each chat already shows you: the same views, the same
// rules about whose locations you can see.

import { json, db, requireUser, msgView } from "./_pigeon.js";
import { groupSkies } from "./_groups.js";

async function skies({ request, env }) {
  const u = await requireUser(request, env);
  const D = await db(env), t = Date.now();
  // (theirs only once they've taken off; a scheduled one of yours is still in the loft. One in the air hasn't been
  // told of yet, landed or lost: notified_at picks out those few by index)
  const { results } = await D.prepare(`SELECT m.* FROM pg_msgs m JOIN pg_links l ON l.status = 'ok'
      AND ((l.a = m.sender AND l.b = m.recipient) OR (l.a = m.recipient AND l.b = m.sender))
    WHERE (m.sender = ?1 OR m.recipient = ?1) AND m.notified_at IS NULL AND m.sent_at <= ?2 AND m.deliver_at > ?2 AND (m.lost_at IS NULL OR m.lost_at > ?2)
    ORDER BY m.deliver_at LIMIT 100`).bind(u.id, t).all();
  return json({ now: t, pigeons: results.map((m) => msgView(u.id, m, t)), groups: await groupSkies(D, u.id, t) });
}

export const SKIES_ROUTES = { "GET skies": skies };
