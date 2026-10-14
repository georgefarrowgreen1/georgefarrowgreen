/* ---------- a friend's loft ----------
   Visit a friend's loft: their named pigeons (name, rank, what they're
   wearing), their Hall of Fame, the badges they've earned, the accessories
   and seasonal looks they've kept, and how far their pigeons have flown.
   Only for friends, and only while they share their news (Privacy → Share
   My News). Never where anything went: the passport and postmarks are counts,
   not places (those would point at where their other friends live), a lost
   pigeon has no place, a pigeon's own miles and flights stay its owner's,
   and nothing says whether one is flying right now. */
import { json, db, requireUser, limit, HttpError, UUID_RE, DAY } from "./_pigeon.js";
import { rankOf, settleBirds } from "./_birds.js";
import { passportFor, stampPassports } from "./_passport.js";
import { logFor, SKINS } from "./_stats.js";
import { itemView, ITEMS } from "./_feathers.js";
import { SEASONS } from "./_seasons.js";

const day = (t) => (t == null ? null : Math.floor(t / DAY) * DAY);         // dates to the day
const MILES_STEP = 100 * 1.609344;                                          // total miles, to the hundred

export async function loftFor(D, uid, t) {
  await settleBirds(D, t, uid); await stampPassports(D, t, uid, 20);     // anything of theirs that landed since: counted first
  const [birds, kit, marks, pass, log, who] = await Promise.all([
    D.prepare("SELECT name, km, wear, created_at, retired_at, lost_at FROM pg_birds WHERE owner = ? ORDER BY created_at").bind(uid).all(),
    D.prepare("SELECT item FROM pg_kit WHERE user_id = ?").bind(uid).all(),
    D.prepare("SELECT COUNT(*) AS n FROM pg_postmarks WHERE user_id = ?").bind(uid).first(),
    passportFor(D, uid, t), logFor(D, uid, t),
    D.prepare("SELECT skin, created_at FROM pg_users WHERE id = ?").bind(uid).first(),
  ]);
  const view = (b) => ({ name: b.name, rank: rankOf(b.km), since: day(b.created_at) });
  const owned = new Set(kit.results.map((r) => r.item));
  return {
    since: day(who?.created_at),
    skin: who?.skin && SKINS[who.skin] ? who.skin : null,
    birds: birds.results.filter((b) => !b.retired_at && !b.lost_at).map((b) => ({ ...view(b), wear: b.wear && itemView(b.wear) ? b.wear : null })),
    hall: birds.results.filter((b) => b.retired_at || b.lost_at).map((b) => ({ ...view(b), retired: day(b.retired_at), lost: day(b.lost_at) }))
      .sort((a, b) => (b.retired || b.lost) - (a.retired || a.lost)),
    badges: log.badges.filter((b) => b.earned).map((b) => ({ id: b.id, name: b.name, desc: b.desc })),
    kit: ITEMS.filter(([id]) => owned.has(id)).map(([id]) => itemView(id)),
    looks: SEASONS.filter(([id]) => owned.has("skin:" + id)).map(([id, look]) => ({ id, name: look })),
    km: Math.round(log.km / MILES_STEP) * MILES_STEP,
    landed: log.landed, countries: pass.countries, seas: pass.seas, postmarks: marks?.n || 0,
  };
}
async function loft({ request, env }) {
  const u = await requireUser(request, env), t = Date.now();
  await limit(env, "loft:" + u.id, 120, 3600e3);
  const id = new URL(request.url).searchParams.get("id") || "", D = await db(env);
  if (!UUID_RE.test(id) || id === u.id) throw new HttpError(404, "That loft wasn’t found.");
  const f = await D.prepare(`SELECT p.hide_news FROM pg_links l JOIN pg_users p ON p.id = ?2
    WHERE l.status = 'ok' AND ((l.a = ?1 AND l.b = ?2) OR (l.a = ?2 AND l.b = ?1))`).bind(u.id, id).first();
  if (!f) throw new HttpError(404, "That loft wasn’t found.");      // friends only (and never someone who's blocked you)
  if (f.hide_news) return json({ private: true });
  return json({ loft: await loftFor(D, id, t) });
}
export const LOFT_ROUTES = { "GET loft": loft };
