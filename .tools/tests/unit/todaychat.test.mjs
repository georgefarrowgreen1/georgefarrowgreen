// InFlite Today's Chat card (functions/_todaychat.js) can't leak a letter: against a real database (node:sqlite, made to
// look like D1, with Chat's own schema, functions/_pigeon.js), pigeons whose sealed parts carry markers, and the
// pigeons Today must never show (one lost already, one booked and not yet taken off, one from someone blocked, one
// from someone who's only asked to be a friend). Nothing sealed, nothing about a photo, nothing about a loss to come
// leaves; a mystery pigeon's kind isn't told to whoever it's flying to; only CHAT_COLUMNS are ever read. And the
// morning's lines (functions/_todaymorning.js) made from that card carry none of it either. And a friend's picture, for
// friends only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { db } from "../../../functions/_pigeon.js";
import { chatCard, CHAT_COLUMNS, GROUP_COLUMNS, waitingFor, wroteWhile } from "../../../functions/_todaychat.js";
import { avatarFor } from "../../../functions/_todaycards.js";
import { avatarKey } from "../../../functions/_profile.js";
import { morningLines } from "../../../functions/_todaymorning.js";

const sql = new DatabaseSync(":memory:"), asked = [];
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const pictures = new Set();
const env = {
  DB: { prepare: (q) => { asked.push(q); return st(q); },
    batch: async (list) => { sql.exec("BEGIN"); try { const out = []; for (const s of list) out.push(await s.all()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } },
  BIO_R2: { get: async (k) => (pictures.has(k) ? { body: "jpeg" } : null) },
};
await db(env);
const put = (table, row) => sql.prepare(`INSERT INTO ${table} (${Object.keys(row).join(", ")}) VALUES (${Object.keys(row).map(() => "?").join(", ")})`).run(...val(Object.values(row)));
const H = 3600e3, DAY = 864e5, T = Date.UTC(2026, 10, 2, 8, 10);
const LINKS = { chat: "https://chat.inflite.ai", weather: "https://weather.inflite.ai", fitness: "https://fitness.inflite.ai", finance: "https://finance.inflite.ai", account: "https://account.inflite.ai", auth: "https://auth.inflite.ai" };
const ctx = { only: ["chat"], t: T, request: null, purpose: "page", tz: "Europe/London", links: LINKS, memo: null };
const id = (n) => `b1c2d3e4-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const ME = id(0), SAM = id(1), MUM = id(2), LEO = id(3), BAD = id(4), ASKER = id(5), STRANGER = id(6);
const user = (uid, name, x = {}) => put("pg_users", { id: uid, handle: `h${uid.slice(-2)}`, name, email: `${uid}@example.com`, pub: "{}", salt: "s", proof_hash: "p", vault: "v", swift: 9, swift_at: 0, created_at: 0, ...x });
user(ME, "Alex Morgan"); user(SAM, 'Sam "Q" & O\'Neil', { avatar_at: 1780000000000 }); user(MUM, "Mum"); user(LEO, "Leo Park"); user(BAD, "Blocked Person"); user(ASKER, "Asking Person"); user(STRANGER, "Someone Else");
const link = (a, b, status = "ok") => put("pg_links", { a, b, status, created_at: 0 });
link(ME, SAM); link(MUM, ME); link(ME, LEO); link(ME, BAD, "blocked"); link(ASKER, ME, "pending");
// every pigeon's sealed parts carry a marker, and its photo, its view-once and its stopover the rest
const SEALED = { ct: "SECRET-CT", via_ct: "SECRET-VIA", via_note: "SECRET-NOTE", photo: 1, photo_size: 98765, once: 1, via: LEO, via_place: "SECRET-VIAPLACE", via_at: T - H, via_off: 0,
  legs: "[[48.8,2.3,1793600000000]]", wx: "SECRET-WX", wx_ms: 1234, risky: 1 };
const MARKERS = ["SECRET-CT", "SECRET-VIA", "SECRET-NOTE", "SECRET-VIAPLACE", "SECRET-WX", "98765"];
const msg = (mid, x) => put("pg_msgs", { id: mid, km: 343.4, sent_at: T - 2 * H, deliver_at: T + 2 * H, from_lat: 48.85, from_lon: 2.35, from_place: "Paris", to_lat: 51.5, to_lon: -0.12, to_place: "London", ...SEALED, ...x });
msg("in-swift", { sender: SAM, recipient: ME, swift: 1, pigeon: "swift", bird: "b1", bird_name: "Biscuit", bird_rank: "Navigator", deliver_at: T + 1 * H });
msg("in-mystery", { sender: MUM, recipient: ME, pigeon: "rocket", mystery: 1, from_place: "Inverness", deliver_at: T + 3 * H });
msg("in-doomed", { sender: LEO, recipient: ME, pigeon: "turbo", lost_at: T + H, deliver_at: T + 4 * H, from_place: "DOOMED-PLACE" });
msg("in-lost", { sender: SAM, recipient: ME, lost_at: T - H, deliver_at: T + 5 * H, from_place: "LOST-PLACE" });
msg("in-booked", { sender: SAM, recipient: ME, sched: 1, sent_at: T + H, deliver_at: T + 6 * H, from_place: "BOOKED-PLACE" });
msg("in-blocked", { sender: BAD, recipient: ME, from_place: "BLOCKED-PLACE" });
msg("in-asker", { sender: ASKER, recipient: ME, from_place: "ASKER-PLACE" });
// landed and not read: two from Leo, one from Sam read, one lost on the way, one from someone blocked
msg("ld-leo1", { sender: LEO, recipient: ME, sent_at: T - 5 * H, deliver_at: T - 2 * H });
msg("ld-leo2", { sender: LEO, recipient: ME, sent_at: T - 4 * H, deliver_at: T - H });
msg("ld-read", { sender: SAM, recipient: ME, sent_at: T - 5 * H, deliver_at: T - 3 * H, read_at: T - 2 * H });
msg("ld-lost", { sender: MUM, recipient: ME, sent_at: T - 5 * H, deliver_at: T - 3 * H, lost_at: T - 4 * H });
msg("ld-blocked", { sender: BAD, recipient: ME, sent_at: T - 5 * H, deliver_at: T - 3 * H });
// mine in the air: a mystery rocket to Leo; one booked for later (not yet taken off); one to someone blocked
msg("my-mystery", { sender: ME, recipient: LEO, pigeon: "rocket", mystery: 1, to_place: "<b>x</b>", bird: "b9", bird_name: "O'Brien", bird_rank: "Courier", deliver_at: T + 7 * H });
msg("my-booked", { sender: ME, recipient: SAM, sched: 1, sent_at: T + 2 * H, deliver_at: T + 8 * H, to_place: "MYBOOKED-PLACE" });
msg("my-blocked", { sender: ME, recipient: BAD, to_place: "MYBLOCKED-PLACE" });
// streaks (UTC days): Mum's 12 days, nothing yet today; Sam's 5, flown today; one with someone blocked, longest of all
put("pg_meta", { k: "streaks_v1", v: "1" });
const today = Math.floor(T / DAY);
put("pg_streaks", { a: [ME, MUM].sort()[0], b: [ME, MUM].sort()[1], start: today - 12, last: today - 1, best: 19 });
put("pg_streaks", { a: [ME, SAM].sort()[0], b: [ME, SAM].sort()[1], start: today - 4, last: today, best: 5 });
put("pg_streaks", { a: [ME, BAD].sort()[0], b: [ME, BAD].sort()[1], start: today - 40, last: today - 1, best: 40 });

const FORBIDDEN = new Set(["ct", "via_ct", "via_note", "viaNote", "note", "body", "wrap", "photo", "photoSize", "once", "lost", "lostAt", "sched", "scheduled", "waiting"]);
const keysIn = (v, out = []) => { if (Array.isArray(v)) v.forEach((x) => keysIn(x, out)); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); keysIn(x, out); } return out; };

test("CHAT_COLUMNS is exactly the allowlist", () => {
  assert.deepEqual(CHAT_COLUMNS, ["sender", "recipient", "sent_at", "deliver_at", "km", "pigeon", "swift", "mystery", "bird_name", "bird_rank", "from_place", "to_place", "read_at", "instant"]);
});

test("nothing sealed leaves: no letter, no stopover's note, nothing about a photo, nor anything that says a pigeon will be lost", async () => {
  asked.length = 0;
  const card = await chatCard(env, { id: ME }, ctx), json = JSON.stringify(card);
  for (const m of MARKERS) assert.ok(!json.includes(m), `no ${m}`);
  const bad = keysIn(card).filter((k) => FORBIDDEN.has(k));
  assert.deepEqual(bad, [], "no key that names a sealed or hidden part");
  assert.equal(card.state, "ok");
  // (only what's allowed was asked for: every column of pg_msgs selected is in CHAT_COLUMNS)
  const msgQs = asked.filter((q) => /\bpg_msgs\b/.test(q));
  assert.ok(msgQs.length >= 3, "the card asked about pigeons");
  for (const q of msgQs) {
    const list = /SELECT\s+([\s\S]*?)\s+FROM\s+pg_msgs/i.exec(q)?.[1] || "";
    assert.ok(!/\*/.test(list.replace(/COUNT\(\*\)/g, "")), `no * in ${list}`);
    for (const [, c] of list.matchAll(/\bm\.(\w+)/g)) assert.ok(CHAT_COLUMNS.includes(c), `m.${c} isn't in CHAT_COLUMNS`);
    for (const c of ["ct", "via_ct", "via_note", "photo", "photo_size", "once", "lost_at", "sched", "legs", "via", "via_place", "wx"]) assert.ok(!new RegExp(`\\bm\\.${c}\\b`).test(list), `${c} never selected`);
  }
});

test("the pigeons Today must never show aren't there: lost already, booked and not taken off, from someone blocked or only asking; one to be lost later is in the air like any other", async () => {
  const card = await chatCard(env, { id: ME }, ctx), json = JSON.stringify(card);
  for (const p of ["LOST-PLACE", "BOOKED-PLACE", "BLOCKED-PLACE", "ASKER-PLACE", "MYBOOKED-PLACE", "MYBLOCKED-PLACE"]) assert.ok(!json.includes(p), `not ${p}`);
  for (const who of [BAD, ASKER, STRANGER]) assert.ok(!json.includes(who), `nothing from or to ${who}`);
  assert.deepEqual(card.inbound.map((x) => x.from), ["Paris", "Inverness", "DOOMED-PLACE"], "soonest first");
  assert.deepEqual([card.inboundTotal, card.inboundFrom], [3, 3], "how many on their way, and from how many friends: the same pigeons as the list");
  const doomed = card.inbound[2], swift = card.inbound[0];
  assert.deepEqual(Object.keys(doomed).sort(), Object.keys(swift).sort(), "the doomed one has the same fields as any other");
  assert.equal(doomed.landsAt, T + 4 * H, "and its landing as planned");
  assert.equal(doomed.kind, "turbo");
  assert.deepEqual(swift, { who: { id: SAM, name: 'Sam "Q" & O\'Neil', first: "Sam", photoAt: 1780000000000 }, sentAt: T - 2 * H, landsAt: T + H, km: 343, kind: "swift", mystery: false,
    bird: { name: "Biscuit", rank: "Navigator" }, from: "Paris", href: `${LINKS.chat}/#open=${SAM}` });
  assert.deepEqual(card.unread, [{ who: { id: LEO, name: "Leo Park", first: "Leo", photoAt: null }, n: 2, messages: 0, last: T - H, href: `${LINKS.chat}/#open=${LEO}` }], "landed and unread, by friend: not one read, lost or blocked");
  assert.equal(card.mine.length, 1); assert.equal(card.more, 0);
});

test("a mystery pigeon: its kind never told to whoever it's flying to; told to its sender, with mystery", async () => {
  const card = await chatCard(env, { id: ME }, ctx);
  const theirs = card.inbound.find((x) => x.who.id === MUM);
  assert.equal(theirs.kind, null); assert.equal(theirs.mystery, true);
  assert.ok(!JSON.stringify(theirs).toLowerCase().includes("rocket"), "no rocket anywhere in it");
  const mine = card.mine[0];
  assert.equal(mine.kind, "rocket"); assert.equal(mine.mystery, true);
  assert.deepEqual(mine.bird, { name: "O'Brien", rank: "Courier" }); assert.equal(mine.to, "<b>x</b>", "a place as it was written: the page escapes it");
});

test("the streak: friends only, the one that ends today unless a pigeon flies, and the longest still going for the line to send", async () => {
  const card = await chatCard(env, { id: ME }, ctx);
  assert.deepEqual(card.streak, { who: { id: MUM, name: "Mum", first: "Mum", photoAt: null }, n: 12, endsAt: (today + 1) * DAY, best: 19, href: `${LINKS.chat}/#open=${MUM}` });
  assert.equal(card.share, "My flight streak with Mum is 12 days.", "not the blocked one's 40");
});

test("no friends: the card says to add one; friends with nothing on: empty lists and a plain line to send", async () => {
  user(id(9), "New Person");
  assert.deepEqual(await chatCard(env, { id: id(9) }, ctx), { state: "empty", pigeons: true, href: `${LINKS.chat}/`, said: "Add a friend in Chat, and their pigeons show here.", action: { label: "Open Chat", href: `${LINKS.chat}/` } });
  link(id(9), STRANGER);
  const quiet = await chatCard(env, { id: id(9) }, ctx);
  assert.deepEqual(quiet, { state: "ok", pigeons: true, href: `${LINKS.chat}/`, inbound: [], inboundTotal: 0, inboundFrom: 0, unread: [], mine: [], more: 0, streak: null, share: "Sending you a pigeon." });
});

test("the source reads pigeons only through its own allowlist: no SELECT *, no m.*, never Chat's own views of a message", () => {
  const src = readFileSync(new URL("../../../functions/_todaychat.js", import.meta.url), "utf8");
  for (const s of ["SELECT *", "m.*", "msgView(", "groupSkies(", "birdsFor("]) assert.ok(!src.includes(s), `no ${s}`);
});

test("the morning's lines made from the card carry nothing sealed either, names on or off", async () => {
  const card = await chatCard(env, { id: ME }, ctx);
  for (const names of [false, true]) {
    const json = JSON.stringify(morningLines({ chat: card }, { names, tz: "Europe/London", t: T, lines: { weather: false, fitness: false, markets: false } }));
    for (const m of [...MARKERS, "rocket", "DOOMED"]) assert.ok(!json.includes(m), `names ${names}: no ${m}`);
  }
});

test("a friend's picture, through Today: your own, a friend's, or someone who's asked you; never a stranger's or across a block", async () => {
  for (const u of [ME, SAM, ASKER, BAD, STRANGER]) pictures.add(avatarKey(u));
  for (const [who, want] of [[ME, true], [SAM, true], [ASKER, true], [BAD, false], [STRANGER, false]]) {
    const r = await avatarFor(env, ME, who);
    assert.equal(!!r, want, `${who}: ${want ? "shown" : "not"}`);
    if (r) assert.equal(r.headers.get("Content-Type"), "image/jpeg");
  }
  assert.equal(await avatarFor(env, ME, ""), null);
});

test("more on their way than the card lists: the soonest 6, and every one counted, with the friends sending them, for the morning's words", async () => {
  const BUSY = id(20), A = id(21), B = id(22), C = id(23), D = id(24);
  user(BUSY, "Busy Person"); user(A, "Ana Bell"); user(B, "Bo Chen"); user(C, "Cy Dent"); user(D, "Di Eves");
  for (const f of [A, B, C, D]) link(BUSY, f);
  link(STRANGER, BUSY, "pending");
  // (7 from Ana, the soonest; then one each from Bo, Cy and Di; and some that aren't counted: lost, booked, from someone not a friend)
  for (let i = 0; i < 7; i++) msg(`busy-a${i}`, { sender: A, recipient: BUSY, deliver_at: T + (i + 1) * 60e3 });
  [B, C, D].forEach((f, i) => msg(`busy-f${i}`, { sender: f, recipient: BUSY, deliver_at: T + (10 + i) * H }));
  msg("busy-lost", { sender: B, recipient: BUSY, lost_at: T - H, deliver_at: T + 20 * H });
  msg("busy-booked", { sender: C, recipient: BUSY, sched: 1, sent_at: T + H, deliver_at: T + 21 * H });
  msg("busy-stranger", { sender: STRANGER, recipient: BUSY });
  const card = await chatCard(env, { id: BUSY }, ctx);
  assert.equal(card.inbound.length, 6, "the soonest 6 listed");
  assert.ok(card.inbound.every((p) => p.who.id === A), "all Ana's");
  assert.deepEqual([card.inboundTotal, card.inboundFrom], [10, 4], "all 10 counted, from 4 friends: not the lost one, the booked one, nor the stranger's");
  const line = (names) => morningLines({ chat: card }, { names, tz: "Europe/London", t: T, lines: { weather: false, fitness: false, markets: false } }).lines[0];
  assert.equal(line(false), "10 pigeons on their way");
  assert.equal(line(true), "Pigeons from Ana and 3 others on their way");
});

test("today: the card for pigeons off, unread messages counted apart", async () => {
  // (Ivy and Jo are friends; Jo has sent Ivy two instant messages and a letter that's landed, all unread, and the two of
  // them have a streak going that ends today)
  const IVY = id(40), JO = id(41), NEWBIE = id(42);
  user(IVY, "Ivy Hart", { pigeons: 0, new_way: "instant" }); user(JO, "Jo Lane"); user(NEWBIE, "New Person", { pigeons: 0 });
  link(IVY, JO);
  const plain = { from_lat: null, from_lon: null, to_lat: null, to_lon: null, from_place: null, to_place: null, legs: null, wx: null, wx_ms: null, via: null, via_ct: null, via_note: null, via_place: null, photo: 0, photo_size: null, once: null, risky: 0, km: 0 };
  msg("im-1", { ...plain, sender: JO, recipient: IVY, instant: 1, sent_at: T - 30 * 60e3, deliver_at: T - 30 * 60e3 });
  msg("im-2", { ...plain, sender: JO, recipient: IVY, instant: 1, sent_at: T - 20 * 60e3, deliver_at: T - 20 * 60e3 });
  msg("lt-1", { sender: JO, recipient: IVY, sent_at: T - 5 * H, deliver_at: T - 2 * H });
  put("pg_streaks", { a: [IVY, JO].sort()[0], b: [IVY, JO].sort()[1], start: today - 5, last: today - 1, best: 5 });
  const card = await chatCard(env, { id: IVY, pigeons: 0 }, ctx);
  assert.equal(card.pigeons, false);
  assert.equal(card.streak, null, "no streak with pigeons off");
  assert.equal(card.share, "Sending you a message.");
  assert.equal(card.send, null, "and no streak card to send");
  assert.deepEqual(card.unread.map((r) => [r.who.id, r.n, r.messages]), [[JO, 3, 2]], "three unread, two of them messages");
  assert.deepEqual(card.inbound, [], "an instant message is never in the air");
  // the same account with pigeons on (or a bare user): the streak, and pigeons' words
  const on = await chatCard(env, { id: IVY }, ctx);
  assert.equal(on.pigeons, true); assert.equal(on.streak?.n, 5); assert.equal(on.share, "My flight streak with Jo is 5 days.");
  assert.deepEqual(await chatCard(env, { id: NEWBIE, pigeons: 0 }, ctx), { state: "empty", pigeons: false, href: `${LINKS.chat}/`, said: "Add a friend in Chat, and your messages show here.", action: { label: "Open Chat", href: `${LINKS.chat}/` } });
});

// ================================ Today First: Waiting for You (spec §7.4) ================================
// Who's waiting for an answer, and since when, never what they said: one-to-one, the friend's newest landed letter or
// message is theirs, within 24 hours, not lost or gone, nothing of yours sent since; groups through pg_gdeliv and
// pg_gmsgs, someone else's the newest delivered to you, nothing of yours sent to the group since.
const W = id(60), ANA = id(61), BO = id(62), CY = id(63), DI = id(64), ED = id(65), FI = id(66), WS = id(67), WX = id(68);
user(W, "Wren Hale"); user(ANA, "Ana Bell"); user(BO, "Bo Chen"); user(CY, "Cy Dent"); user(DI, "Di Eves"); user(ED, "Ed Fox"); user(FI, "Fi Gray"); user(WS, "Some Stranger"); user(WX, "Was Blocked");
for (const f of [ANA, BO, CY, DI, ED, FI]) link(W, f);
link(W, WX, "blocked");
// (each message's words a marker that must never come out)
const said = (mid, sender, recipient, sent, landed, x = {}) => put("pg_msgs", { id: mid, sender, recipient, ct: `SECRET-${mid}`, km: 0, sent_at: sent, deliver_at: landed, from_place: "SECRET-FROM", to_place: "SECRET-TO", instant: 1, ...x });
said("w-ana", ANA, W, T - 2 * H, T - 2 * H);                                        // waiting
said("w-bo", BO, W, T - 3 * H, T - 3 * H); said("w-bo-re", W, BO, T - H, T + H, { instant: null, km: 300 });  // answered (mine still in the air)
said("w-cy1", CY, W, T - 5 * H, T - 5 * H); said("w-cy2", CY, W, T - 4 * H, T - 4 * H, { read_at: T - 3 * H }); said("w-cy-old", W, CY, T - 6 * H, T - 6 * H);  // two since mine, one read
said("w-di", DI, W, T - 30 * H, T - 30 * H);                                       // over a day ago
said("w-ed-lost", ED, W, T - 3 * H, T - 2 * H, { lost_at: T - 2.5 * H }); said("w-ed-air", ED, W, T - H, T + H);  // lost; in the air
said("w-ed-gone", ED, W, T - 3 * H, T - 3 * H, { gone_at: T - H });                 // gone
said("w-fi", FI, W, T - 3 * H, T - 3 * H); said("w-fi-mine", W, FI, T - 5 * H, T - 2 * H, { instant: null, km: 900 });  // mine landed after theirs
said("w-stranger", WS, W, T - H, T - H); said("w-blocked", WX, W, T - H, T - H);     // not friends
// groups: Thursday Riders (Bo wrote last, nothing of mine since), Book Club (mine since theirs), Old Group (recalled)
const group = (gid, name, members) => { put("pg_groups", { id: gid, name, created_by: W, created_at: 0 }); for (const m of members) put("pg_group_members", { group_id: gid, user_id: m, added_by: W, joined_at: 0 }); };
const gsaid = (mid, gid, sender, sent, to, landed, x = {}) => { put("pg_gmsgs", { id: mid, group_id: gid, sender, body: `SECRET-${mid}`, sender_key: "SECRET-KEY", pigeon: "standard", sent_at: sent, from_place: "SECRET-GFROM" });
  for (const u of to) put("pg_gdeliv", { msg_id: mid, user_id: u, wrap: "SECRET-WRAP", km: 0, deliver_at: landed, to_place: "SECRET-GTO", ...x }); };
const G1 = "g-thursday", G2 = "g-books", G3 = "g-old";
group(G1, "Thursday Riders", [W, ANA, BO]); group(G2, "Book Club", [W, CY]); group(G3, "Old Group", [W, DI]);
gsaid("g1-ana", G1, ANA, T - 2.5 * H, [W, BO], T - 2.5 * H); gsaid("g1-bo", G1, BO, T - H, [W, ANA], T - H);
gsaid("g2-cy", G2, CY, T - 4 * H, [W], T - 4 * H); gsaid("g2-me", G2, W, T - 3 * H, [CY], T - 3 * H);
gsaid("g3-di", G3, DI, T - H, [W], T - H, { recalled: 1 });

test("Waiting for You: who and since when, one-to-one and groups, the newest first; never a word, never a place", async () => {
  asked.length = 0;
  const w = await waitingFor(env, { id: W }, T), json = JSON.stringify(w);
  assert.deepEqual(w, [
    { id: G1, first: "Bo", group: { id: G1, name: "Thursday Riders" }, at: T - H, n: 2 },
    { id: ANA, first: "Ana", at: T - 2 * H, n: 1 },
    { id: CY, first: "Cy", at: T - 4 * H, n: 2 },
  ]);
  assert.ok(!/SECRET/.test(json), "no words, no places, no keys");
  for (const k of ["ct", "body", "wrap", "sender_key", "from", "to", "place"]) assert.ok(!json.includes(`"${k}"`), k);
  // (only the pinned columns of each table were read)
  const msgQs = asked.filter((q) => /\bpg_msgs\b/.test(q)), gQs = asked.filter((q) => /\bpg_gmsgs\b/.test(q));
  assert.ok(msgQs.length >= 2 && gQs.length >= 2);
  for (const q of msgQs) {
    const list = /SELECT\s+([\s\S]*?)\s+FROM\s+pg_msgs/i.exec(q)?.[1] || "";
    for (const [, c] of list.matchAll(/\bm\.(\w+)/g)) assert.ok(CHAT_COLUMNS.includes(c), `m.${c} isn't in CHAT_COLUMNS`);
    assert.ok(!/\*/.test(list), list);
  }
  for (const q of gQs) {
    const list = /SELECT\s+([\s\S]*?)\s+FROM\s+pg_g/i.exec(q)?.[1] || "";
    for (const [, c] of list.matchAll(/\b[gd]\.(\w+)/g)) assert.ok(GROUP_COLUMNS.includes(c), `${c} isn't in GROUP_COLUMNS`);
    for (const c of ["body", "sender_key", "wrap", "photo", "legs", "from_place", "to_place", "wx"]) assert.ok(!new RegExp(`\\b[gd]\\.${c}\\b`).test(q), `${c} never read`);
  }
});

test("Waiting for You: answering takes them off, as does a day passing; at most six", async () => {
  said("w-ana-re", W, ANA, T - 30 * 60e3, T + 30 * 60e3, { instant: null, km: 50 });
  assert.ok(!(await waitingFor(env, { id: W }, T)).some((x) => x.id === ANA), "answered: off, even with mine still in the air");
  assert.ok(!(await waitingFor(env, { id: W }, T + 23 * H)).some((x) => x.id === CY), "Cy's newest is over a day old by then");
  gsaid("g1-me", G1, W, T - 10 * 60e3, [ANA, BO], T - 10 * 60e3);
  assert.ok(!(await waitingFor(env, { id: W }, T)).some((x) => x.id === G1), "said something in the group since: off");
  const BUSY = id(70);
  user(BUSY, "Busy Body");
  for (let i = 0; i < 8; i++) { const f = id(71 + i); user(f, `Friend ${i}`); link(BUSY, f); said(`busy-${i}`, f, BUSY, T - (i + 1) * 60e3, T - (i + 1) * 60e3); }
  const many = await waitingFor(env, { id: BUSY }, T);
  assert.equal(many.length, 6); assert.deepEqual(many.map((x) => x.first), ["Friend", "Friend", "Friend", "Friend", "Friend", "Friend"]);
  assert.equal(many[0].at, T - 60e3, "the newest first");
  assert.deepEqual(await waitingFor(env, { id: id(9) }, T), [], "no friends: nobody");
});

test("wrote while you rode: who wrote inside the window, friends and groups, the latest first", async () => {
  const w = await wroteWhile(env, { id: W }, T - 3 * H, T);
  assert.equal(w.length, 4);
  assert.deepEqual(w.slice(0, 2), [{ id: G1, first: "Bo", group: { id: G1, name: "Thursday Riders" }, at: T - H }, { id: ANA, first: "Ana", at: T - 2 * H }]);
  assert.deepEqual(w.slice(2).map((x) => x.at), [T - 3 * H, T - 3 * H]);
  assert.deepEqual(new Set(w.slice(2).map((x) => x.id)), new Set([FI, BO]), "Fi's and Bo's at the window's start, both in it");
  assert.ok(!w.some((x) => [CY, ED, WS, WX].includes(x.id)), "not Cy's (before it), Ed's (lost, gone or in the air), nor anyone not a friend");
  assert.ok(!JSON.stringify(w).includes("SECRET"));
  assert.deepEqual(await wroteWhile(env, { id: W }, T, T - H), [], "a window the wrong way round: nobody");
});

test("GROUP_COLUMNS is exactly the allowlist", () => {
  assert.deepEqual(GROUP_COLUMNS, ["group_id", "sender", "sent_at", "user_id", "deliver_at", "read_at"]);
});
