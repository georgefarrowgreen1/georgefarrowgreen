// A stand-in for the account's Today routes (functions/_todayapp.js: /api/account/today/*), for Today's page and Worker
// (the inflite repo's today/), run locally with wrangler dev pointed here (ACCOUNT_ORIGIN). It answers from the shared
// fixtures (mocks/today/*.json), in a mode:
//   out     signed out (today/me says so; every other route 401)
//   ok      cards.json         empty   cards.empty.json     error   cards.error.json
//   quiet   cards.quiet.json   slow    cards.json, three seconds late
//   clean   cards.json with its hostile names made plain (for comparing what's drawn)
//   down    the account not answering as itself (a host's error page, for every route)
// GET today/cards?with=morning (with no only) adds morning.json as `morning`; ?only= gives just those cards. Like the
// account, it refuses a request whose Origin isn't Today's (EXPECT_ORIGIN, default http://localhost:8787).
// Control, on the same port: POST /__mode {mode}, POST /__morning {…} (merged into what morning.json says, until the
// next /__mode), GET /__log (every request: method, path, query, headers, body), POST /__reset (the log emptied).
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
const session = () => read('session.json');
const morning = () => {
  const m = { ...read('morning.json'), ...morningPatch };
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
  if (url.pathname.startsWith('/__')) {
    const b = body ? JSON.parse(body) : {};
    if (url.pathname === '/__mode') { mode = b.mode || 'ok'; morningPatch = {}; return json(res, { mode }); }
    if (url.pathname === '/__morning') { morningPatch = { ...morningPatch, ...b }; return json(res, { morning: morning() }); }
    if (url.pathname === '/__log') return json(res, log);
    if (url.pathname === '/__reset') { log = []; return json(res, { ok: true }); }
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
    const a = cards(only);
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
  if (key === 'POST push') return b?.sub?.endpoint ? json(res, { ok: true, devices: 1 }) : json(res, { error: 'That isn’t a push subscription this server can send to.' }, 400);
  if (key === 'POST push-move') return json(res, { moved: true });
  if (key === 'DELETE push') return json(res, { ok: true, devices: 0 });
  if (key === 'POST account-link') return json(res, { code: 'stubhandoffcode' });
  if (key === 'GET avatar') {
    const id = url.searchParams.get('id') || '';
    if (!/^[\w-]{8,64}$/.test(id) || id.endsWith('3')) return json(res, { error: 'No picture.' }, 404);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(PNG);
  }
  return json(res, { error: 'Not found.' }, 404);
}).listen(PORT, '127.0.0.1', () => console.log(`today stub on ${PORT}`));
