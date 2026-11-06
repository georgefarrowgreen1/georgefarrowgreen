// Chat's friends and groups, kept from telling or pestering anyone, run as they are against a database of their own
// (Node's own SQLite in memory, made to look like D1, with the site's schema): a friend request taken back and sent again
// pushes once a day, not each time, and taking one back has its pace; a group never says you've been blocked (someone
// who's blocked you shows as anyone else who isn't a friend does), nor refuses two who've blocked each other (so whoever
// chose them can't learn of it); and a group, and each person's groups, never pass their most, however many add at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, issueSession, hex, sha256 } from "../../../functions/_pigeon.js";
import { onRequest } from "../../../functions/api/pigeon/[[path]].js";
import { GROUP_MAX } from "../../../functions/_groups.js";

// ---- D1, as much of it as the server uses: prepare, bind, first, all, run, raw, and batch (all or nothing) ----
function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => {
    const p = s.prepare(sql);
    if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } };
    const r = p.run(...val(args));
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args),
    raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, prepare: (q) => st(q), async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}

// ---- the push services, stood in for: each push kept, by the phone it's for ----
const PUSH = "http://push.test/push";
let pushes = [];
const realFetch = globalThis.fetch, said = console.error;
globalThis.fetch = async (url, o = {}) => {
  if (String(url) === PUSH) { pushes.push(o.headers["X-Endpoint"]); return new Response("", { status: 201 }); }
  return new Response("{}", { status: 404 });
};
console.error = () => {};
test.after(() => { globalThis.fetch = realFetch; console.error = said; });

const env = { DB: d1(), WX_TRAFFIC_TICK: "0", PIGEON_PUSH_URL: PUSH };
await db(env);
const S = env.DB.sql;
S.prepare("INSERT OR REPLACE INTO pg_meta (k, v) VALUES ('tick', '99999999999999'), ('notify_since', '0')").run();
const put = (table, row) => S.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...Object.values(row));
const one = (sql, ...a) => S.prepare(sql).get(...a);

let n = 0;
async function person(name) {
  const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  put("pg_users", { id, handle: `g${n}`, name, email: `${id}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0, lat: 51.5, lon: -0.12 });
  return { id, name, handle: `g${n}`, token: await issueSession(env, id, new Request("http://localhost/")) };
}
const befriend = (a, ...bs) => { for (const b of bs) put("pg_links", { a: a.id, b: b.id, status: "ok", created_at: 0 }); };
async function pushOn(p) {
  p.endpoint = `https://fcm.googleapis.com/fcm/send/guard-${p.id}`;
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  put("pg_push", { endpoint: p.endpoint, user_id: p.id, session: hex(await sha256(p.token)), p256dh: Buffer.from(await crypto.subtle.exportKey("raw", k.publicKey)).toString("base64url"),
    auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url"), created_at: Date.now() });
  return p;
}
const pushesTo = (p) => pushes.filter((e) => e === p.endpoint).length;

// the API, as the app asks it
async function api(p, method, path, body, e = env) {
  const later = [], request = new Request(`http://localhost/api/pigeon/${path}`, { method, headers: { Authorization: `Bearer ${p.token}`, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const res = await onRequest({ request, env: e, waitUntil: (x) => later.push(x), params: {} });
  await Promise.allSettled(later);
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ================================ friend requests ================================
test("a friend request taken back and sent again, over and over, pushes once in a day, not each time", async () => {
  const amy = await person("Amy"), ben = await pushOn(await person("Ben"));
  for (let i = 0; i < 4; i++) {
    const r = await api(amy, "POST", "friends", { handle: ben.handle });
    assert.match(r.body.message, /Request sent/);
    assert.equal((await api(amy, "DELETE", "friends", { id: ben.id })).status, 200);
  }
  assert.equal(pushesTo(ben), 1, "one push, for the first");
  // (someone else asking is told as ever)
  const cal = await person("Cal");
  await api(cal, "POST", "friends", { handle: ben.handle });
  assert.equal(pushesTo(ben), 2);
});
test("taking requests back (and friends off) has its pace", async () => {
  const dee = await person("Dee"), eve = await person("Eve");
  let last;
  for (let i = 0; i < 41; i++) last = await api(dee, "DELETE", "friends", { id: eve.id });
  assert.equal(last.status, 429);
});

// ================================ groups ================================
const groupOf = async (p, gid) => (await api(p, "GET", "sync")).body.groups.find((g) => g.id === gid);
const memberIn = (g, p) => g.members.find((m) => m.id === p.id);
test("blocked by someone in a group you share: they show as anyone else who isn’t a friend does; whom you’ve blocked shows only by name", async () => {
  const amy = await person("Amy"), ben = await person("Ben"), cal = await person("Cal"), dan = await person("Dan");
  befriend(amy, ben, cal, dan);
  const g = (await api(amy, "POST", "groups", { name: "Walks", members: [ben.id, cal.id, dan.id] })).body.group;
  assert.equal((await api(cal, "POST", "block", { id: ben.id })).status, 200);
  const bens = await groupOf(ben, g.id), calToBen = memberIn(bens, cal), danToBen = memberIn(bens, dan);
  assert.deepEqual(Object.keys(calToBen).sort(), Object.keys(danToBen).sort(), "the one who blocked Ben looks like any other who isn’t his friend");
  assert.equal(calToBen.avatarAt, danToBen.avatarAt);
  assert.equal(calToBen.km, danToBen.km);
  assert.notEqual(calToBen.km, null);
  // (and Cal, who blocked him, sees nothing of Ben but his name)
  const benToCal = memberIn(await groupOf(cal, g.id), ben);
  assert.equal(benToCal.km, null);
  assert.equal("onMoon" in benToCal, false);
});
test("two who’ve blocked each other, chosen for a group: it’s made, with no word of a block", async () => {
  const amy = await person("Amy"), ben = await person("Ben"), cal = await person("Cal"), dan = await person("Dan");
  befriend(amy, ben, cal, dan);
  await api(cal, "POST", "block", { id: ben.id });
  const made = await api(amy, "POST", "groups", { name: "Supper", members: [ben.id, cal.id] });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal(made.body.group.members.length, 3);
  // …and added to one later, likewise
  const g = (await api(amy, "POST", "groups", { name: "Later", members: [ben.id, dan.id] })).body.group;
  const added = await api(amy, "POST", "group-add", { id: g.id, members: [cal.id] });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.equal(added.body.group.members.length, 4);
});
test("two adding to a group at once never take it past its most", async () => {
  const amy = await person("Amy"), others = [];
  for (let i = 0; i < GROUP_MAX + 1; i++) others.push(await person(`P${i}`));
  befriend(amy, ...others);
  const g = (await api(amy, "POST", "groups", { name: "Full", members: others.slice(0, GROUP_MAX - 2).map((p) => p.id) })).body.group;
  assert.equal(g.members.length, GROUP_MAX - 1);
  // (someone else's add lands between this one's count and its writing: as two at once would)
  let raced = false;
  const DB = env.DB, sly = { ...DB, batch: async (list) => {
    if (!raced) { raced = true; put("pg_group_members", { group_id: g.id, user_id: others[GROUP_MAX - 1].id, added_by: amy.id, joined_at: Date.now() - 1 }); }
    return DB.batch(list);
  } };
  const r = await api(amy, "POST", "group-add", { id: g.id, members: [others[GROUP_MAX].id] }, { ...env, DB: sly });
  assert.equal(raced, true);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_group_members WHERE group_id = ?", g.id).n, GROUP_MAX, "no more than its most");
  assert.equal(r.status, 409);
  assert.equal(r.body.error, `Groups can have up to ${GROUP_MAX} people.`);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_gevents WHERE group_id = ? AND kind = 'add' AND target = ?", g.id, others[GROUP_MAX].id).n, 0, "and no line saying they were added");
});
test("nor anyone past the most groups they can be in", async () => {
  const amy = await person("Amy"), ben = await person("Ben"), cal = await person("Cal");
  befriend(amy, ben, cal);
  const g = (await api(amy, "POST", "groups", { name: "One more", members: [cal.id] })).body.group;
  // Ben in 49 groups, then a 50th lands between this add's count and its writing
  const t = Date.now();
  for (let i = 0; i < 49; i++) { const id = crypto.randomUUID(); put("pg_groups", { id, name: `G${i}`, created_by: cal.id, created_at: t }); put("pg_group_members", { group_id: id, user_id: ben.id, added_by: cal.id, joined_at: t }); }
  let raced = false;
  const DB = env.DB, sly = { ...DB, batch: async (list) => {
    if (!raced) { raced = true; const id = crypto.randomUUID(); put("pg_groups", { id, name: "G49", created_by: cal.id, created_at: t }); put("pg_group_members", { group_id: id, user_id: ben.id, added_by: cal.id, joined_at: t }); }
    return DB.batch(list);
  } };
  const r = await api(amy, "POST", "group-add", { id: g.id, members: [ben.id] }, { ...env, DB: sly });
  assert.equal(raced, true);
  assert.equal(r.status, 409);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_group_members WHERE user_id = ?", ben.id).n, 50);
  assert.equal(one("SELECT COUNT(*) AS n FROM pg_group_members WHERE group_id = ? AND user_id = ?", g.id, ben.id).n, 0);
});
