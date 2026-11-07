// A stand-in for the account's Today routes (functions/_todayapp.js: /api/account/today/*), for Today's page and Worker
// (the inflite repo's today/), run locally with wrangler dev pointed here (ACCOUNT_ORIGIN). It answers from the shared
// fixtures (mocks/today/*.json), in a mode:
//   out     signed out (today/me says so; every other route 401)
//   ok      cards.json         empty   cards.empty.json     error   cards.error.json
//   quiet   cards.quiet.json   slow    cards.json, three seconds late
//   clean   cards.json with its hostile names made plain (for comparing what's drawn)
//   down    the account not answering as itself (a host's error page, for every route)
// GET today/boot: today/me's answer as view and today/cards?v=2&with=morning's as cards, at once (404 with v1).
// GET today/cards?with=morning (with no only) adds morning.json as `morning`; ?only= gives just those cards. Like the
// account, it refuses a request whose Origin isn't Today's (EXPECT_ORIGIN, default http://localhost:8787).
// Control, on the same port: POST /__mode {mode}, POST /__morning {…} (merged into what morning.json says, until the
// next /__mode), GET /__log (every request: method, path, query, headers, body), POST /__reset (the log emptied).
// Today First's, beside those (spec §6.1, §14.4):
//   POST /mode {phase} (or /__mode {phase}): signed in, and GET today/cards answers that moment's whole version 2 answer,
//     cards.<phase>.json (morning, midday, preride, riding, after, after-fit, evening), when the page asks ?v=2, and its
//     four cards alone (version 1's) when it doesn't. Without a phase, every answer is as above. Each /mode or /__mode
//     starts You's state afresh.
//   POST today/act, today/act/undo {id}: the acts of that moment's answer, taken, kept or undone (and the same answer's
//     acts then say so); GET/PUT today/rules (rules.json); GET/PATCH today/notify (notify.json, merged a part at a
//     time; Weather's as the account takes it: { place }, { brief, briefAt }, { email }); POST/DELETE today/device;
//     GET/DELETE today/devices (devices.json)
//   POST /__log/reset: the log emptied (as /__reset)
//   with a phase, GET today/me also says what Today First's account side does (quiet, apps.mail, hubPush): { admin: true }
//     in the same /mode call makes the account Mail's (apps.mail), { hubPush: false } says the fan-out isn't on
//   with a phase, { push: { on, every } } in the /mode call: today/me says the account's word on notifications (none
//     without it, as an account side from before); a device added says on (every with fan: true), one dropped says
//     whether one's left (none here: off)
//   POST /mode { v1: true } (with or without a phase): an account side from before Today First, where only Today's own
//     routes answer (act, rules, notify, device and devices 404), GET today/cards has no v (asked ?v=2 or not), and
//     today/me says nothing of Today First's
//   this phone, as the account has it: once a device is added or dropped in this mode (POST/DELETE today/device or
//     today/push), the morning's thisDevice says so (until then, morning.json's), and devices' here, asked with a
//     device, is the tables it's in
//   node todaystub.mjs [port] [log file]     (port 8789)
import { createServer } from 'node:http';
import { appendFileSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { webcrypto } from 'node:crypto';

const PORT = Number(process.argv[2]) || 8789, LOG = process.argv[3] || null;
const ORIGIN = process.env.EXPECT_ORIGIN || 'http://localhost:8787';
const DIR = new URL('./today/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8'));
const FILES = { ok: 'cards.json', slow: 'cards.json', clean: 'cards.json', empty: 'cards.empty.json', error: 'cards.error.json', quiet: 'cards.quiet.json' };
const HOSTILE = [['Sam "Q" & O\'Neil', 'Sam Quinn'], ["O'Brien", 'Obrien'], ['<b>x</b>', 'Lisbon']];

let mode = 'ok', morningPatch = {}, log = [];
// Today First's: the moment answered (null: none), and You's state, afresh with each mode
const PHASES = ['morning', 'midday', 'preride', 'riding', 'after', 'after-fit', 'evening'];
let phase = null, you = null, v1 = false, admin = false, hubPush = true, push = null;
const fresh = () => ({ acts: new Map(), rules: read('rules.json'), notify: read('notify.json'), devices: read('devices.json'), pushed: null });
you = fresh();
const LEVELS = ['do', 'suggest', 'quiet'];
const NAMES = { moveRide: ['Moved', 'Moves are suggested now, not made'], addRide: ['Added', 'Rides are suggested now, not added'], holdRide: ['Held', 'Only app notices are held now'] };
const lineOf = (r) => r.soon ? r.line : r.rule === 'holdRide' ? `Held ${r.record.held}` : [`${NAMES[r.rule]?.[0] || 'Done'} ${r.record.done}`, `kept ${r.record.kept}`, r.record.undone ? `undone ${r.record.undone}` : null].filter(Boolean).join(' · ');
const ruleView = (r) => ({ rule: r.rule, level: r.level, line: lineOf(r) });
// (that moment's answer, with the acts as they've been taken, kept or undone since)
function dayAnswer(v2) {
  const a = read(`cards.${phase}.json`);
  if (!v2) return { at: a.at, tz: a.tz, cards: a.cards };
  a.acts = (a.acts || []).map((x) => ({ ...x, ...(you.acts.get(x.id) || {}) }));
  return a;
}
const session = () => {
  const s = read('session.json');
  if (!phase || v1) return s;
  const a = read(`cards.${phase}.json`);
  return { ...s, quiet: a.quiet || { on: false, from: 22, to: 7 }, apps: { mail: admin }, hubPush, ...(push ? { push } : {}) };
};
const morning = () => {
  const m = { ...read('morning.json'), ...morningPatch };
  if (you.pushed != null) m.thisDevice = you.pushed;
  return m;
};
function cards(only) {
  let a = read(FILES[mode] || 'cards.json');
  if (mode === 'clean') {
    let s = JSON.stringify(a);
    for (const [bad, plain] of HOSTILE) s = s.split(JSON.stringify(bad).slice(1, -1)).join(plain);
    a = JSON.parse(s);
  }
  if (only?.length) a.cards = Object.fromEntries(Object.entries(a.cards).filter(([k]) => only.includes(k)));
  return a;
}

// a small picture for avatars: an 8×8 PNG of one colour
function png() {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(8, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 8 }, () => Buffer.from([0, ...Array(8).fill([90, 140, 230]).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png();
// a real VAPID-shaped public key (65 bytes, P-256), as push-key gives
const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const KEY = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');

const json = (res, data, status = 200, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
};
const COOKIE = 'account=stubsession0123456789abcdefABCDEF; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000';
const GONE = 'account=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let body = '';
  for await (const c of req) body += c;
  if (url.pathname.startsWith('/__') || url.pathname === '/mode') {
    const b = body ? JSON.parse(body) : {};
    if (url.pathname === '/__mode' || url.pathname === '/mode') {
      if (b.phase != null && !PHASES.includes(b.phase)) return json(res, { error: `No such phase: ${b.phase}` }, 400);
      mode = b.mode || 'ok'; phase = b.phase || null; morningPatch = {}; you = fresh();
      v1 = b.v1 === true; admin = b.admin === true; hubPush = b.hubPush !== false; push = b.push && typeof b.push === 'object' ? { on: !!b.push.on, every: !!b.push.every } : null;
      return json(res, { mode, phase, v1 });
    }
    if (url.pathname === '/__morning') { morningPatch = { ...morningPatch, ...b }; return json(res, { morning: morning() }); }
    if (url.pathname === '/__log') return json(res, log);
    if (url.pathname === '/__reset' || url.pathname === '/__log/reset') { log = []; return json(res, { ok: true }); }
    return json(res, { error: 'Not found.' }, 404);
  }
  const entry = { at: Date.now(), method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: body || null, mode };
  log.push(entry);
  if (LOG) appendFileSync(LOG, JSON.stringify(entry) + '\n');

  const route = url.pathname.replace(/^\/api\/account\/today\//, '');
  if (route === url.pathname) return json(res, { error: 'Not found.' }, 404);
  if (mode === 'down') { res.writeHead(502, { 'Content-Type': 'text/html' }); return res.end('<html><body>Bad gateway</body></html>'); }
  if (req.headers.origin !== ORIGIN) return json(res, { error: 'That request didn’t come from Today.' }, 403);
  const out = mode === 'out', key = `${req.method} ${route}`;
  const b = body ? (() => { try { return JSON.parse(body); } catch { return null; } })() : {};
  if (key === 'GET me') return out ? json(res, { signedIn: false, links: session().links }) : json(res, session(), 200, { 'Set-Cookie': COOKIE });
  // (who and the day in one trip, as Today's page opens where someone was signed in last time: none on an account side
  // from before it (v1), as the page then asks today/me and today/cards apart)
  if (key === 'GET boot') {
    if (v1) return json(res, { error: 'Not found.' }, 404);
    if (out) return json(res, { view: { signedIn: false, links: session().links }, cards: null });
    const a = phase ? dayAnswer(url.searchParams.get('v') === '2') : cards(null);
    a.morning = morning();
    if (mode === 'slow') await new Promise((ok) => setTimeout(ok, 3000));
    return json(res, { view: session(), cards: a }, 200, { 'Set-Cookie': COOKIE });
  }
  if (key === 'POST handback') {
    if (!b?.code || !b?.verifier) return json(res, { error: 'That sign-in didn’t work. Try again.' }, 400);
    if (b.code === 'used') return json(res, { error: 'That sign-in has already been used. Try again.' }, 400);
    if (mode === 'out') mode = 'ok';
    return json(res, session(), 200, { 'Set-Cookie': COOKIE });
  }
  if (key === 'POST signout') return json(res, { ok: true }, 200, { 'Set-Cookie': GONE });
  if (key === 'GET push-key') return json(res, { key: KEY });
  if (out) return json(res, { error: 'Sign in to see your day.', field: 'session' }, 401);
  if (key === 'GET cards') {
    const only = url.searchParams.get('only')?.split(',').filter(Boolean) || null;
    const a = phase ? dayAnswer(url.searchParams.get('v') === '2' && !only && !v1) : cards(only);
    if (phase && only) a.cards = Object.fromEntries(Object.entries(a.cards).filter(([k]) => only.includes(k)));
    if (url.searchParams.get('with') === 'morning' && !only) a.morning = morning();
    if (mode === 'slow') await new Promise((ok) => setTimeout(ok, 3000));
    return json(res, a);
  }
  if (key === 'GET morning') return json(res, morning());
  if (key === 'PUT morning') {
    const m = morning();
    if (typeof b?.on === 'boolean') m.on = b.on;
    if (Number.isInteger(b?.at)) m.at = b.at;
    if (b?.lines) m.lines = { ...m.lines, ...b.lines };
    morningPatch = { ...morningPatch, on: m.on, at: m.at, lines: m.lines };
    return json(res, m);
  }
  if (key === 'PUT prefs') {
    const K = ['weather', 'chat', 'fitness', 'markets'];
    const order = (b?.order || []).filter((k) => K.includes(k));
    for (const k of K) if (!order.includes(k)) order.push(k);
    return json(res, { prefs: { order, hidden: (b?.hidden || []).filter((k) => K.includes(k)) } });
  }
  if (key === 'POST morning/try') return b?.endpoint ? json(res, { sent: 1 }) : json(res, { error: 'Turn the morning notification on on this device first.' }, 400);
  if (key === 'POST push') { if (!b?.sub?.endpoint) return json(res, { error: 'That isn’t a push subscription this server can send to.' }, 400); you.pushed = true; return json(res, { ok: true, devices: 1 }); }
  if (key === 'POST push-move') return json(res, { moved: true });
  if (key === 'DELETE push') { you.pushed = false; return json(res, { ok: true, devices: 0 }); }
  if (key === 'POST account-link') return json(res, { code: 'stubhandoffcode' });
  // ---- Today First's (spec §6.1): none of them on an account side from before it (v1) ----
  if (v1 && /^(act|rules|notify|device|devices)(\/|$)/.test(route)) return json(res, { error: 'Not found.' }, 404);
  if (key === 'POST act' || key === 'POST act/undo') {
    const act = phase ? dayAnswer(true).acts.find((x) => x.id === b?.id) : null;
    if (!act) return json(res, { error: 'Not found.' }, 404);
    const r = you.rules.rules.find((x) => x.rule === act.rule);
    if (key === 'POST act') {
      const state = act.state === 'offered' ? 'taken' : act.state === 'done' && act.kind === 'add' ? 'kept' : null;
      if (!state) return json(res, { error: 'That’s been done already.' }, 409);
      you.acts.set(act.id, { state });
      if (r) { r.record.kept += state === 'kept' ? 1 : 0; r.record.done += state === 'taken' ? 1 : 0; }
      return json(res, { act: { ...act, state }, rule: r ? ruleView(r) : { rule: act.rule, level: act.level, line: '' } });
    }
    if (!['done', 'taken', 'kept'].includes(act.state)) return json(res, { act, said: 'You’ve changed it since, so nothing was undone.' });
    you.acts.set(act.id, { state: 'undone' });
    if (r) { r.record.undone += 1; r.level = LEVELS[Math.min(2, LEVELS.indexOf(r.level) + 1)]; }
    return json(res, { act: { ...act, state: 'undone' }, rule: r ? ruleView(r) : { rule: act.rule, level: 'suggest', line: '' }, said: `Undone. ${NAMES[act.rule]?.[1] || 'It’s suggested now'}` });
  }
  if (key === 'GET rules') return json(res, { rules: you.rules.rules.map((r) => ({ ...r, line: lineOf(r) })) });
  if (key === 'PUT rules') {
    const r = you.rules.rules.find((x) => x.rule === b?.rule && !x.soon);
    if (!r || !LEVELS.includes(b?.level)) return json(res, { error: 'Choose Do, Suggest or Quiet.' }, 400);
    r.level = b.level; r.setBy = 'you';
    return json(res, { rule: r.rule, level: r.level, setBy: 'you', line: lineOf(r) });
  }
  if (key === 'GET notify') return json(res, you.notify);
  if (key === 'PATCH notify') {
    if (!b || typeof b !== 'object') return json(res, { error: 'Bad request.' }, 400);
    // (Weather's, as the account's setNotify takes it: a place's rain and warnings, the briefing and its time, email)
    if (b.weather && typeof b.weather === 'object') {
      const w = b.weather, n = you.notify.weather, near = (a, c) => Math.abs(a.lat - c.lat) < 0.01 && Math.abs(a.lon - c.lon) < 0.01;
      if (w.place) {
        const was = n.places.find((q) => near(q, w.place)) || { name: w.place.name, lat: w.place.lat, lon: w.place.lon, rain: false, warn: false };
        const now = { ...was, rain: w.place.rain !== undefined ? !!w.place.rain : was.rain, warn: w.place.warn !== undefined ? !!w.place.warn : was.warn };
        n.places = [...n.places.filter((q) => !near(q, w.place)), now];
      }
      if (w.brief !== undefined) n.brief = w.brief ? { name: w.brief.name, lat: w.brief.lat, lon: w.brief.lon } : null;
      if (w.briefAt !== undefined) n.briefAt = w.briefAt;
      if (w.email && typeof w.email === 'object') n.email = { ...n.email, ...w.email };
    }
    // (Chat's, as setNotify takes them: each kind on or off by name, as GET then says them, in chat.kinds)
    if (b.chat && typeof b.chat === 'object') {
      const c = you.notify.chat, kinds = { ...c.kinds };
      for (const [k, v] of Object.entries(b.chat)) if (k in kinds && typeof v === 'boolean') kinds[k] = v;
      you.notify.chat = { ...c, kinds, ...(typeof b.chat.names === 'boolean' ? { names: b.chat.names } : {}), ...(typeof b.chat.email === 'boolean' ? { email: b.chat.email } : {}) };
    }
    // (Markets': alerts on or off says off, as GET has it; the wrap as it is)
    if (b.markets && typeof b.markets === 'object') {
      const m = you.notify.markets;
      you.notify.markets = { ...m, ...(typeof b.markets.alerts === 'boolean' ? { off: !b.markets.alerts } : {}), ...(typeof b.markets.wrap === 'boolean' ? { wrap: b.markets.wrap } : {}) };
    }
    for (const [k, v] of Object.entries(b)) if (k !== 'weather' && k !== 'chat' && k !== 'markets' && v && typeof v === 'object' && you.notify[k] && typeof you.notify[k] === 'object') you.notify[k] = { ...you.notify[k], ...v };
    return json(res, you.notify);
  }
  if (key === 'POST device') {
    if (!/^https:\/\//.test(b?.sub?.endpoint || '')) return json(res, { error: 'That isn’t a push subscription this server can send to.' }, 400);
    const tables = b.fan === true && you.devices.fan && !b.was ? ['td_push', 'pg_push', 'mk_push', 'wx_devs'] : ['td_push'];
    you.devices.here = [...new Set([...(you.devices.here || []), ...tables])];
    you.pushed = true;
    if (push) push = { on: true, every: push.every || (b.fan === true && you.devices.fan) };
    return json(res, { ok: true, tables: push?.every && you.devices.fan ? ['td_push', 'pg_push', 'mk_push', 'wx_devs'] : tables });
  }
  if (key === 'DELETE device') { you.devices.here = []; you.pushed = false; if (push) push = { ...push, on: false }; return json(res, { ok: true, ...(push ? { on: false } : {}) }); }
  if (key === 'GET devices') return json(res, { ...you.devices, here: url.searchParams.get('device') ? you.devices.here : [] });
  if (key === 'DELETE devices') {
    const n = you.devices.devices.length;
    you.devices.devices = you.devices.devices.filter((d) => d.id !== b?.id);
    return you.devices.devices.length < n ? json(res, { ok: true }) : json(res, { error: 'Not found.' }, 404);
  }
  if (key === 'GET avatar') {
    const id = url.searchParams.get('id') || '';
    if (!/^[\w-]{8,64}$/.test(id) || id.endsWith('3')) return json(res, { error: 'No picture.' }, 404);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(PNG);
  }
  return json(res, { error: 'Not found.' }, 404);
}).listen(PORT, '127.0.0.1', () => console.log(`today stub on ${PORT}`));
