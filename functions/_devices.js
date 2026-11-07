// One device, every app's notifications (Today First, spec §11.3): the root subscription of inflite.ai written into
// each app's own table, each with that table's own rules, and taken back out. td_push (Today's morning) always; and
// once the person's tapped "Get Every App's Notifications Here" (which sends fan: true) on any device, and only while
// the Pages var HUB_PUSH is "1", also pg_push, mk_push and wx_devs/wx_subs, each row marked via = 'hub' so a rollback
// can take back exactly those. The tap's kept on the account (functions/_today.js pushPrefs every), so every device
// handed over afterwards (turned on, or handed over again by its page as it opens, after a sign-in that ended took the
// apps' rows) has every app's too. A device is named to the page only by an opaque id, never its endpoint or its
// session's hash.
//   deviceAdd(env, u, { sub, was?, fan?, tz }, { request }) → { ok: true, tables }       (POST today/device; with was,
//     the endpoint is moved in every table that holds was. tz is accepted and not used (nor is it by POST today/push):
//     the morning's zone comes with the Morning section's own changes, functions/_todayapp.js)
//   deviceDrop(env, u, { endpoint }) → { ok: true, on }: on, whether the account still wants them (another device has
//     them)                                                                             (DELETE today/device)
//   devicesList(env, u, { device }, { request }) → { fan, here, devices: [{ id, label, home, apps, at }] }
//                                                                                       (GET today/devices)
//   devicesStop(env, u, { id }) → { ok: true }: that sign-in's push rows gone, never signed out (DELETE today/devices)
//   addEverywhere(env, u, sub, { fan }) → the tables written (fan: the tap's; not sent, the account's word)
//   moveEverywhere(env, u, was, sub) → the tables it moved in
//   dropEverywhere(env, endpoint, { userId }) → the tables it was in (userId: only that account's rows)
//   otherDevices(env, u, { device }) → [{ id, label, home, apps, at }]: this account's other sign-ins with a push row
//     anywhere, and each of its devices getting Today's whose sign-in has ended (not this one: device, its hash)
//   stopDevice(env, u, id) → the tables it was dropped from, or null when id names none of this account's
//   ready(env) → the database, with every table this reads and writes made, and their via column
// The five tables, and the app each is: pg_push (Chat, by session), td_push (Today's morning, by session), mk_push
// (Markets, by session), fx_push (Fitness's morning, by session; never fanned out: Today's morning carries Fitness's line)
// and wx_devs (Weather, by sess; its places in wx_subs). Each fanned-out row with that table's own rules: one a sign-in
// and ten an account (Chat's), ten an account (Markets'), and a push address another account's still signed in with
// never taken over (all three, Weather's too). A device turned off here (deviceDrop) or stopped there (devicesStop) is
// only ever this account's.
import { HttpError, db, serverSecret, b64url, logError, OTHERS, othersOf } from "./_pigeon.js";
import { keepSub } from "./_notify.js";
import { mkdb, keepPush } from "./_markets.js";
import { wxdb, deviceFor, moveFor, dropFor, dropSession } from "./_wxpush.js";
import { tddb, addDevice, moveDevice, deviceHash, pushPrefs, setPushPrefs, lastOff } from "./_today.js";

const VIA = "hub";
// (the page's own name for this device: the first 16 characters of its endpoint's SHA-256, functions/_today.js deviceHash)
const DEVICE = /^[A-Za-z0-9_-]{16}$/, ID = /^[A-Za-z0-9_-]{16}$/;
// each table's app, as You names them, in the order they're listed
const APPS = [["pg_push", "chat"], ["wx_devs", "weather"], ["mk_push", "markets"], ["fx_push", "fitness"], ["td_push", "today"]];
const HERE_ORDER = ["td_push", "pg_push", "mk_push", "wx_devs", "fx_push"];
// (the names of what a sign-in is a Home Screen app of, or used in: pg_sessions' home and apps; "inflite" is any sign-in
// used in InFlite's window, and Today's own Home Screen app, functions/_pigeon.js homeOf)
const NAMES = { inflight: "Chat", chat: "Chat", weather: "Weather", fitness: "Fitness", markets: "Markets", today: "Today", account: "Account", inflite: "InFlite", mail: "Mail" };
const MAIL = "mail:";

// ---- the tables ----
// Chat's, Markets', Weather's and Today's made (each its own setup, as they always are), and the via column on the three
// that are fanned out into (its failure ignored: it's there already), once per database a copy of the server uses
const readied = new WeakMap();
export async function ready(env) {
  if (!env?.DB) throw new HttpError(503, "Not set up.");
  let p = readied.get(env.DB);
  if (!p) {
    p = (async () => {
      const D = await db(env);
      await mkdb(env); await wxdb(env); await tddb(env);
      for (const tb of ["pg_push", "mk_push", "wx_devs"]) await D.prepare(`ALTER TABLE ${tb} ADD COLUMN via TEXT`).run().catch(() => {});
    })();
    readied.set(env.DB, p);
    p.catch(() => readied.delete(env.DB));
  }
  await p;
  return db(env);
}
// (a statement on a table that may not be made yet, Fitness's fx_push: nothing, rather than a failure)
const maybe = (q) => q.run().then((r) => r, () => ({ meta: { changes: 0 } }));
const rowsOf = (q) => q.all().then((r) => r.results || [], () => []);
const keysOf = (sub) => ({ endpoint: String(sub?.endpoint || ""), p256dh: String(sub?.keys?.p256dh || ""), auth: String(sub?.keys?.auth || "") });

// ---- adding, moving, dropping one device ----
export async function addEverywhere(env, u, sub, { fan } = {}) {
  // (Today's morning, always: and its checks first, so a subscription no push service would take goes nowhere)
  await addDevice(env, u, sub);
  const tables = ["td_push"];
  // (every app's: from the tap, kept on the account; or, without it, as the account says)
  if (fan === true && env.HUB_PUSH === "1") await setPushPrefs(env, u.id, { every: true });
  else if (env.HUB_PUSH === "1") fan = (await pushPrefs(env, u.id)).every;
  if (!(fan === true && env.HUB_PUSH === "1") || !u?.sessionHash) return tables;
  const D = await ready(env);
  // (each app's on its own: one that can't take it, Weather full, say, doesn't stop the others)
  const each = async (table, write) => { try { if (await write()) tables.push(table); } catch (e) { await logError(env, "devices " + table, e); } };
  await each("pg_push", () => keepSub(D, u.id, u.sessionHash, sub, { via: VIA }));
  await each("mk_push", async () => (await keepPush(env, u, sub, { via: VIA })).kept);
  await each("wx_devs", () => deviceFor(env, u.id, sub, { sess: u.sessionHash, via: VIA }));
  return tables;
}
// The browser renewed the subscription by itself (the root service worker's pushsubscriptionchange): every row of this
// account's that has the old one (was) moves to the new, where the new isn't someone's already
export async function moveEverywhere(env, u, was, sub) {
  const tables = [];
  if ((await moveDevice(env, u, { sub, was })).moved) tables.push("td_push");
  const D = await ready(env), k = keysOf(sub);
  const move = (tb, extra = "") => D.prepare(`UPDATE ${tb} SET endpoint = ?1, p256dh = ?2, auth = ?3${extra} WHERE endpoint = ?4 AND user_id = ?5 AND NOT EXISTS (SELECT 1 FROM ${tb} WHERE endpoint = ?1)`)
    .bind(k.endpoint, k.p256dh, k.auth, was, u.id);
  if ((await move("pg_push").run()).meta?.changes) tables.push("pg_push");
  if ((await move("mk_push", ", fails = 0").run()).meta?.changes) tables.push("mk_push");
  if (await moveFor(env, u.id, was, sub)) tables.push("wx_devs");
  if ((await maybe(move("fx_push"))).meta?.changes) tables.push("fx_push");
  return tables;
}
export async function dropEverywhere(env, endpoint, { userId = null } = {}) {
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 1000) return [];
  const D = await ready(env), mine = userId ? " AND user_id = ?2" : "", bind = (q) => (userId ? q.bind(endpoint, userId) : q.bind(endpoint));
  const tables = [];
  const [pg, td, mk] = await D.batch(["pg_push", "td_push", "mk_push"].map((tb) => bind(D.prepare(`DELETE FROM ${tb} WHERE endpoint = ?1${mine}`))));
  if (pg.meta?.changes) tables.push("pg_push");
  if (td.meta?.changes) tables.push("td_push");
  if (mk.meta?.changes) tables.push("mk_push");
  if (userId ? await dropFor(env, userId, endpoint) : false) tables.push("wx_devs");
  if ((await maybe(bind(D.prepare(`DELETE FROM fx_push WHERE endpoint = ?1${mine}`)))).meta?.changes) tables.push("fx_push");
  return tables;
}

// ---- the account's other devices ----
// (an id for a sign-in that names it to its own account's page and nowhere else: a keyed hash of it, never the hash itself)
async function idFor(env, userId, hash) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(await serverSecret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`device|${userId}|${hash}`)))).slice(0, 16);
}
// Each of the account's sign-ins with a push row anywhere → Map(session hash → Set of apps)
async function pushSessions(D, userId) {
  const by = new Map(), add = (rows, app) => { for (const r of rows) if (r.s) { if (!by.has(r.s)) by.set(r.s, new Set()); by.get(r.s).add(app); } };
  const [pg, td, mk, wx, fx] = await Promise.all([
    rowsOf(D.prepare("SELECT DISTINCT session AS s FROM pg_push WHERE user_id = ?").bind(userId)),
    rowsOf(D.prepare("SELECT DISTINCT session AS s FROM td_push WHERE user_id = ?").bind(userId)),
    rowsOf(D.prepare("SELECT DISTINCT session AS s FROM mk_push WHERE user_id = ?").bind(userId)),
    rowsOf(D.prepare(`SELECT DISTINCT sess AS s FROM wx_devs WHERE user_id = ? AND sess IS NOT NULL AND dev NOT LIKE '${MAIL}%'`).bind(userId)),
    rowsOf(D.prepare("SELECT DISTINCT session AS s FROM fx_push WHERE user_id = ?").bind(userId)),
  ]);
  add(pg, "chat"); add(td, "today"); add(mk, "markets"); add(wx, "weather"); add(fx, "fitness");
  return by;
}
// (each of the account's devices getting Today's whose sign-in has ended: kept, but listed, so it can be stopped there)
const orphansQ = (D, u) => D.prepare("SELECT endpoint, added, ok_at FROM td_push p WHERE user_id = ? AND (session IS NULL OR NOT EXISTS (SELECT 1 FROM pg_sessions s WHERE s.hash = p.session))").bind(u.id);
const orphanId = (env, u, endpoint) => idFor(env, u.id, `push|${endpoint}`);
// (the other sign-ins, as the account's page knows them: not this one, nor the app's it was opened from, nor those
// opened from it)
const othersQ = (D, u) => D.prepare(`SELECT hash, label, home, apps, seen_at FROM pg_sessions WHERE user_id = ? AND ${OTHERS}`).bind(u.id, ...othersOf(u));
// "Weather on iPad": the app it's a Home Screen app of, or the one app it's used in, or the one app it has a push row for,
// on the kind of device its label says; otherwise its label as the account's page has it ("iPhone · Safari")
function labelOf(x, apps) {
  const used = String(x.apps || "").split(",").filter(Boolean), kind = String(x.label || "").split(" · ")[0];
  const app = (x.home && NAMES[x.home] ? x.home : null) || (used.length === 1 && NAMES[used[0]] ? used[0] : null) || (apps.length === 1 ? apps[0] : null);
  return app && kind ? `${NAMES[app]} on ${kind}` : x.label || "A phone or browser";
}
export async function otherDevices(env, u, { device = null } = {}) {
  const D = await ready(env), [by, ss, lone] = await Promise.all([pushSessions(D, u.id), rowsOf(othersQ(D, u)), rowsOf(orphansQ(D, u))]);
  const out = [];
  for (const x of ss) {
    const has = by.get(x.hash);
    if (!has) continue;
    const apps = APPS.map(([, app]) => app).filter((a) => has.has(a));
    out.push({ id: await idFor(env, u.id, x.hash), label: labelOf(x, apps), home: !!x.home, apps, at: x.seen_at ?? null });
  }
  for (const r of lone) {
    if (device && (await deviceHash(r.endpoint)) === device) continue;
    out.push({ id: await orphanId(env, u, r.endpoint), label: "A phone or browser", home: false, apps: ["today"], at: r.ok_at ?? r.added ?? null });
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}
export async function stopDevice(env, u, id) {
  if (typeof id !== "string" || !ID.test(id)) return null;
  const D = await ready(env);
  let hash = null;
  for (const x of await rowsOf(othersQ(D, u))) if ((await idFor(env, u.id, x.hash)) === id) { hash = x.hash; break; }
  // (one whose sign-in has ended: that device, everywhere it's this account's)
  if (!hash) for (const r of await rowsOf(orphansQ(D, u))) if ((await orphanId(env, u, r.endpoint)) === id) return dropEverywhere(env, r.endpoint, { userId: u.id });
  if (!hash) return null;
  // (its push rows in every app's table, its Weather device's places with it; the sign-in itself left alone)
  const tables = [];
  const [pg, td, mk] = await D.batch(["pg_push", "td_push", "mk_push"].map((tb) => D.prepare(`DELETE FROM ${tb} WHERE session = ?1 AND user_id = ?2`).bind(hash, u.id)));
  if (pg.meta?.changes) tables.push("pg_push");
  if (td.meta?.changes) tables.push("td_push");
  if (mk.meta?.changes) tables.push("mk_push");
  if (await dropSession(env, u.id, hash)) tables.push("wx_devs");
  if ((await maybe(D.prepare("DELETE FROM fx_push WHERE session = ?1 AND user_id = ?2").bind(hash, u.id))).meta?.changes) tables.push("fx_push");
  return tables;
}
// (this device, by the page's hash of its endpoint: the tables it's in, for this account)
async function hereOf(D, u, device) {
  const [td, pg, mk, wx, fx] = await Promise.all([
    rowsOf(D.prepare("SELECT endpoint FROM td_push WHERE user_id = ?").bind(u.id)),
    rowsOf(D.prepare("SELECT endpoint FROM pg_push WHERE user_id = ?").bind(u.id)),
    rowsOf(D.prepare("SELECT endpoint FROM mk_push WHERE user_id = ?").bind(u.id)),
    rowsOf(D.prepare(`SELECT endpoint FROM wx_devs WHERE user_id = ? AND dev NOT LIKE '${MAIL}%'`).bind(u.id)),
    rowsOf(D.prepare("SELECT endpoint FROM fx_push WHERE user_id = ?").bind(u.id)),
  ]);
  const lists = { td_push: td, pg_push: pg, mk_push: mk, wx_devs: wx, fx_push: fx }, here = [];
  for (const tb of HERE_ORDER) {
    for (const r of lists[tb]) if ((await deviceHash(r.endpoint)) === device) { here.push(tb); break; }
  }
  return here;
}

// ---- the routes' (functions/_todayapp.js, each checked there first) ----
export async function deviceAdd(env, u, body, { request } = {}) {
  const b = body && typeof body === "object" ? body : {};
  if (b.was !== undefined && b.was !== null) {
    if (typeof b.was !== "string" || !b.was || b.was.length > 1000) throw new HttpError(400, "Bad request.");
    return { ok: true, tables: await moveEverywhere(env, u, b.was, b.sub) };
  }
  return { ok: true, tables: await addEverywhere(env, u, b.sub, { fan: b.fan === true }) };
}
export async function deviceDrop(env, u, body) {
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string" || !endpoint || endpoint.length > 1000) throw new HttpError(400, "Bad request.");
  await dropEverywhere(env, endpoint, { userId: u.id });
  return { ok: true, on: !!(await lastOff(env, await tddb(env), u.id)) };
}
export async function devicesList(env, u, { device } = {}, { request } = {}) {
  const D = await ready(env);
  const mine = typeof device === "string" && DEVICE.test(device) ? device : null;
  const [here, devices] = await Promise.all([mine ? hereOf(D, u, mine) : [], otherDevices(env, u, { device: mine })]);
  return { fan: env.HUB_PUSH === "1", here, devices };
}
export async function devicesStop(env, u, body) {
  const id = body?.id;
  if (typeof id !== "string" || !ID.test(id)) throw new HttpError(400, "Bad request.");
  if (!(await stopDevice(env, u, id))) throw new HttpError(404, "That device wasn’t found.");
  await lastOff(env, await tddb(env), u.id);
  return { ok: true };
}
