// InFlite Today's Chat card: the pigeons on their way to you, and when they land; those landed and not yet read, by
// friend; yours in the air; and a streak that ends today unless a pigeon flies. Friends only, and never a word of any
// letter: only the columns in CHAT_COLUMNS are ever read (a unit test holds this to them, and proves nothing sealed can
// leave), never a pigeon scheduled before it's taken off, and a pigeon that will be lost looks like any other in the air.
// And Today First's Waiting for You (spec §7.4): who's waiting for an answer, and since when, never what they said.
//   waitingFor(env, u, t) → [{ id, first, group?: { id, name }, at, n }], the newest first, at most 6: one-to-one friends
//     whose newest landed letter or message in the chat is theirs (read or not), within 24 hours, not lost or gone, with
//     nothing of yours sent since (n: how many of theirs since your last); and groups whose newest delivered to you is
//     someone else's, within 24 hours, with nothing of yours sent to the group since (id: the group's; first: who wrote
//     it). Their words are the phone's alone (Chat's engine, pigeon/digest.js).
//   wroteWhile(env, u, start, end) → [{ id, first, group?, at }]: who wrote to you inside a window (a letter or message
//     landing in it), the latest first, at most 6 (the after card's "Mira wrote while you rode")
// Only CHAT_COLUMNS of pg_msgs, and GROUP_COLUMNS of pg_gmsgs and pg_gdeliv, are ever read (lost_at, gone_at and
// recalled only in a WHERE); with pg_users' id and name, pg_groups' name, and pg_links' and pg_group_members' keys.

import { db, MAX_FLIGHT } from "./_pigeon.js";
import { streaksFor, STREAK_MIN } from "./_streaks.js";
import { firstWord, withSend } from "./_todaycards.js";

// the only columns of pg_msgs Today reads (with pg_users' id, name and avatar_at, for who). Never ct, via_ct, via_note,
// body, wrap, sender_key, photo, photo_size, once, sched, legs, via*, wx*; lost_at only in a WHERE
export const CHAT_COLUMNS = ["sender", "recipient", "sent_at", "deliver_at", "km", "pigeon", "swift", "mystery", "bird_name", "bird_rank", "from_place", "to_place", "read_at", "instant"];

// the only columns of pg_gmsgs (group_id, sender, sent_at) and pg_gdeliv (user_id, deliver_at, read_at) Today reads,
// joined by their keys. Never body, sender_key, wrap, photo*, legs, wx*, *_place, *_lat, *_lon
export const GROUP_COLUMNS = ["group_id", "sender", "sent_at", "user_id", "deliver_at", "read_at"];

// (how many of each the card shows)
const INBOUND = 6, UNREAD = 6, MINE = 3;
// the friends of ?1 (pg_links 'ok' either way round): a pigeon from or to anyone else isn't on the card
const FRIENDS = "JOIN pg_links l ON l.status = 'ok' AND ((l.a = m.sender AND l.b = m.recipient) OR (l.a = m.recipient AND l.b = m.sender))";
// in the air now (functions/_skies.js's rule): taken off (a scheduled one only once it has), not landed, not lost by now,
// not gone; one that will be lost later is in the air like any other, and nothing here says otherwise
const AIR = "m.notified_at IS NULL AND m.sent_at <= ?2 AND m.deliver_at > ?2 AND (m.lost_at IS NULL OR m.lost_at > ?2) AND m.gone_at IS NULL";

// ctx: functions/_todaycards.js cardsFor's
// (u: the account's pg_users row, with its pigeons switch: every caller passes it; one without it counts as on)
export async function chatCard(env, u, ctx) {
  const { t, links } = ctx, me = u.id, href = `${links.chat}/`, D = await db(env);
  const pigeons = u.pigeons !== 0 && u.pigeons !== false;
  const [inbound, [all], unread, mine, friends] = (await D.batch([
    // in the air to me
    D.prepare(`SELECT m.sender, m.sent_at, m.deliver_at, m.km, m.pigeon, m.swift, m.mystery, m.bird_name, m.bird_rank, m.from_place, u.name, u.avatar_at
      FROM pg_msgs m ${FRIENDS} JOIN pg_users u ON u.id = m.sender
      WHERE m.recipient = ?1 AND ${AIR} ORDER BY m.deliver_at LIMIT ${INBOUND}`).bind(me, t),
    // …all of them, however many the card lists, and from how many friends (for the morning's words)
    D.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT m.sender) AS f
      FROM pg_msgs m ${FRIENDS} JOIN pg_users u ON u.id = m.sender
      WHERE m.recipient = ?1 AND ${AIR}`).bind(me, t),
    // landed, not read, by friend (and how many of them are messages rather than letters)
    D.prepare(`SELECT m.sender, COUNT(*) AS n, SUM(m.instant IS NOT NULL) AS msgs, MAX(m.deliver_at) AS last, u.name, u.avatar_at
      FROM pg_msgs m ${FRIENDS} JOIN pg_users u ON u.id = m.sender
      WHERE m.recipient = ?1 AND m.read_at IS NULL AND m.deliver_at <= ?2 AND m.lost_at IS NULL AND m.gone_at IS NULL
      GROUP BY m.sender ORDER BY last DESC LIMIT ${UNREAD}`).bind(me, t),
    // mine in the air
    D.prepare(`SELECT m.recipient, m.sent_at, m.deliver_at, m.km, m.pigeon, m.swift, m.mystery, m.bird_name, m.bird_rank, m.to_place, u.name, u.avatar_at
      FROM pg_msgs m ${FRIENDS} JOIN pg_users u ON u.id = m.recipient
      WHERE m.sender = ?1 AND ${AIR} ORDER BY m.deliver_at LIMIT 20`).bind(me, t),
    // my friends (whether there are any, and who a streak's with)
    D.prepare(`SELECT u.id, u.name, u.avatar_at FROM pg_links l JOIN pg_users u ON u.id = (CASE WHEN l.a = ?1 THEN l.b ELSE l.a END)
      WHERE (l.a = ?1 OR l.b = ?1) AND l.status = 'ok' LIMIT 1000`).bind(me),
  ])).map((r) => r.results || []);
  if (!friends.length) return { state: "empty", pigeons, href, said: pigeons ? "Add a friend in Chat, and their pigeons show here." : "Add a friend in Chat, and your messages show here.", action: { label: "Open Chat", href } };

  const who = (id, name, at) => ({ id, name: String(name ?? ""), first: firstWord(name), photoAt: at || null });
  const open = (id) => `${links.chat}/#open=${id}`;
  // (its kind, as Chat has it: msgView's)
  const kindOf = (m) => m.pigeon || (m.swift ? "swift" : "standard");
  const bird = (m) => (m.bird_name ? { name: String(m.bird_name), rank: m.bird_rank || null } : null);
  const out = {
    state: "ok",
    pigeons,
    href,
    // (a mystery pigeon's kind is never said to whoever it's flying to: their Chat says only "A mystery pigeon")
    inbound: inbound.map((m) => ({ who: who(m.sender, m.name, m.avatar_at), sentAt: m.sent_at, landsAt: m.deliver_at, km: Math.round(m.km || 0), kind: m.mystery ? null : kindOf(m),
      mystery: !!m.mystery, bird: bird(m), from: m.from_place ?? null, href: open(m.sender) })),
    // (every pigeon on its way to you, not only the soonest the card lists, and the friends sending them)
    inboundTotal: Math.max(inbound.length, Number(all?.n) || 0),
    inboundFrom: Math.max(new Set(inbound.map((m) => m.sender)).size, Number(all?.f) || 0),
    unread: unread.map((r) => ({ who: who(r.sender, r.name, r.avatar_at), n: r.n, messages: Number(r.msgs) || 0, last: r.last, href: open(r.sender) })),
    // (yours: its kind always, as Chat tells its sender: "Mystery: rocket")
    mine: mine.slice(0, MINE).map((m) => ({ who: who(m.recipient, m.name, m.avatar_at), sentAt: m.sent_at, landsAt: m.deliver_at, km: Math.round(m.km || 0), kind: kindOf(m),
      mystery: !!m.mystery, bird: bird(m), to: m.to_place ?? null, href: open(m.recipient) })),
    more: Math.max(0, mine.length - MINE),
    streak: null,
    share: pigeons ? "Sending you a pigeon." : "Sending you a message.",
  };
  // (streaks are pigeons': with them off, none, and no streak card)
  if (!pigeons) return withSend(out, null);
  // streaks, with friends only: the one that ends soonest unless a pigeon flies today (the longer, of two ending
  // together), and the longest still going, for the line to send
  const pals = new Map(friends.map((f) => [f.id, f])), streaks = [];
  for (const [id, v] of await streaksFor(D, me, t)) if (v && v.n >= STREAK_MIN && pals.has(id)) streaks.push({ id, ...v });
  const risk = streaks.filter((s) => !s.today).sort((a, b) => a.endsAt - b.endsAt || b.n - a.n)[0];
  if (risk) { const f = pals.get(risk.id); out.streak = { who: who(f.id, f.name, f.avatar_at), n: risk.n, endsAt: risk.endsAt, best: risk.best, href: open(f.id) }; }
  const long = [...streaks].sort((a, b) => b.n - a.n || a.endsAt - b.endsAt)[0];
  if (long) out.share = `My flight streak with ${firstWord(pals.get(long.id).name) || "you"} is ${long.n} days.`;
  // (the card for Chat, pigeon/cards.js: that streak, the friend's first name, its days and its best)
  return withSend(out, long ? { v: 1, kind: "streak", from: "today", at: t, say: out.share, snap: { who: (firstWord(pals.get(long.id).name) || "A friend").slice(0, 40), n: long.n, ...(Number.isFinite(long.best) ? { best: Math.max(long.best, long.n) } : {}) } } : null);
}

// ---- Today First's Waiting for You (spec §7.4): who and since when, never words ----
// Every read here goes by an index on the account's own rows, never its whole history: theirs to you by pg_msgs_to
// (recipient, read_at), as those not read yet and those read since the window began (a message is read only once it's
// landed, so one that landed in the window and was read was read in it or since); yours to each friend by pg_msgs_pair
// (sender, recipient, sent_at), from the friends (pg_links), sent within the longest a flight can take before the window
// (one of yours that landed in it left no earlier); a group's by pg_gdeliv_user (user_id, deliver_at), and yours in your
// groups by pg_gmsgs_group (group_id, sent_at).
const WAIT_MS = 24 * 3600e3, WAITING = 6, LONGEST = MAX_FLIGHT + 24 * 3600e3;
// (theirs to me from friends, landed in a window, not lost or gone: read at ?4 or later, or not read; the window (?2, ?3]
// or, with from, [?2, ?3))
const theirsQ = (D, me, lo, hi, read, from = false, cols = "m.sender, m.deliver_at, u.name", tail = "ORDER BY m.deliver_at DESC LIMIT 300") =>
  D.prepare(`SELECT ${cols} FROM pg_msgs m ${FRIENDS} JOIN pg_users u ON u.id = m.sender
    WHERE m.recipient = ?1 AND ${read ? "m.read_at >= ?4" : "m.read_at IS NULL"} AND m.deliver_at ${from ? ">=" : ">"} ?2 AND m.deliver_at ${from ? "<" : "<="} ?3
      AND m.lost_at IS NULL AND m.gone_at IS NULL ${tail}`).bind(...(read ? [me, lo, hi, lo] : [me, lo, hi]));
// (each group's delivered to me in a window, someone else's, not lost, recalled or gone, in a group I'm in)
const GROUP_THEIRS = `SELECT g.group_id, g.sender, d.deliver_at, u.name, r.name AS gname FROM pg_gdeliv d JOIN pg_gmsgs g ON g.id = d.msg_id
  JOIN pg_group_members k ON k.group_id = g.group_id AND k.user_id = ?1 JOIN pg_groups r ON r.id = g.group_id JOIN pg_users u ON u.id = g.sender
  WHERE d.user_id = ?1 AND d.lost_at IS NULL AND d.recalled = 0 AND g.gone_at IS NULL AND g.sender != ?1`;

export async function waitingFor(env, u, t) {
  const me = u.id, D = await db(env), since = t - WAIT_MS;
  const [unread, read, mine, gTheirs, gMine] = (await Promise.all([
    // theirs to me, landed in the last day, from friends: not read yet, and read since
    theirsQ(D, me, since, t, false, false, "m.sender, m.deliver_at, m.sent_at, u.name").all(),
    theirsQ(D, me, since, t, true, false, "m.sender, m.deliver_at, m.sent_at, u.name").all(),
    // mine to each friend, sent since the longest flight before the day began (one that will be lost later still counts
    // as an answer: it's secret till then)
    D.prepare(`SELECT m.recipient, m.sent_at, m.deliver_at FROM pg_links l CROSS JOIN pg_msgs m ON m.sender = ?1 AND m.recipient = l.b AND m.sent_at <= ?2 AND m.sent_at > ?3
        WHERE l.a = ?1 AND l.status = 'ok' AND (m.lost_at IS NULL OR m.lost_at > ?2) AND m.gone_at IS NULL
      UNION ALL SELECT m.recipient, m.sent_at, m.deliver_at FROM pg_links l CROSS JOIN pg_msgs m ON m.sender = ?1 AND m.recipient = l.a AND m.sent_at <= ?2 AND m.sent_at > ?3
        WHERE l.b = ?1 AND l.status = 'ok' AND (m.lost_at IS NULL OR m.lost_at > ?2) AND m.gone_at IS NULL LIMIT 2000`).bind(me, t, since - LONGEST).all(),
    // groups: delivered to me in the last day, someone else's, in a group I'm in
    D.prepare(`${GROUP_THEIRS} AND d.deliver_at <= ?2 AND d.deliver_at > ?3 ORDER BY d.deliver_at DESC LIMIT 300`).bind(me, t, since).all(),
    // …and mine sent to my groups in the last day
    D.prepare(`SELECT g.group_id, g.sent_at FROM pg_group_members k CROSS JOIN pg_gmsgs g ON g.group_id = k.group_id AND g.sent_at <= ?2 AND g.sent_at > ?3
      WHERE k.user_id = ?1 AND g.sender = ?1 LIMIT 600`).bind(me, t, since).all(),
  ])).map((r) => r.results || []);
  const out = [];
  // one-to-one: their newest landed is the chat's newest landed, and nothing of mine sent since it
  const byFriend = new Map();
  for (const r of [...unread, ...read]) { const f = byFriend.get(r.sender) || byFriend.set(r.sender, { name: r.name, at: [], wrote: -Infinity }).get(r.sender); f.at.push(r.deliver_at); f.wrote = Math.max(f.wrote, Number(r.sent_at) || -Infinity); }
  const mineTo = new Map();
  for (const r of mine) (mineTo.get(r.recipient) || mineTo.set(r.recipient, []).get(r.recipient)).push(r);
  for (const [id, f] of byFriend) {
    const last = Math.max(...f.at), m = mineTo.get(id) || [];
    // (answered: anything of mine written after their newest was, even while theirs was still in the air, as the chat
    // shows them; or landed after theirs did)
    if (m.some((x) => x.sent_at >= last || x.sent_at >= f.wrote || (x.deliver_at > last && x.deliver_at <= t))) continue;
    const answered = Math.max(-Infinity, ...m.map((x) => x.sent_at));
    out.push({ id, first: firstWord(f.name), at: last, n: f.at.filter((x) => x > answered).length });
  }
  // groups: someone else's the newest delivered to me, nothing of mine sent to the group since it
  const byGroup = new Map();
  for (const r of gTheirs) {
    const g = byGroup.get(r.group_id) || byGroup.set(r.group_id, { name: r.gname, first: firstWord(r.name), at: r.deliver_at, all: [] }).get(r.group_id);
    g.all.push(r.deliver_at);
  }
  const mineIn = new Map();
  for (const r of gMine) mineIn.set(r.group_id, Math.max(mineIn.get(r.group_id) ?? -Infinity, r.sent_at));
  for (const [id, g] of byGroup) {
    const answered = mineIn.get(id) ?? -Infinity;
    if (answered >= g.at) continue;
    out.push({ id, first: g.first, group: { id, name: String(g.name ?? "") }, at: g.at, n: g.all.filter((x) => x > answered).length });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, WAITING);
}
export async function wroteWhile(env, u, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const me = u.id, D = await db(env), each = "m.sender, MAX(m.deliver_at) AS at, u.name", byWho = `GROUP BY m.sender ORDER BY at DESC LIMIT ${WAITING}`;
  const [unread, read, groups] = (await Promise.all([
    theirsQ(D, me, start, end, false, true, each, byWho).all(),
    theirsQ(D, me, start, end, true, true, each, byWho).all(),
    D.prepare(`${GROUP_THEIRS} AND d.deliver_at >= ?2 AND d.deliver_at < ?3 ORDER BY d.deliver_at DESC LIMIT 200`).bind(me, start, end).all(),
  ])).map((r) => r.results || []);
  // (each friend once, at the latest of theirs, read or not)
  const one = new Map();
  for (const r of [...unread, ...read]) if (!one.has(r.sender) || one.get(r.sender).at < r.at) one.set(r.sender, r);
  return [
    ...[...one.values()].map((r) => ({ id: r.sender, first: firstWord(r.name), at: r.at })),
    // (each group once, by who wrote in it last)
    ...groups.filter((r, i, all) => all.findIndex((x) => x.group_id === r.group_id) === i)
      .map((r) => ({ id: r.group_id, first: firstWord(r.name), group: { id: r.group_id, name: String(r.gname ?? "") }, at: r.deliver_at })),
  ].sort((a, b) => b.at - a.at).slice(0, WAITING);
}
