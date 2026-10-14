/* ---------- feathers ----------
   A little currency your pigeons bring home. Every one of yours that lands
   earns a feather or more (further flights, more), a new country in your
   passport earns 3, a new landmark postmark 10, and a streak that reaches a
   week, a month or a hundred days earns both of you 10, 30 or 100.
   Feathers buy accessories for your named pigeons (a scarf, goggles, a top
   hat…), which everyone they fly to sees.

   Kept as a ledger, one row per thing earned or bought, each with its own
   reference, so nothing is ever counted twice. Everyone started with feathers
   for what their pigeons had already done. */
import { json, db, body, limit, requireUser, HttpError, UUID_RE } from "./_pigeon.js";

// [id, name, feathers, emoji]
export const ITEMS = [
  ["satchel", "Satchel", 25, "👜"], ["daisy", "Daisy", 40, "🌼"], ["ribbon", "Ribbon", 60, "🎀"], ["scarf", "Scarf", 80, "🧣"],
  ["goggles", "Goggles", 120, "🥽"], ["shades", "Sunglasses", 150, "🕶️"], ["tophat", "Top Hat", 200, "🎩"], ["crown", "Crown", 500, "👑"],
];
const ITEM = new Map(ITEMS.map((x) => [x[0], x]));
export const isItem = (id) => ITEM.has(id);
export const WELCOME = 20;
// a landed flight: one feather, and one more for every 250 miles (up to six)
export const flightFeathers = (km) => 1 + Math.min(5, Math.floor((km || 0) / 400));
export const STREAK_FEATHERS = { 7: 10, 30: 30, 100: 100 };

// Before anything is earned: everyone who already had pigeons in the air gets
// the feathers those flights, places and postmarks would have earned, once.
let ready = false;
export async function ensureFeathers(D) {
  if (ready) return;
  if (!(await D.prepare("SELECT 1 FROM pg_meta WHERE k = 'feathers_v1'").first())) {
    // (each table counted once, grouped, rather than once per person)
    await D.prepare(`INSERT OR IGNORE INTO pg_feathers (user_id, ref, n, at, why)
      SELECT u.id, 'start', ${WELCOME} + 2 * COALESCE(s.n, 0) + 3 * COALESCE(p.n, 0) + 10 * COALESCE(k.n, 0), ?1, 'start' FROM pg_users u
      LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM pg_stamped GROUP BY user_id) s ON s.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM pg_passport GROUP BY user_id) p ON p.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM pg_postmarks GROUP BY user_id) k ON k.user_id = u.id`).bind(Date.now()).run();
    await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('feathers_v1', '1')").run();
  }
  ready = true;
}
// Earn some (ignored if that reference has already earned)
export const earn = (D, uid, ref, n, why, t) => D.prepare("INSERT OR IGNORE INTO pg_feathers (user_id, ref, n, at, why) VALUES (?, ?, ?, ?, ?)").bind(uid, ref, n, t, why);
export async function balanceOf(D, uid) {
  return (await D.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM pg_feathers WHERE user_id = ?").bind(uid).first()).n;
}

const WHY = { start: "For your flights so far", flight: "A pigeon landed", place: "New in your passport", mark: "A new postmark", streak: "Streak" };
async function walletFor(D, uid, t) {
  await ensureFeathers(D);
  await earn(D, uid, "start", WELCOME, "start", t).run();          // someone new: a few to start with
  const [bal, kit, worn, recent] = await Promise.all([balanceOf(D, uid),
    D.prepare("SELECT item FROM pg_kit WHERE user_id = ?").bind(uid).all(),
    D.prepare("SELECT id, name, wear FROM pg_birds WHERE owner = ? AND wear IS NOT NULL AND retired_at IS NULL AND lost_at IS NULL").bind(uid).all(),
    D.prepare("SELECT ref, n, at, why FROM pg_feathers WHERE user_id = ? ORDER BY at DESC LIMIT 12").bind(uid).all()]);
  const owned = new Set(kit.results.map((r) => r.item)), on = new Map(worn.results.map((b) => [b.wear, { id: b.id, name: b.name }]));
  return {
    feathers: bal,
    items: ITEMS.map(([id, name, price, emoji]) => ({ id, name, price, emoji, owned: owned.has(id), on: on.get(id) || null })),
    recent: recent.results.map((r) => ({ n: r.n, at: r.at, why: r.why === "buy" ? `Bought ${ITEM.get(r.ref.slice(4))?.[1] || "something"}` : r.why.startsWith("streak") ? `A ${r.why.slice(7)}-day streak` : WHY[r.why] || r.why })),
  };
}
async function wallet({ request, env }) {
  const u = await requireUser(request, env);
  return json(await walletFor(await db(env), u.id, Date.now()));
}
async function buy({ request, env }) {
  const u = await requireUser(request, env);
  await limit(env, "feathers:" + u.id, 60, 3600e3);
  const id = String((await body(request)).item || ""), it = ITEM.get(id), D = await db(env), t = Date.now();
  if (!it) throw new HttpError(404, "That isn’t in the shop.");
  await ensureFeathers(D);
  if (await D.prepare("SELECT 1 FROM pg_kit WHERE user_id = ? AND item = ?").bind(u.id, id).first()) throw new HttpError(409, `You already have the ${it[1].toLowerCase()}.`);
  // both or neither, and only with enough feathers (so two at once can't overspend)
  await D.batch([
    D.prepare(`INSERT OR IGNORE INTO pg_feathers (user_id, ref, n, at, why) SELECT ?1, ?2, ?3, ?4, 'buy'
      WHERE (SELECT COALESCE(SUM(n), 0) FROM pg_feathers WHERE user_id = ?1) >= ?5`).bind(u.id, "buy:" + id, -it[2], t, it[2]),
    D.prepare("INSERT OR IGNORE INTO pg_kit (user_id, item, at) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM pg_feathers WHERE user_id = ?1 AND ref = ?4)").bind(u.id, id, t, "buy:" + id),
  ]);
  if (!(await D.prepare("SELECT 1 FROM pg_kit WHERE user_id = ? AND item = ?").bind(u.id, id).first())) {
    const have = await balanceOf(D, u.id);
    throw new HttpError(409, `The ${it[1].toLowerCase()} is ${it[2]} feathers. You have ${have}.`);
  }
  return json(await walletFor(D, u.id, t));
}
// Put something you own on one of your pigeons (it comes off any other), or take it off (item: null)
async function wear({ request, env }) {
  const u = await requireUser(request, env);
  const b = await body(request), bird = String(b.bird || ""), item = b.item == null ? null : String(b.item), D = await db(env), t = Date.now();
  if (!UUID_RE.test(bird)) throw new HttpError(404, "That pigeon wasn’t found.");
  if (item && (!isItem(item) || !(await D.prepare("SELECT 1 FROM pg_kit WHERE user_id = ? AND item = ?").bind(u.id, item).first()))) throw new HttpError(403, "Buy it first.");
  const own = await D.prepare("SELECT 1 FROM pg_birds WHERE id = ? AND owner = ? AND retired_at IS NULL AND lost_at IS NULL").bind(bird, u.id).first();
  if (!own) throw new HttpError(404, "That pigeon wasn’t found.");
  await D.batch([
    ...(item ? [D.prepare("UPDATE pg_birds SET wear = NULL WHERE owner = ? AND wear = ?").bind(u.id, item)] : []),
    D.prepare("UPDATE pg_birds SET wear = ? WHERE id = ? AND owner = ?").bind(item, bird, u.id),
  ]);
  return json(await walletFor(D, u.id, t));
}
export const itemView = (id) => { const it = ITEM.get(id); return it ? { id, name: it[1], emoji: it[3] } : null; };
export const FEATHER_ROUTES = { "GET feathers": wallet, "POST feathers-buy": buy, "POST bird-wear": wear };
