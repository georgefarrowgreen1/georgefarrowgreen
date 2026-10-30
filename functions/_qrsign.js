// Signing in on a computer with your phone. A computer's sign-in page (the account's, account.<site>, where every app on
// the site signs in) shows a QR code; a phone signed in to the account scans it (its camera opens the account's page at
// #qr=<code>), is told which computer's asking and roughly where, and is asked to tap the number the computer shows. The
// computer's then signed in, as a sign-in of its own (seen in Signed-in devices, and said to the account's email and
// phones like any other), though not as one that's just shown it's you: a new passkey, the password, Chat's messages
// and Mail still ask for that.
//   - The code's good once, for two minutes (two more from when a phone first looks), and only with the word the computer's
//     tab keeps for it (poll), which never leaves that tab: a code seen over a shoulder, or a photo of the screen,
//     signs nothing in anywhere else.
//   - The number's shown on the computer only once a phone has looked, and the phone picks it from three: so a code a
//     page elsewhere shows you, to have you sign its computer in as you, fails unless you can see that computer.
//   - A wrong number ends it, and the computer's told; so does Not me. One phone's account only, once it's looked.
//   - A computer in another country from the phone (by Cloudflare's word for each address) is said so, plainly.
import { HttpError, db, hex, sha256, randomToken, limit, clientIp, deviceOf, placeOf, safeEqual } from "./_pigeon.js";

const TTL = 2 * 60e3, CODE = /^[A-Za-z0-9_-]{32}$/, WORD = /^[A-Za-z0-9_-]{43}$/;
const GONE = "That code has run out. The computer makes a new one by itself: scan that instead.";
const rowOf = async (D, code) => (CODE.test(String(code || "")) ? D.prepare("SELECT * FROM pg_qrsign WHERE hash = ?").bind(hex(await sha256(String(code)))).first() : null);
// (the country an address is in, by Cloudflare's two letters: null where it doesn't know)
const countryOf = (request) => { const c = request?.cf?.country; return c && c !== "XX" && c !== "T1" ? String(c).slice(0, 2) : null; };
// (a number from 10 to 99, and two others, all three in no particular order)
function numbers() {
  const r = crypto.getRandomValues(new Uint32Array(6)), out = [];
  for (const x of r) { const n = 10 + (x % 90); if (!out.includes(n)) out.push(n); if (out.length === 3) break; }
  for (let n = out[0]; out.length < 3;) { n = 10 + ((n - 9) % 90); if (!out.includes(n)) out.push(n); }
  return { num: out[0], picks: [...out].sort((a, b) => a - b) };
}

// (the computer) a code for its QR code, and the word only it keeps: { code, poll, ttl }
export async function qrStart(env, request) {
  await limit(env, "qrstart:" + clientIp(request), 60, 15 * 60e3);
  const D = await db(env), t = Date.now(), code = randomToken(24), poll = randomToken(32), { num, picks } = numbers();
  await D.batch([D.prepare("DELETE FROM pg_qrsign WHERE expires < ?").bind(t),
    D.prepare("INSERT INTO pg_qrsign (hash, poll, num, picks, label, place, cc, user_id, phone, state, expires) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'new', ?)")
      .bind(hex(await sha256(code)), hex(await sha256(poll)), num, picks.join(","), deviceOf(request), placeOf(request), countryOf(request), t + TTL)]);
  return { code, poll, ttl: TTL };
}
// (the computer, every second or so) where it's got to: { state: "waiting" | "seen" (with the number to show, and the
// phone) | "no" | "gone" }; or, said yes to, { u, phone }: the account to sign in (the code used up as it's taken)
export async function qrWait(env, request, b) {
  // (every two seconds or so from each sign-in page that's open: room for a few behind one address)
  await limit(env, "qrwait:" + clientIp(request), 2400, 15 * 60e3);
  const D = await db(env), r = await rowOf(D, b.code);
  if (!r || !WORD.test(String(b.poll || "")) || !safeEqual(r.poll, hex(await sha256(String(b.poll))))) return { state: "gone" };
  const drop = () => D.prepare("DELETE FROM pg_qrsign WHERE hash = ?").bind(r.hash).run();
  if (r.expires < Date.now()) { await drop(); return { state: "gone" }; }
  if (r.state === "no") { await drop(); return { state: "no" }; }
  if (r.state === "yes") {
    const took = await D.prepare("DELETE FROM pg_qrsign WHERE hash = ? AND state = 'yes'").bind(r.hash).run();
    const u = took.meta?.changes ? await D.prepare("SELECT * FROM pg_users WHERE id = ?").bind(r.user_id).first() : null;
    return u && !u.delete_at ? { u, phone: r.phone } : { state: "gone" };
  }
  return r.state === "seen" ? { state: "seen", num: r.num, phone: r.phone } : { state: "waiting" };
}
// (the phone, signed in) the computer that's asking, for you to see: { label, place, far, picks } (far: in another country
// from the phone). From now, it's this account's alone to say yes or no to
export async function qrLook(env, request, u, code) {
  await limit(env, "qrlook:" + u.id, 30, 15 * 60e3);
  const D = await db(env), r = await rowOf(D, code), t = Date.now();
  if (!r || r.expires < t || r.state === "no" || r.state === "yes") throw new HttpError(410, GONE);
  if (r.user_id && r.user_id !== u.id) throw new HttpError(409, "Someone else has already scanned that code.");
  // (two minutes more from the first look only, so looking again doesn't keep a code alive)
  const took = await D.prepare("UPDATE pg_qrsign SET user_id = ?, phone = ?, expires = CASE WHEN state = 'new' THEN ? ELSE expires END, state = 'seen' WHERE hash = ? AND (user_id IS NULL OR user_id = ?) AND state IN ('new', 'seen') AND expires >= ?")
    .bind(u.id, deviceOf(request), t + TTL, r.hash, u.id, t).run();
  if (!took.meta?.changes) throw new HttpError(409, "Someone else has already scanned that code.");
  const here = countryOf(request);
  return { label: r.label, place: r.place, far: !!(r.cc && here && r.cc !== here), picks: r.picks.split(",").map(Number) };
}
// (the phone) yes, with the number the computer shows; or no (num null). A wrong number's a no
export async function qrAnswer(env, request, u, code, num) {
  await limit(env, "qranswer:" + u.id, 30, 15 * 60e3);
  const D = await db(env), r = await rowOf(D, code);
  if (!r || r.expires < Date.now() || r.state !== "seen" || r.user_id !== u.id) throw new HttpError(410, GONE);
  const yes = num != null && Number(num) === r.num;
  const took = await D.prepare("UPDATE pg_qrsign SET state = ? WHERE hash = ? AND state = 'seen' AND user_id = ? AND expires >= ?").bind(yes ? "yes" : "no", r.hash, u.id, Date.now()).run();
  if (!took.meta?.changes) throw new HttpError(410, GONE);
  if (num != null && !yes) throw new HttpError(400, "That isn’t the number on the computer, so it hasn’t been signed in. If you didn’t ask to sign in there, there’s nothing else to do.", "mismatch");
  return { ok: yes, label: r.label };
}
