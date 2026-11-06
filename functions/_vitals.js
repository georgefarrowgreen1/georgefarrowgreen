// How fast the apps are on people's own phones and computers, in numbers only: each page sends, once, as it's left, how
// long its first screen took to appear and how long its slowest tap took to answer (the shared menu's VITALS, in every
// app). Kept per London day, app and kind of device (phone or computer) as a count in each of a few dozen bands, never
// a visit of its own: no account, no address, no page, nothing but the app, the device's kind and the numbers. Kept 60
// days. Shown to the site's admin under Insights → Speed (functions/_insights.js), the middle-ish figure (the 75th in
// a hundred, as the web's own measures are judged) for each.
//   record(env, body)         one page's numbers (POST /api/vitals; Today's and Mail's own addresses pass theirs on)
//   speed(D, first, last)     → { rows: [{ app, dev, m: { metric: { p75, n, days: [p75 or null, oldest first] } } }] }
//   vitalsRoute(ctx)          POST /api/vitals (and /api/account/vitals, as Today's Worker asks it): a page's own, from its
//                             own address (Sec-Fetch-Site), a few a minute from each network; 204 whatever came of it
//   band(v) / bandValue(b)    the band a number's in, and the number a band stands for (its geometric middle)
import { db, DAY, londonOffset, pace, clientNet, readCapped } from "./_pigeon.js";

// (the apps that send: Today, and each app as a part of it at InFlite's hub; the hub's other pages; the sign-in page;
// the home site)
export const APPS = ["today", "hub", "chat", "chats", "weather", "fitness", "markets", "mail", "account", "auth", "home"];
export const DEVS = ["phone", "computer"];
// (each in milliseconds but cls, a score: kept as thousandths. The upper end refused, not kept: a tab left in the back)
export const METRICS = { ttfb: 60e3, fcp: 60e3, lcp: 60e3, inp: 30e3, cls: 10 };
const STEP = 1.2, TOP = 70;
// (the most kept of one measure for one app and kind of device in a day: past it, a day's figures are what they are, and
// anyone sending made-up numbers can't swamp them)
export const DAY_CAP = 20000;
export const band = (v) => (v < 1 ? 0 : Math.min(TOP, 1 + Math.floor(Math.log(v) / Math.log(STEP))));
export const bandValue = (b) => (b <= 0 ? 0 : STEP ** (b - 0.5));

export async function record(env, body, t = Date.now()) {
  const app = APPS.includes(body?.app) ? body.app : null, dev = DEVS.includes(body?.dev) ? body.dev : null;
  if (!app || !dev || !body.m || typeof body.m !== "object") return false;
  const day = Math.floor((t + londonOffset(t)) / DAY), rows = [];
  for (const [k, max] of Object.entries(METRICS)) {
    const v = body.m[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) continue;
    rows.push([k, band(k === "cls" ? v * 1000 : v)]);
  }
  if (!rows.length) return false;
  const D = await db(env);
  await D.batch([
    ...rows.map(([k, b]) => D.prepare(`INSERT INTO pg_vitals (day, app, dev, metric, b, n) SELECT ?1, ?2, ?3, ?4, ?5, 1
      WHERE (SELECT COALESCE(SUM(n), 0) FROM pg_vitals WHERE day = ?1 AND app = ?2 AND dev = ?3 AND metric = ?4) < ${DAY_CAP}
      ON CONFLICT (day, app, dev, metric, b) DO UPDATE SET n = n + 1`).bind(day, app, dev, k, b)),
    // (now and then, the days past 60 let go)
    ...(Math.random() < 0.01 ? [D.prepare("DELETE FROM pg_vitals WHERE day < ?").bind(day - 60)] : []),
  ]);
  return true;
}

// (the 75th in a hundred of a set of band counts: { band: n })
function p75(counts) {
  const bs = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const total = bs.reduce((s, b) => s + counts[b], 0);
  if (!total) return null;
  let seen = 0;
  for (const b of bs) { seen += counts[b]; if (seen >= total * 0.75) return bandValue(b); }
  return bandValue(bs.at(-1));
}

export async function speed(D, first, last) {
  const { results } = await D.prepare("SELECT day, app, dev, metric, b, n FROM pg_vitals WHERE day >= ? AND day <= ?").bind(first, last).all();
  const by = new Map();
  for (const r of results || []) {
    if (!APPS.includes(r.app) || !DEVS.includes(r.dev) || !Object.hasOwn(METRICS, r.metric) || r.day < first || r.day > last) continue;
    const key = `${r.app}|${r.dev}`;
    if (!by.has(key)) by.set(key, { app: r.app, dev: r.dev, m: {} });
    const m = (by.get(key).m[r.metric] ||= { all: {}, days: Array.from({ length: last - first + 1 }, () => ({})) });
    m.all[r.b] = (m.all[r.b] || 0) + r.n;
    m.days[r.day - first][r.b] = (m.days[r.day - first][r.b] || 0) + r.n;
  }
  const scale = (k, v) => (v == null ? null : k === "cls" ? Math.round(v) / 1000 : Math.round(v));
  const rows = [...by.values()].map(({ app, dev, m }) => ({ app, dev, m: Object.fromEntries(Object.entries(m).map(([k, x]) => [k, {
    p75: scale(k, p75(x.all)), n: Object.values(x.all).reduce((s, n) => s + n, 0), days: x.days.map((d) => scale(k, p75(d))),
  }])) }));
  rows.sort((a, b) => APPS.indexOf(a.app) - APPS.indexOf(b.app) || DEVS.indexOf(a.dev) - DEVS.indexOf(b.dev));
  return { rows };
}

export async function vitalsRoute(ctx) {
  const req = ctx.request, none = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return none(405);
  const site = req.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") return none(403);
  try {
    // (a few hundred bytes at most: more refused before it's read, by what it says it is, and never read past)
    const raw = new TextDecoder().decode(await readCapped(req, 600));
    await pace(ctx.env, "vitals:" + clientNet(req), 40, 15 * 60e3);
    const work = record(ctx.env, JSON.parse(raw)).catch(() => {});
    if (typeof ctx.waitUntil === "function") ctx.waitUntil(work); else await work;
  } catch (e) { if (e?.status === 413) return none(413); /* else a page's numbers missed, never anything else */ }
  return none();
}
