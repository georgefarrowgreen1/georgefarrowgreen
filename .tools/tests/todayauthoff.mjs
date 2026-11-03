// needs: hub
// Signing in to InFlite with Chats switched off (One roof stage 3, roof/s3/spec.md §10.2's todayauth row, risk B1, §8;
// batch Q). Under s24-contracts §1 every new module is opt-in, so the stack without roof-chats is Chats off (ROOF_CHATS
// absent): the hub serves milestone 1's Chats page at /chats/, which does InFlite's sign-in trip itself, and the switch
// really restores everything even if MAIN's /chats/in/ were broken. todayauth.mjs (the API-level proof of Today's
// sign-in, which doesn't touch /chats/) is unchanged: this is the browser trip beside it.
//   - /api/hub apps.chats false; /chats/ is Chat's own page (no framework, no Chats module), /chats/roof/* 404 (§8)
//   - Today signed out: its Sign In link is the trip, unchanged (/chats/#signin-start&then=…, S3-D8)
//   - the trip: an account, then /chats/#signin-start&then=/ → the account's page → /chats/#signin=<code> (milestone 1's
//     page, never /chats/in/) → back on Today, signed in, Chat's session and key on this phone
//   - Today then: the engine (milestone 1's IFL.hub.chat) ready; no chats-core Worker anywhere
import { EXCEPT, HUB, checker, phone, chatSession, workers, hunt, here, shown, count, attrOf, until, wait, js, closeAll, ACCOUNT_AT } from './rooflib.mjs';
import * as H from './roofhooks.mjs';

const [,, S, out] = process.argv;
const { ok, part, fails } = checker();
process.on('uncaughtException', (e) => { console.log(`FAIL  crashed: ${String(e?.message || e).split('\n')[0]}`); console.log(`FAILS ${fails() + 1}`); process.exit(0); });
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` }).catch(() => {});
const ask = (path) => fetch(`http://127.0.0.1:8787${path}`, { headers: { Host: 'ifl.test:8788' }, redirect: 'manual' }).catch(() => null);

const A = await phone('ana');
const seen = []; A.ctx.on('request', (r) => seen.push({ url: r.url(), method: r.method(), body: r.postData() || '', at: Date.now() }));
const navs = []; A.p.on('framenavigated', (f) => { if (f === A.p.mainFrame()) navs.push(f.url()); });

await part(1, 'the switch off: the hub’s word, milestone 1’s page at /chats/, the module’s files refused', '§8, s24 §1', async () => {
  const hub = await (await ask('/api/hub'))?.json().catch(() => null);
  ok(hub && hub.apps?.chats !== true, '1. /api/hub: Chats not on (ROOF_CHATS absent: off, s24 §1)', js(hub));
  const mod = await ask('/chats/roof/chats.js');
  ok(mod && mod.status === 404, '1. /chats/roof/chats.js: 404 with Chats off (§8)', String(mod?.status));
  await A.p.goto(`${HUB}/chats/`);
  await wait(2500);
  ok(!(await count(A.p, H.mScreen('chats'))) && !(await count(A.p, H.HTML_ROUTE)), '1. /chats/: Chat’s own page, not the framework (no main#m-chats, no data-route)', here(A.p));
  ok(workers(A.p).core === 0, '1. no chats-core Worker', js(workers(A.p)));
});

await part(2, 'Today signed out: Sign In is the trip, its href unchanged', 'S3-D8, risk B1', async () => {
  await A.p.goto(`${HUB}/`);
  const up = await shown(A.p, EXCEPT.SIGNIN, 30000);
  const href = await attrOf(A.p, EXCEPT.SIGNIN, 'href');
  ok(up && /^\/chats\/#signin-start&then=/.test(href || ''), '2. Today’s Sign In: /chats/#signin-start&then=… (unchanged)', String(href));
});

await part(3, 'the trip through milestone 1’s /chats/, back on Today signed in', 'S3-D8, risk B1, §8', async () => {
  const { makeAccount, onAccountPage } = await import('./join.mjs');
  const handle = `anaoff${Date.now() % 1e6}`;
  await makeAccount(A.p, `${ACCOUNT_AT}/`, { name: 'Ana Off', handle, email: `${handle}@example.com` });
  navs.length = 0;
  await A.p.goto(`${HUB}/chats/#signin-start&then=${encodeURIComponent('/')}`);
  await onAccountPage(A.p, { email: `${handle}@example.com` }).catch((e) => console.log('note: the account page', e.message));
  const home = await A.p.waitForURL((u) => u.host === 'ifl.test:8788' && u.pathname === '/' && !/#signin/.test(u.hash), { timeout: 60000 }).then(() => true, () => false);
  const path = navs.map((u) => { const x = new URL(u); return x.host === 'ifl.test:8788' ? x.pathname + x.hash.replace(/=.*$/, '=…') : x.host; });
  ok(home, '3. signed in through /chats/#signin-start and the account’s page, back on Today (/)', js(path));
  ok(path.some((x) => x.startsWith('/chats/#signin=')) && !path.some((x) => x.startsWith('/chats/in/')), '3. …milestone 1’s /chats/ did the trip itself (#signin= there), never /chats/in/ (S3-D8)', js(path));
  const s = await until(() => chatSession(A.p), 20000);
  ok(!!s?.token, '3. Chat’s session and key on this phone (IndexedDB inflight, S3-D4)');
  await shot(A.p, '3-today');
  const st = await until(() => A.p.evaluate(async () => { try { return (await window.IFL?.hub?.chat?.())?.state || null; } catch (_) { return null; } }), 40000);
  ok(st === 'ready', '3. Today: milestone 1’s IFL.hub.chat (the engine) ready', String(st));
  ok((await count(A.p, EXCEPT.CHAT_ENGINE)) === 1 && workers(A.p).core === 0, '3. the engine frame, and no chats-core Worker (Chats off)', js({ frames: await count(A.p, EXCEPT.CHAT_ENGINE), w: workers(A.p) }));
  const pw = (await hunt(['a long test password'], { seen })).filter((x) => !/(account|auth)\.ifl\.test/.test(x.where));
  ok(!pw.length, '3. the password in no request but the account’s own page’s', js(pw.slice(0, 3)));
});

const errs = (A.errs || []).filter((e) => !/Failed to load resource|404/.test(e));
ok(!errs.length, 'no page error on the pages of the trip', js(errs.slice(0, 6)));
await closeAll();
console.log(`FAILS ${fails()}`);
process.exit(0);
