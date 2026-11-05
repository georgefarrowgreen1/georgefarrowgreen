// Bug reports, sitewide: each issue its own code, the same every time it happens ("IF-C-7KQ2M": InFlite, the app's
// letter, five letters and digits from what went wrong and where), so one bug is one code however often it's seen. A
// report comes from the window every app shows when something breaks (the shared menu, .tools/inflite/menu.js: Send to
// InFlite), or from the site itself when one of its APIs fails (logError, functions/_pigeon.js, files those too). They're
// kept in pg_bugs; a GitHub Action (.github/workflows/bug-reports.yml) collects the new ones every hour and files each
// code as an issue, a comment for each time it's seen again, where they're fixed.
// Never anything of anyone's messages, mail or money: what went wrong (its words, with addresses, numbers and anything
// like a key taken out), where in the code, the app and its version, the page's path (never its query or #), the kind of
// device, and what the person who sent it chose to say.
//   issueCode(app, kind, words, where) → "IF-X-XXXXX"
//   bugsRoute(ctx, url) → the answer for /api/bugs, /api/bugs/pending, /api/bugs/filed (and /api/account/bugs, as Today's
//     Worker asks), or null for anything else
//   fileServerBug(env, src, e) → the code a server error's filed under (logError's)
import { HttpError, db, clientIp, limit } from "./_pigeon.js";
import { tickHost, appsSite } from "./_sites.js";
import { tickAuthOk } from "./_notify.js";

// (each app's letter; S, the site's own servers)
export const APP_LETTER = { chat: "C", chats: "C", weather: "W", fitness: "F", markets: "M", finance: "M", account: "A", auth: "A", today: "T", mail: "E", email: "E", home: "H", fitting: "P", server: "S" };
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";   // (Crockford's: no I, L, O or U to misread)
// (what went wrong, without what differs from one time to the next: addresses, numbers, ids, quoted words)
export const sameness = (s) => String(s || "").toLowerCase()
  .replace(/https?:\/\/\S+/g, "<url>").replace(/[0-9a-f]{8,}/g, "#").replace(/\d+/g, "#")
  .replace(/(["'`]).*?\1/g, "''").replace(/\s+/g, " ").trim().slice(0, 200);
function fnv(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
export function issueCode(app, kind, words, where = "") {
  let h = fnv(`${kind}|${sameness(words)}|${String(where).replace(/:\d+(:\d+)?$/, "")}`), out = "";
  for (let i = 0; i < 5; i++) { out += ALPHA[h % 32]; h = Math.floor(h / 32); }
  return `IF-${APP_LETTER[app] || "X"}-${out}`;
}
// (words that could be anyone's: emails, long runs that could be keys or tokens, the query of any address)
export const scrub = (s, n = 500) => String(s ?? "").replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "<email>")
  .replace(/[A-Za-z0-9_\-+/=]{32,}/g, "<long>").replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, "$1").slice(0, n);
const CODE = /^IF-[A-Z]-[0-9A-Z]{4,6}$/;
const text = (v, n) => (typeof v === "string" ? scrub(v, n) : "");

let ready = null;
export const table = (env) => (ready ||= db(env).then((D) => D.batch([
  D.prepare(`CREATE TABLE IF NOT EXISTS pg_bugs (id TEXT PRIMARY KEY, code TEXT NOT NULL, app TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL,
    version TEXT, words TEXT, at_where TEXT, stack TEXT, path TEXT, device TEXT, note TEXT, filed_at INTEGER, issue INTEGER)`),
  D.prepare("CREATE INDEX IF NOT EXISTS pg_bugs_unfiled ON pg_bugs(filed_at, at)"),
  D.prepare("CREATE INDEX IF NOT EXISTS pg_bugs_code ON pg_bugs(code, at)"),
  // (a server error's detail, for the Incident Desk: { sev: "slow" | "failed", limit, steps: [{ name, ms, done }] })
]).then(() => D.prepare("ALTER TABLE pg_bugs ADD COLUMN detail TEXT").run().catch(() => {}))
  // (who sent it from the window, where they were signed in: told when it's fixed, functions/_desk.js tellFixed)
  .then(() => D.prepare("ALTER TABLE pg_bugs ADD COLUMN user_id TEXT").run().catch(() => {})).then(() => D)).catch((e) => { ready = null; throw e; }));
const newId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPHA[b % 32]).join("");

async function keep(env, r) {
  const D = await table(env), id = newId();
  await D.prepare("INSERT INTO pg_bugs (id, code, app, kind, at, version, words, at_where, stack, path, device, note, detail, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, r.code, r.app, r.kind, Date.now(), r.version || null, r.words || null, r.where || null, r.stack || null, r.path || null, r.device || null, r.note || null, r.detail ? JSON.stringify(r.detail) : null, r.user || null).run();
  // (the same code five times in ten minutes: an incident on status.inflite.ai, where the owner has that on)
  await import("./_status.js").then((m) => m.burstCheck(env, r.code, r.app)).catch((e) => console.error("status burst", e && e.message));
  return id;
}

// (how bad it was, and what it knew of itself: a request that ran out of time and answered with what it had (a Quiet
// "Too slow.", functions/_todaycards.js) was slow, the person given something; anything else failed. With the time each
// part had taken, where it was timed: names and numbers only)
export function detailOf(e) {
  const slow = /^too slow\.?$/i.test(String(e?.message || "").trim()) || e?.constructor?.name === "Quiet";
  const d = { sev: slow ? "slow" : "failed" };
  const x = e?.detail;
  if (x && typeof x === "object") {
    if (Number.isFinite(x.limit)) d.limit = Math.round(x.limit);
    if (Array.isArray(x.steps)) d.steps = x.steps.slice(0, 12).filter((p) => p && typeof p.name === "string" && Number.isFinite(p.ms))
      .map((p) => ({ name: scrub(p.name, 40), ms: Math.max(0, Math.round(p.ms)), done: !!p.done }));
  }
  return d;
}
// A server error, filed (logError's): its code, from where it was and what it said
let filedRecently = 0, filedWindow = 0;
export async function fileServerBug(env, src, e) {
  const words = scrub(e && (e.message || e), 300), code = issueCode("server", String(src || "server"), words, String(src || ""));
  const t = Date.now();
  if (t - filedWindow > 60e3) { filedWindow = t; filedRecently = 0; }
  if (++filedRecently <= 10 && env?.DB) {
    const stack = scrub(String(e?.stack || "").split("\n").slice(1, 6).map((l) => l.trim()).join("\n"), 800);
    try { await keep(env, { code, app: "server", kind: String(src || "server").slice(0, 40), words, where: String(src || "").slice(0, 80), stack, detail: detailOf(e) }); } catch (_) {}
  }
  return code;
}

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function bugsRoute(ctx, url) {
  const p = url.pathname === "/api/account/bugs" ? "/api/bugs" : url.pathname, env = ctx.env, req = ctx.request;
  if (!/^\/api\/bugs(\/pending|\/filed)?$/.test(p)) return null;
  try {
    // ---- a report, from the window (anyone's, a few an hour from each address) ----
    if (p === "/api/bugs") {
      if (req.method !== "POST") return json({ error: "Not found." }, 404);
      const raw = await req.text();
      if (raw.length > 12000) throw new HttpError(413, "That report is too long.");
      let r; try { r = JSON.parse(raw); } catch (_) { throw new HttpError(400, "That report wasn’t readable."); }
      const app = Object.hasOwn(APP_LETTER, r?.app) ? r.app : null;
      if (!app || app === "server") throw new HttpError(400, "Which app was it?");
      const kind = ["crash", "server", "manual"].includes(r.kind) ? r.kind : "crash";
      const code = typeof r.code === "string" && CODE.test(r.code) ? r.code : issueCode(app, kind, r.words, r.where);
      await limit(env, "bugs:" + clientIp(req), 12, 3600e3);
      // (who's signed in here, if anyone: only so they can be told when it's fixed)
      const who = await import("./_account.js").then((m) => m.cookieUser(req, env)).catch(() => null);
      const id = await keep(env, { code, app, kind, user: who?.id || null, version: text(r.version, 20), words: text(r.words, 500), where: text(r.where, 200),
        stack: text(r.stack, 1500), path: text(r.path, 200).replace(/[?#].*$/, ""), device: text(r.device, 120), note: text(r.note, 1000) });
      // (and where it stands, on the status page, for the window's "See where this stands")
      return json({ ok: true, id, code, status: `https://${env.STATUS_HOST || `status.${appsSite(env)}`}/#${code}` });
    }
    // ---- the new ones, for the GitHub Action, and their issues once filed (its address past the bot checks, its key) ----
    if (!tickHost(url.hostname, env)) return json({ error: "Not found." }, 404);
    tickAuthOk(req, env);
    const D = await table(env);
    if (p === "/api/bugs/pending" && req.method === "GET") {
      const { results } = await D.prepare("SELECT * FROM pg_bugs WHERE filed_at IS NULL ORDER BY at LIMIT 300").all();
      return json({ bugs: results || [] });
    }
    if (p === "/api/bugs/filed" && req.method === "POST") {
      const r = JSON.parse(await req.text() || "{}"), ids = Array.isArray(r.ids) ? r.ids.filter((x) => typeof x === "string" && x.length <= 20).slice(0, 300) : [];
      const issue = Number.isInteger(r.issue) ? r.issue : null, t = Date.now();
      if (ids.length) await D.batch(ids.map((id) => D.prepare("UPDATE pg_bugs SET filed_at = ?, issue = ? WHERE id = ?").bind(t, issue, id)));
      // (kept a month once filed, then let go of)
      await D.prepare("DELETE FROM pg_bugs WHERE filed_at IS NOT NULL AND filed_at < ?").bind(t - 30 * 86400e3).run();
      return json({ ok: true, filed: ids.length });
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("bugs", e && (e.stack || e.message || e));
    return json({ error: "That report couldn’t be kept just now." }, 500);
  }
}
