// Signing in on a computer with your phone. A computer's sign-in page (the account's, account.<site>, where every app on
// the site signs in) shows a QR code; a phone signed in to the account scans it (its camera opens the account's page at
// #qr=<code>, or the page's own scanner reads it), says it's you (a passkey or the password, unless it has in the last
// ten minutes), is told which computer's asking and roughly where, and taps the number the computer shows. The computer
// then asks "Continue as <you>?", and once that's said yes to it's signed in, as a sign-in of its own (seen in Signed-in
// devices, and said to the account's email and phones like any other), though not as one that's just shown it's you:
// a new passkey, the password, Chat's messages and Mail still ask for that.
//   - The code's good once, for two minutes (two more from when a phone first looks), and only with the word the
//     computer's tab keeps for it (poll), which never leaves that tab: a code seen over a shoulder, or a photo of the
//     screen, signs nothing in anywhere else.
//   - Only a phone that's just shown it's you can look at a code or answer it, and never one handed over from an app and
//     kept to the account's page: so a phone picked up for a moment, or a sign-in taken from one, can't make more.
//   - The number's shown on the computer only once a phone has looked, and the phone picks it from three (or types it,
//     for a computer that looks to be in another country, or where that can't be told); a wrong number ends it, as does
//     Don't sign in. One phone's account only, once it's looked. A computer seen by someone else, who scanned its code
//     first, is asked whose account it's about to be: "Continue as <name>?", with its email, partly hidden (a name can be
//     anyone's); and That's not me, or a new code asked for, ends the code there and then.
//   - What this can't stop: a page elsewhere that shows a real code of its own, and the number when it comes, to someone
//     at their own computer, who scans it and taps it. The phone says first to go on only for a code you opened yourself
//     at the computer showing it, and then only if that computer's address bar shows the account's own address (the
//     page can't be shown inside another: frame-ancestors 'none'); it says which computer and where, warns of another
//     country, and the account's told of the sign-in at once (email and push), to sign it out from Signed-in devices.
import { HttpError, db, hex, sha256, randomToken, limit, clientIp, clientNet, deviceOf, placeOf, safeEqual, requireFresh } from "./_pigeon.js";

const TTL = 2 * 60e3, CODE = /^[A-Za-z0-9_-]{32}$/, WORD = /^[A-Za-z0-9_-]{43}$/;
const GONE = "That code has run out. The computer makes a new one by itself: scan that instead.";
// (looking at a code, or answering one: only from a phone that's just shown it's you, and not one handed over from an app)
const shownIt = (u) => { if (u.handed) throw new HttpError(403, "Confirm it’s you first.", "reauth"); requireFresh(u); };
const rowOf = async (D, code) => (CODE.test(String(code || "")) ? D.prepare("SELECT * FROM pg_qrsign WHERE hash = ?").bind(hex(await sha256(String(code)))).first() : null);
// (the country an address is in, by Cloudflare's two letters: null where it doesn't know)
const countryOf = (request) => { const c = request?.cf?.country; return c && c !== "XX" && c !== "T1" ? String(c).slice(0, 2) : null; };
// (an email, its name part hidden but for its first letter, as the account's page says one: s••••@example.com)
const hidden = (email) => String(email || "").replace(/^(.)([^@]*)(@.*)$/, (_, a, b, c) => a + "•".repeat(Math.min(6, b.length)) + c);
// (a number from 10 to 99, and two others, all three in no particular order)
function numbers() {
  const r = crypto.getRandomValues(new Uint32Array(6)), out = [];
  for (const x of r) { const n = 10 + (x % 90); if (!out.includes(n)) out.push(n); if (out.length === 3) break; }
  for (let n = out[0]; out.length < 3;) { n = 10 + ((n - 9) % 90); if (!out.includes(n)) out.push(n); }
  return { num: out[0], picks: [...out].sort((a, b) => a - b) };
}

// (the computer) a code for its QR code, and the word only it keeps: { code, poll, ttl } (counted by network, as an
// address's own end of IPv6 is anyone's to change; room for an office's worth of sign-in pages)
export async function qrStart(env, request) {
  await limit(env, "qrstart:" + clientNet(request), 120, 15 * 60e3);
  const D = await db(env), t = Date.now(), code = randomToken(24), poll = randomToken(32), { num, picks } = numbers();
  await D.batch([D.prepare("DELETE FROM pg_qrsign WHERE expires < ?").bind(t),
    D.prepare("INSERT INTO pg_qrsign (hash, poll, num, picks, label, place, cc, user_id, phone, state, expires) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'new', ?)")
      .bind(hex(await sha256(code)), hex(await sha256(poll)), num, picks.join(","), deviceOf(request), placeOf(request), countryOf(request), t + TTL)]);
  return { code, poll, ttl: TTL };
}
// (the computer's own code, by its word: the row, or null; asking with a wrong word counts against the address, a right
// one doesn't, as it can only come from the tab that made the code)
async function ownRow(env, request, D, b) {
  const r = await rowOf(D, b.code);
  if (r && WORD.test(String(b.poll || "")) && safeEqual(r.poll, hex(await sha256(String(b.poll))))) return r;
  await limit(env, "qrbad:" + clientIp(request), 300, 15 * 60e3);
  return null;
}
// (the computer, every two seconds or so) where it's got to: { state: "waiting" | "seen" (with the number to show, and
// the phone) | "ready" (said yes to: whose account, to ask before taking it) | "no" | "gone" }
export async function qrWait(env, request, b) {
  const D = await db(env), r = await ownRow(env, request, D, b);
  if (!r) return { state: "gone" };
  const drop = () => D.prepare("DELETE FROM pg_qrsign WHERE hash = ?").bind(r.hash).run();
  if (r.expires < Date.now()) { await drop(); return { state: "gone" }; }
  if (r.state === "no") { await drop(); return { state: "no" }; }
  if (r.state === "yes") {
    const u = await D.prepare("SELECT name, handle, email, delete_at FROM pg_users WHERE id = ?").bind(r.user_id).first();
    if (!u || u.delete_at) { await drop(); return { state: "gone" }; }
    return { state: "ready", name: u.name, handle: u.handle, email: hidden(u.email), phone: r.phone };
  }
  return r.state === "seen" ? { state: "seen", num: r.num, phone: r.phone } : { state: "waiting" };
}
// (the computer) not that account, or a new code wanted: this one ended, { ok }
export async function qrRefuse(env, request, b) {
  const D = await db(env), r = await ownRow(env, request, D, b);
  if (r) await D.prepare("DELETE FROM pg_qrsign WHERE hash = ?").bind(r.hash).run();
  return { ok: true };
}
// (the computer, once it's said yes to whose account it is) the account to sign in, { u, phone }: the code used up as it's
// taken, so only once
export async function qrTake(env, request, b) {
  const D = await db(env), r = await ownRow(env, request, D, b);
  if (!r || r.state !== "yes" || r.expires < Date.now()) return { state: "gone" };
  const took = await D.prepare("DELETE FROM pg_qrsign WHERE hash = ? AND state = 'yes' AND expires >= ?").bind(r.hash, Date.now()).run();
  const u = took.meta?.changes ? await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(r.user_id).first() : null;
  return u && !u.delete_at ? { u, phone: r.phone } : { state: "gone" };
}
// (the phone, signed in, just shown it's you) the computer that's asking, for you to see: { label, place, far, picks } (far:
// "elsewhere", in another country from the phone, or "unknown", where either can't be told). From now, it's this
// account's alone to say yes or no to
export async function qrLook(env, request, u, code) {
  shownIt(u);
  await limit(env, "qrlook:" + u.id, 30, 15 * 60e3);
  const D = await db(env), r = await rowOf(D, code), t = Date.now();
  if (!r || r.expires < t || r.state === "no" || r.state === "yes") throw new HttpError(410, GONE);
  if (r.user_id && r.user_id !== u.id) throw new HttpError(409, "Someone else has already scanned that code.");
  // (two minutes more from the first look only, so looking again doesn't keep a code alive)
  const took = await D.prepare("UPDATE pg_qrsign SET user_id = ?, phone = ?, expires = CASE WHEN state = 'new' THEN ? ELSE expires END, state = 'seen' WHERE hash = ? AND (user_id IS NULL OR user_id = ?) AND state IN ('new', 'seen') AND expires >= ?")
    .bind(u.id, deviceOf(request), t + TTL, r.hash, u.id, t).run();
  if (!took.meta?.changes) throw new HttpError(409, "Someone else has already scanned that code.");
  const here = countryOf(request);
  return { label: r.label, place: r.place, far: !r.cc || !here ? "unknown" : r.cc !== here ? "elsewhere" : null, picks: r.picks.split(",").map(Number) };
}
// (the phone) yes, with the number the computer shows; or no (num null). A wrong number's a no
export async function qrAnswer(env, request, u, code, num) {
  if (num != null) shownIt(u);
  await limit(env, "qranswer:" + u.id, 30, 15 * 60e3);
  const D = await db(env), r = await rowOf(D, code);
  if (!r || r.expires < Date.now() || r.state !== "seen" || r.user_id !== u.id) throw new HttpError(410, GONE);
  const yes = num != null && Number(num) === r.num;
  const took = await D.prepare("UPDATE pg_qrsign SET state = ? WHERE hash = ? AND state = 'seen' AND user_id = ? AND expires >= ?").bind(yes ? "yes" : "no", r.hash, u.id, Date.now()).run();
  if (!took.meta?.changes) throw new HttpError(410, GONE);
  if (num != null && !yes) throw new HttpError(400, "That isn’t the number on the computer, so it hasn’t been signed in. If you didn’t ask to sign in there, there’s nothing else to do.", "mismatch");
  return { ok: yes, label: r.label };
}
