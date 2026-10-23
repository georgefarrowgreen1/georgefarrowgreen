/* ---------- keeping only what's needed ----------
   Run from the tick (functions/_notify.js), a few times an hour.

   - A message goes 30 days after it lands (or is lost, or called back), for everyone: its words, its photo, its
     way, its reactions, its moments. What its pigeon did stays, one line per pigeon in pg_flights (how far, how
     long, what kind, how it fared, whether it went round storms or sheltered or took a ship, its space legs), so
     the flight log, badges, rare pigeons, seasons and passport don't change. A flight is stamped in its sender's
     passport, and a named pigeon's career settled, before its message goes (a flight that can't be, a group
     pigeon to someone who isn't their friend say, waits up to 45 days).
   - A group's history (joins, leaves, renames) goes after 30 days, with its messages; the admin log after 180.
   - Files in storage (R2) that nothing points to any more (a photo whose message was never saved, an old profile
     picture) are found and deleted, a page at a time.
   - An account nobody has signed in to for a year is deleted, after an email a week before saying so. Signing in
     (or the app checking in) in that week keeps it. */
import { DAY, MIN, groupPhotoKey, adminLog, londonDay } from "./_pigeon.js";
import { sendEmail, emailReady, emailBody, accountLink } from "./_email.js";
import { stampPassports } from "./_passport.js";
import { settleBirds } from "./_birds.js";
import { removeAccount } from "./_accounts.js";

export const KEEP_MS = 30 * DAY;
const GRACE_MS = 45 * DAY, GEVENTS_MS = 30 * DAY, ADMIN_LOG_MS = 180 * DAY;
export const IDLE_MS = 365 * DAY, WARN_MS = 7 * DAY;
const EVERY = 10 * MIN, BATCH = 100;

// (pg_flights, one line per pigeon kept after its message has gone: its table is in functions/_pigeon.js)

// What its way says, for the log, worked out by the database from the way itself (legs: [lat, lon, at, what, …]):
// went round storms, time sheltering (a shelter's two ends are the same spot), crossed by ship; and its space legs
// without the Earth part it flew first (only for its passport, stamped by now)
const at = (v, i) => `json_extract(${v}.value, '$[${i}]')`;
export const WAY_PARTS = (legs) => [
  `CASE WHEN json_valid(${legs}) THEN EXISTS (SELECT 1 FROM json_each(${legs}) l WHERE ${at("l", 3)} = 's' OR (${at("l", 3)} = 'r' AND ${at("l", 4)} = 's')) ELSE 0 END`,
  `CASE WHEN json_valid(${legs}) THEN (SELECT COALESCE(SUM(${at("b", 2)} - ${at("a", 2)}), 0) FROM json_each(${legs}) a JOIN json_each(${legs}) b ON b.key = a.key + 1
    WHERE ${at("a", 3)} = 'h' AND ${at("b", 3)} = 'h' AND ${at("a", 0)} = ${at("b", 0)}) ELSE 0 END`,
  `CASE WHEN json_valid(${legs}) THEN EXISTS (SELECT 1 FROM json_each(${legs}) l WHERE ${at("l", 3)} = 'b') ELSE 0 END`];
// (a way blurred a month after landing, functions/_notify.js blurOld, keeps what it said in w_dodged / w_shelter / w_ship)
const WAY = (legs, p = "") => WAY_PARTS(legs).map((x, i) => `COALESCE(${p}${["w_dodged", "w_shelter", "w_ship"][i]}, ${x})`).join(",\n  ");
const MOON = (m) => `CASE WHEN json_valid(${m}) THEN json_remove(${m}, '$.ground', '$.prev.ground') END`;
const COLS = "id, msg_id, sender, recipient, grp, group_id, pigeon, km, sent_at, deliver_at, lost_at, recalled, wind, from_place, to_place, risky, from_lon, to_lon, wx_ms, dodged, shelter_ms, ship, moon";
const done = (cut, p = "") => `((${p}lost_at IS NOT NULL AND ${p}lost_at < ${cut}) OR (${p}lost_at IS NULL AND ${p}deliver_at < ${cut}))`;
// (the messages going this run, as one JSON list: however many, each step below is one statement)
const IDS = "(SELECT value FROM json_each(?1))";

// Messages over a month old: their pigeons' lines kept, then the messages and everything hung on them gone.
export async function keepMonth(env, D, t, batch = BATCH) {
  const cut = t - KEEP_MS, grace = t - GRACE_MS;
  // (careers settled and passports stamped first: the oldest flights go first, so these get to them)
  await settleBirds(D, t).catch(() => {});
  for (let i = 0; i < 4 && (await stampPassports(D, t, null, 25).catch(() => 0)) === 25; i++);
  let n = 0;
  // one to one
  const { results: one } = await D.prepare(`SELECT id, photo FROM pg_msgs m WHERE ${done("?1")} AND sent_at < ?1
    AND (lost_at IS NOT NULL OR deliver_at < ?2 OR EXISTS (SELECT 1 FROM pg_stamped s WHERE s.id = m.id))
    AND (bird IS NULL OR bird_done IS NOT NULL OR deliver_at < ?2) LIMIT ?3`).bind(cut, grace, batch).all();
  if (one.length) {
    const ids = JSON.stringify(one.map((m) => m.id));
    await D.batch([
      D.prepare(`INSERT OR IGNORE INTO pg_flights (${COLS}) SELECT id, id, sender, recipient, 0, NULL, pigeon, km, sent_at, deliver_at, lost_at, recalled, wind,
        from_place, to_place, risky, from_lon, to_lon, wx_ms, ${WAY("legs")}, ${MOON("moon")} FROM pg_msgs WHERE id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_reacts WHERE msg_id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_near WHERE a IN ${IDS} OR b IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_flyover WHERE msg_id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_stamped WHERE id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_msgs WHERE id IN ${IDS}`).bind(ids),
    ]);
    const photos = one.filter((m) => m.photo === 1).map((m) => `pigeon/${m.id}`);
    if (photos.length && env.BIO_R2) await env.BIO_R2.delete(photos).catch(() => {});
    n += one.length;
  }
  // groups: once every one of a message's pigeons is done with
  const { results: grp } = await D.prepare(`SELECT m.id, m.photo FROM pg_gmsgs m WHERE m.sent_at < ?1
    AND NOT EXISTS (SELECT 1 FROM pg_gdeliv d WHERE d.msg_id = m.id AND NOT ${done("?1", "d.")})
    AND NOT EXISTS (SELECT 1 FROM pg_gdeliv d WHERE d.msg_id = m.id AND d.lost_at IS NULL AND d.deliver_at >= ?2
      AND NOT EXISTS (SELECT 1 FROM pg_stamped s WHERE s.id = m.id || ':' || d.user_id))
    AND (m.bird IS NULL OR m.bird_done IS NOT NULL OR m.sent_at < ?2) LIMIT ?3`).bind(cut, grace, Math.max(1, batch >> 2)).all();
  if (grp.length) {
    const ids = JSON.stringify(grp.map((m) => m.id));
    await D.batch([
      // (no place it went for a group pigeon: it could be someone who isn't the sender's friend)
      D.prepare(`INSERT OR IGNORE INTO pg_flights (${COLS}) SELECT m.id || ':' || d.user_id, m.id, m.sender, d.user_id, 1, m.group_id, m.pigeon, d.km, m.sent_at,
        d.deliver_at, d.lost_at, d.recalled, d.wind, m.from_place, NULL, m.risky, m.from_lon, d.to_lon, d.wx_ms, ${WAY("d.legs", "d.")}, ${MOON("d.moon")}
        FROM pg_gdeliv d JOIN pg_gmsgs m ON m.id = d.msg_id WHERE m.id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_reacts WHERE msg_id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_flyover WHERE msg_id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_stamped WHERE id IN (SELECT d.msg_id || ':' || d.user_id FROM pg_gdeliv d WHERE d.msg_id IN ${IDS})`).bind(ids),
      D.prepare(`DELETE FROM pg_gdeliv WHERE msg_id IN ${IDS}`).bind(ids),
      D.prepare(`DELETE FROM pg_gmsgs WHERE id IN ${IDS}`).bind(ids),
    ]);
    const photos = grp.filter((m) => m.photo === 1).map((m) => groupPhotoKey(m.id));
    if (photos.length && env.BIO_R2) await env.BIO_R2.delete(photos).catch(() => {});
    n += grp.length;
  }
  // a group's history goes with its messages; the admin's after six months
  await D.batch([D.prepare("DELETE FROM pg_gevents WHERE at < ?").bind(t - GEVENTS_MS), D.prepare("DELETE FROM pg_admin_log WHERE at < ?").bind(t - ADMIN_LOG_MS),
    D.prepare("DELETE FROM pg_active WHERE day < ?").bind(londonDay(t) - 60)]).catch(() => {});        // (days used: 60 kept)
  return n;
}

// An account going (functions/_accounts.js): the pigeons its friends sent it that have landed stay in their senders'
// logs as lines, unnamed, as older ones already do
export const keepSentTo = (D, id, t) => D.prepare(`INSERT OR IGNORE INTO pg_flights (${COLS}) SELECT id, id, sender, NULL, 0, NULL, pigeon, km, sent_at, deliver_at,
  lost_at, recalled, wind, from_place, to_place, risky, from_lon, to_lon, wx_ms, ${WAY("legs")}, ${MOON("moon")} FROM pg_msgs WHERE recipient = ?1 AND sender != ?1 AND ${done("?2")}`).bind(id, t);

// Files nothing points to: a page of storage looked through each run (where it got to kept in pg_meta), each file
// checked against what should have it. Only files over a day old, so one being sent right now is never touched.
const OWNERS = [
  ["pigeon/", (D, ids) => D.prepare(`SELECT id FROM pg_msgs WHERE photo = 1 AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids)],
  ["pigeon-g/", (D, ids) => D.prepare(`SELECT id FROM pg_gmsgs WHERE photo = 1 AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids)],
  ["pigeon-avatars/", (D, ids) => D.prepare(`SELECT id FROM pg_users WHERE avatar_at IS NOT NULL AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids)],
];
export async function sweepFiles(env, D, t, page = 500) {
  if (!env.BIO_R2) return 0;
  const at = JSON.parse((await D.prepare("SELECT v FROM pg_meta WHERE k = 'r2_sweep'").first())?.v || "{}");
  let i = at.i || 0, cursor = at.c || undefined, gone = 0;
  const [prefix, owner] = OWNERS[i % OWNERS.length];
  const list = await env.BIO_R2.list({ prefix, cursor, limit: page });
  const old = list.objects.filter((o) => t - new Date(o.uploaded).getTime() > DAY);
  if (old.length) {
    const ids = old.map((o) => o.key.slice(prefix.length));
    const kept = new Set();
    for (let k = 0; k < ids.length; k += 90) for (const r of (await owner(D, ids.slice(k, k + 90)).all()).results) kept.add(r.id);
    const orphans = old.filter((o) => !kept.has(o.key.slice(prefix.length))).map((o) => o.key);
    for (let k = 0; k < orphans.length; k += 900) await env.BIO_R2.delete(orphans.slice(k, k + 900));
    gone = orphans.length;
  }
  // on to the next page, or the next kind of file
  const next = list.truncated ? { i, c: list.cursor } : { i: (i + 1) % OWNERS.length };
  await D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('r2_sweep', ?)").bind(JSON.stringify(next)).run();
  return gone;
}

// When someone was last about: the app checking in, or any of their sign-ins being used (or signing up)
const lastOf = (u) => `MAX(COALESCE(${u}.seen_at, 0), COALESCE(${u}.created_at, 0), COALESCE((SELECT MAX(s.seen_at) FROM pg_sessions s WHERE s.user_id = ${u}.id), 0))`;
const LAST = lastOf("u");
export async function idleAccounts(env, D, t, origin) {
  let warned = 0, deleted = 0;
  // a week to go: an email, once
  if (emailReady(env)) {
    const { results } = await D.prepare(`SELECT u.id, u.name, u.handle, u.email, ${LAST} AS last FROM pg_users u
      WHERE u.warned_at IS NULL AND u.email IS NOT NULL AND ${LAST} < ?1 LIMIT 10`).bind(t - (IDLE_MS - WARN_MS)).all();
    for (const u of results) {
      // (never a day already gone: one long unused, or emails that were off for a while, still gets its week)
      const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(Math.max(u.last + IDLE_MS, t + WARN_MS));
      // (the account's, so from "Account": it goes with everything every app keeps)
      const { text, html } = emailBody({ origin, icon: "trash", brand: "account", title: "Your account will be deleted soon",
        preheader: `It hasn’t been used for almost a year, so it will be deleted on ${when}.`,
        lines: [`Hi ${String(u.name || "").split(/\s+/)[0] || "there"}, nobody has signed in to your account for almost a year, so it will be deleted on ${when}, with everything kept with it in every app on the site.`,
          "To keep it, just sign in before then, to your account or to any app on the site."],
        pill: ["clock", `On ${when}`], rows: [["Account", `@${u.handle}`]],
        button: { label: "Keep my account", url: `${accountLink(origin)}/` }, footer: "If you’d like it deleted, you don’t need to do anything." });
      try { await sendEmail(env, { to: u.email, subject: "Your account will be deleted soon", text, html, brand: "account" }); }
      catch (_) { continue; }                                     // (not warned, so not deleted: tried again next time)
      await D.prepare("UPDATE pg_users SET warned_at = ? WHERE id = ?").bind(t, u.id).run();
      await adminLog(env, "idle-warned", u.id, `@${u.handle}`).catch(() => {});
      warned++;
    }
  }
  // a year, and warned at least six days ago without coming back since
  const { results: idle } = await D.prepare(`SELECT u.id, u.handle FROM pg_users u WHERE u.warned_at IS NOT NULL AND u.warned_at < ?1 AND ${LAST} < ?2 AND ${LAST} < u.warned_at LIMIT 1`)
    .bind(t - WARN_MS + DAY, t - IDLE_MS).all();
  for (const u of idle) { await removeAccount(env, u.id); await adminLog(env, "idle-deleted", u.id, `@${u.handle}`).catch(() => {}); deleted++; }
  // back in time: the warning is forgotten, so a later year away warns again
  await D.prepare(`UPDATE pg_users SET warned_at = NULL WHERE warned_at IS NOT NULL AND ${lastOf("pg_users")} > warned_at`).run().catch(() => {});
  return { warned, deleted };
}

// Accounts whose owners asked for them to be deleted, a week on (functions/api/account), and not kept since
export async function dueDeletions(env, D, t) {
  const { results } = await D.prepare("SELECT id, handle FROM pg_users WHERE delete_at IS NOT NULL AND delete_at <= ? LIMIT 5").bind(t).all();
  for (const u of results) { await removeAccount(env, u.id); await adminLog(env, "deleted", u.id, `@${u.handle}`).catch(() => {}); }
  return results.length;
}

// All of it, at most every ten minutes
export async function housekeeping(env, D, t, origin) {
  // claimed in one step, so two ticks at once can't both run it (and send the same warning twice)
  await D.prepare("INSERT OR IGNORE INTO pg_meta (k, v) VALUES ('keep_at', '0')").run();
  const claim = await D.prepare("UPDATE pg_meta SET v = ?1 WHERE k = 'keep_at' AND CAST(v AS INTEGER) <= ?2").bind(String(t), t - EVERY).run();
  if (!claim.meta?.changes) return null;
  const purged = await keepMonth(env, D, t).catch((e) => { console.error("pigeon keep", e && e.message); return 0; });
  const files = await sweepFiles(env, D, t).catch((e) => { console.error("pigeon files", e && e.message); return 0; });
  const accounts = await idleAccounts(env, D, t, origin).catch((e) => { console.error("pigeon idle", e && e.message); return {}; });
  const asked = await dueDeletions(env, D, t).catch((e) => { console.error("pigeon deletions", e && e.message); return 0; });
  return { purged, files, ...accounts, asked };
}

// The admin's look at what's kept: rows in each table, the database's size, and the files in storage
export const TABLES = ["pg_users", "pg_msgs", "pg_gmsgs", "pg_gdeliv", "pg_flights", "pg_reacts", "pg_near", "pg_flyover", "pg_stamped", "pg_passport", "pg_postmarks",
  "pg_feathers", "pg_birds", "pg_links", "pg_groups", "pg_group_members", "pg_gevents", "pg_sessions", "pg_push", "pg_passkeys", "pg_streaks", "pg_ids",
  "pg_limits", "pg_wxcache", "pg_admin_log", "pg_vanish", "pg_invites", "pg_active"];
export async function storageReport(env, D, t) {
  const res = await D.batch(TABLES.map((x) => D.prepare(`SELECT COUNT(*) AS n FROM ${x}`)));
  const tables = TABLES.map((name, i) => ({ name, rows: res[i].results?.[0]?.n ?? 0 })).sort((a, b) => b.rows - a.rows);
  const sizes = await D.prepare(`SELECT
      (SELECT COALESCE(SUM(LENGTH(ct)), 0) FROM pg_msgs) + (SELECT COALESCE(SUM(LENGTH(body)), 0) FROM pg_gmsgs) AS words,
      (SELECT COALESCE(SUM(LENGTH(legs)), 0) FROM pg_msgs) + (SELECT COALESCE(SUM(LENGTH(legs)), 0) FROM pg_gdeliv) AS ways,
      (SELECT COUNT(*) FROM pg_msgs WHERE ${done("?1")}) + (SELECT COUNT(*) FROM pg_gmsgs m WHERE m.sent_at < ?1
        AND NOT EXISTS (SELECT 1 FROM pg_gdeliv d WHERE d.msg_id = m.id AND NOT ${done("?1", "d.")})) AS due,
      (SELECT COUNT(*) FROM pg_users u WHERE u.warned_at IS NOT NULL) AS warned`).bind(t - KEEP_MS).first().catch(() => ({}));
  // the whole database's size, as D1 reports it after any statement
  const probe = await D.prepare("SELECT 1").run().catch(() => null);
  const files = [];
  if (env.BIO_R2) for (const [prefix] of [...OWNERS, ["bg/"]]) {
    let n = 0, bytes = 0, cursor, pages = 0, more = true;
    while (more && pages < 20) {
      const l = await env.BIO_R2.list({ prefix, cursor, limit: 1000 }); pages++;
      for (const o of l.objects) { n++; bytes += o.size || 0; }
      more = l.truncated; cursor = l.cursor;
    }
    files.push({ prefix, n, bytes, more });
  }
  const meta = Object.fromEntries((await D.prepare("SELECT k, v FROM pg_meta WHERE k IN ('keep_at', 'r2_sweep')").all()).results.map((r) => [r.k, r.v]));
  // (the files' size as of now, for Admin's figures, which don't count them themselves: functions/api/pigeon adminSummary)
  await D.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('files_size', ?)").bind(JSON.stringify({ bytes: files.reduce((a, f) => a + f.bytes, 0), at: t })).run().catch(() => {});
  return { at: t, dbBytes: probe?.meta?.size_after ?? null, tables, words: sizes.words ?? null, ways: sizes.ways ?? null, due: sizes.due ?? null,
    warned: sizes.warned ?? null, files, keptAt: meta.keep_at ? Number(meta.keep_at) : null, keepDays: KEEP_MS / DAY, idleDays: IDLE_MS / DAY };
}
