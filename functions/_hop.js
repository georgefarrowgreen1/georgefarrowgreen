// A hop: the account's sign-in carried from one of the two sites to the other (functions/_sites.js), as the browser goes
// there. The two sites' cookies can't be shared, so: an app's old address on georgefarrowgreen.com, signed in, signs you
// in at its new one on inflite.ai; and the home page, back from signing in on the account's page at inflite.ai, is
// signed in itself.
//
//   1. start, on the site to be signed in to (to: where on it you're going): a note of the browser's own (a cookie only
//      this browser has), then on to the other site
//   2. issue, on the site you're signed in to: a code, good once for two minutes, made for that note; back again
//   3. finish, on the first site again: the code, and the note it was made for, from this same browser: a sign-in
//      here (a sign-in of its own, as it was shown to be you no more freshly than the one it came from), and on to `to`
//
// So a page elsewhere can't sign your browser in to its own account with a code of its own (it can't set the note), nor
// take a code made for you (it only ever goes to the site's own address), nor send you anywhere off the two sites.
// Not signed in where it starts from, or signed in already where it's going (unless it's a sign-in just made: fresh),
// it's just on to `to`.
import { HttpError, db, sha256, hex, randomToken, issueSession } from "./_pigeon.js";
import { cookieUser, withSession } from "./_account.js";
import { siteOf, appOrigin, homeOrigin } from "./_sites.js";

const NOTE = "hop", TTL = 2 * 60e3;
// (made here when it's first wanted)
let made = false;
async function ready(env) {
  const D = await db(env);
  if (!made) {
    await D.prepare("CREATE TABLE IF NOT EXISTS pg_hops (hash TEXT PRIMARY KEY, note TEXT NOT NULL, user_id TEXT NOT NULL, session TEXT NOT NULL, auth_at INTEGER, held INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL)").run();
    made = true;
  }
  return D;
}
// `to`, if it's somewhere on the given site ("apps" or "home"), over https (or the tests' own, over what they use)
function onSite(to, site, env) {
  try {
    const u = new URL(to);
    if (siteOf(u.hostname, env) !== site) return null;
    if (u.protocol !== "https:" && !(env?.ACCOUNT_SITE && u.protocol === "http:")) return null;
    return u.href;
  } catch (_) { return null; }
}
// where to ask: the account's page on inflite.ai (its cookie's the whole site's), or the home page
const issuer = (site, env, request) => (site === "apps" ? appOrigin("account", env, request) : homeOrigin(env, request));
const noteCookie = (url, v, age) => `${NOTE}=${v}; Path=/api/hop/; HttpOnly; SameSite=Lax; Max-Age=${age}${url.protocol === "https:" ? "; Secure" : ""}`;
const noteOf = (request) => (/(?:^|;\s*)hop=([A-Za-z0-9_-]{20,100})/.exec(request.headers.get("Cookie") || "") || [])[1] || null;
const go = (to, cookie) => { const r = new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); if (cookie) r.headers.append("Set-Cookie", cookie); return r; };

// The way there from an app's old address: through a hop, if the browser's signed in on the old site; straight there if not
export function hopTo(to, request, env) {
  const here = siteOf(new URL(to).hostname, env);
  return `${here === "apps" ? appOrigin("account", env, request) : homeOrigin(env, request)}/api/hop/start?to=${encodeURIComponent(to)}`;
}

export async function hop(request, env, step) {
  const url = new URL(request.url), here = siteOf(url.hostname, env);
  if (request.method !== "GET" || !here) throw new HttpError(404, "Not found.");
  const there = here === "apps" ? "home" : "apps";
  if (step === "start") {
    const to = onSite(url.searchParams.get("to"), here, env);
    if (!to) throw new HttpError(400, "That link isn’t one of the site’s.");
    // (fresh: a sign-in just made over there, carried even over one here already, as it may be someone else's)
    if (!url.searchParams.get("fresh") && await cookieUser(request, env)) return go(to);
    const note = randomToken(24);
    return go(`${issuer(there, env, request)}/api/hop/issue?n=${hex(await sha256(note))}&to=${encodeURIComponent(to)}`, noteCookie(url, note, 600));
  }
  if (step === "issue") {
    const to = onSite(url.searchParams.get("to"), there, env), n = url.searchParams.get("n") || "";
    if (!to || !/^[0-9a-f]{64}$/.test(n)) throw new HttpError(400, "That link isn’t one of the site’s.");
    const u = await cookieUser(request, env);
    if (!u) return go(to);
    const D = await ready(env), code = randomToken(32), t = Date.now();
    // (the home page's sign-in ends with the apps' it came from; an app's, carried from its old address, is its own)
    await D.batch([D.prepare("DELETE FROM pg_hops WHERE expires_at < ?").bind(t),
      D.prepare("INSERT INTO pg_hops (hash, note, user_id, session, auth_at, held, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(hex(await sha256(code)), n, u.id, u.sessionHash, u.authAt || 0, here === "apps" ? 1 : 0, t + TTL)]);
    return go(`${issuer(there, env, request)}/api/hop/finish?c=${code}&to=${encodeURIComponent(to)}`);
  }
  if (step === "finish") {
    const to = onSite(url.searchParams.get("to"), here, env), code = url.searchParams.get("c") || "", note = noteOf(request);
    if (!to) throw new HttpError(400, "That link isn’t one of the site’s.");
    const clear = noteCookie(url, "", 0);
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return go(to, clear);
    // (the code's gone once it's tried, whether it's taken or not)
    const D = await ready(env);
    const row = await D.prepare("DELETE FROM pg_hops WHERE hash = ? RETURNING *").bind(hex(await sha256(code))).first();
    if (!row || !note || row.expires_at < Date.now() || row.note !== hex(await sha256(note))) return go(to, clear);
    // (the account it came from, still there and not being deleted)
    const ok = await D.prepare("SELECT 1 FROM pg_users WHERE id = ? AND delete_at IS NULL").bind(row.user_id).first();
    if (!ok) return go(to, clear);
    const token = await issueSession(env, row.user_id, request, row.auth_at || 0);
    const hash = hex(await sha256(token));
    if (row.held) await D.prepare("UPDATE pg_sessions SET parent = ? WHERE hash = ?").bind(row.session, hash).run();
    const res = go(to, clear);
    return withSession(res, request, env, hash, true);
  }
  throw new HttpError(404, "Not found.");
}
