// InFlite Today's Chat card: the pigeons on their way to you, and when they land; those landed and not yet read, by
// friend; yours in the air; and a streak that ends today unless a pigeon flies. Friends only, and never a word of any
// letter: only the columns in CHAT_COLUMNS are ever read (a unit test holds this to them, and proves nothing sealed can
// leave), never a pigeon scheduled before it's taken off, and a pigeon that will be lost looks like any other in the air.

import { db } from "./_pigeon.js";
import { streaksFor, STREAK_MIN } from "./_streaks.js";
import { firstWord, withSend } from "./_todaycards.js";

// the only columns of pg_msgs Today reads (with pg_users' id, name and avatar_at, for who). Never ct, via_ct, via_note,
// body, wrap, sender_key, photo, photo_size, once, sched, legs, via*, wx*; lost_at only in a WHERE
export const CHAT_COLUMNS = ["sender", "recipient", "sent_at", "deliver_at", "km", "pigeon", "swift", "mystery", "bird_name", "bird_rank", "from_place", "to_place", "read_at"];

// (how many of each the card shows)
const INBOUND = 6, UNREAD = 6, MINE = 3;
// the friends of ?1 (pg_links 'ok' either way round): a pigeon from or to anyone else isn't on the card
const FRIENDS = "JOIN pg_links l ON l.status = 'ok' AND ((l.a = m.sender AND l.b = m.recipient) OR (l.a = m.recipient AND l.b = m.sender))";
// in the air now (functions/_skies.js's rule): taken off (a scheduled one only once it has), not landed, not lost by now,
// not gone; one that will be lost later is in the air like any other, and nothing here says otherwise
const AIR = "m.notified_at IS NULL AND m.sent_at <= ?2 AND m.deliver_at > ?2 AND (m.lost_at IS NULL OR m.lost_at > ?2) AND m.gone_at IS NULL";

// ctx: functions/_todaycards.js cardsFor's
export async function chatCard(env, u, ctx) {
  const { t, links } = ctx, me = u.id, href = `${links.chat}/`, D = await db(env);
  const [inbound, [all], unread, mine, friends] = (await D.batch([
    // in the air to me
    D.prepare(`SELECT m.sender, m.sent_at, m.deliver_at, m.km, m.pigeon, m.swift, m.mystery, m.bird_name, m.bird_rank, m.from_place, u.name, u.avatar_at
      FROM pg_msgs m ${FRIENDS} JOIN pg_users u ON u.id = m.sender
      WHERE m.recipient = ?1 AND ${AIR} ORDER BY m.deliver_at LIMIT ${INBOUND}`).bind(me, t),
    // …all of them, however many the card lists, and from how many friends (for the morning's words)
    D.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT m.sender) AS f
      FROM pg_msgs m ${FRIENDS} JOIN pg_users u ON u.id = m.sender
      WHERE m.recipient = ?1 AND ${AIR}`).bind(me, t),
    // landed, not read, by friend
    D.prepare(`SELECT m.sender, COUNT(*) AS n, MAX(m.deliver_at) AS last, u.name, u.avatar_at
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
  if (!friends.length) return { state: "empty", href, said: "Add a friend in Chat, and their pigeons show here.", action: { label: "Open Chat", href } };

  const who = (id, name, at) => ({ id, name: String(name ?? ""), first: firstWord(name), photoAt: at || null });
  const open = (id) => `${links.chat}/#open=${id}`;
  // (its kind, as Chat has it: msgView's)
  const kindOf = (m) => m.pigeon || (m.swift ? "swift" : "standard");
  const bird = (m) => (m.bird_name ? { name: String(m.bird_name), rank: m.bird_rank || null } : null);
  const out = {
    state: "ok",
    href,
    // (a mystery pigeon's kind is never said to whoever it's flying to: their Chat says only "A mystery pigeon")
    inbound: inbound.map((m) => ({ who: who(m.sender, m.name, m.avatar_at), sentAt: m.sent_at, landsAt: m.deliver_at, km: Math.round(m.km || 0), kind: m.mystery ? null : kindOf(m),
      mystery: !!m.mystery, bird: bird(m), from: m.from_place ?? null, href: open(m.sender) })),
    // (every pigeon on its way to you, not only the soonest the card lists, and the friends sending them)
    inboundTotal: Math.max(inbound.length, Number(all?.n) || 0),
    inboundFrom: Math.max(new Set(inbound.map((m) => m.sender)).size, Number(all?.f) || 0),
    unread: unread.map((r) => ({ who: who(r.sender, r.name, r.avatar_at), n: r.n, last: r.last, href: open(r.sender) })),
    // (yours: its kind always, as Chat tells its sender: "Mystery: rocket")
    mine: mine.slice(0, MINE).map((m) => ({ who: who(m.recipient, m.name, m.avatar_at), sentAt: m.sent_at, landsAt: m.deliver_at, km: Math.round(m.km || 0), kind: kindOf(m),
      mystery: !!m.mystery, bird: bird(m), to: m.to_place ?? null, href: open(m.recipient) })),
    more: Math.max(0, mine.length - MINE),
    streak: null,
    share: "Sending you a pigeon.",
  };
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
