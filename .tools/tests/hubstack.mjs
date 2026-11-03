// InFlite's hub for the end-to-end tests (spec §14.5), beside server.sh's site (pages dev on :8788) and its typing
// Worker (:8790): the host pass-throughs (mocks/hostpass.mjs, each app's own address on a port of its own, every request
// noted in $S/hostpass.jsonl), the inflite repo's root Worker (Today and the hub) in wrangler dev on :8787, speaking as
// each app's address on the tests' site and connecting through its pass-through, and, for a test that says
// `// needs: hub mail`, Mail's Worker on :8806. A browser reaches the hub as http://ifl.test:8788 (lib.mjs hubPhone:
// MAP ifl.test:8788 127.0.0.1:8787).
//   node hubstack.mjs <state dir> [mail] [roof-off] [roof-off-weather] [roof-<app>]…   starts them, writes
//                                            <state>/hubstack.up once they answer, and stays until it's stopped (SIGTERM,
//                                            SIGINT), stopping them all (run.sh does both). The switches (a test's
//                                            `// needs: hub …`; roof/s24-contracts.md §1, §13): roof-off: the Worker with
//                                            ROOF_OFF "1" (every module off: the hub's milestone-1 pages); roof-off-weather:
//                                            ROOF_OFF_WEATHER "1" (Weather alone off); roof-<app> (roof-markets,
//                                            roof-fitness, roof-mail, …): ROOF_<APP> "1", that module on (each is off by
//                                            default); roof-mail also opens Mail's own gate for the test hub
//                                            (HUB_API_TEST "1" on Mail's Worker).
//   Mail's Worker is reached by the root Worker through a pass-through of its own (port 8807 → :8806, MAIL_VIA), so
//   what passes is noted in hostpass.jsonl as the apps' requests are; MAIL_KEY is the key Mail's Worker and the account
//   share (the account's is server.sh's).
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, rmSync, openSync } from 'node:fs';

const HERE = new URL('./', import.meta.url).pathname;
const [,, S, ...want] = process.argv;
const ROOT = process.env.APP_ROOT || new URL('../../', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || `${ROOT}/../inflite/`;
const mail = want.includes('mail') || want.includes('roof-mail'), roofOff = want.includes('roof-off');
// (one rule for every module's switch: roof-<app> → ROOF_<APP> "1"; roof-off and roof-off-weather are the off switches)
const ROOFS = Object.fromEntries(want.filter((w) => /^roof-[a-z]+$/.test(w) && !['roof-off'].includes(w)).map((w) => (w === 'roof-off-weather' ? ['ROOF_OFF_WEATHER', '1'] : [`ROOF_${w.slice(5).toUpperCase()}`, '1'])));
if (want.includes('roof-off-weather')) ROOFS.ROOF_OFF_WEATHER = '1';
if (!S) { console.error('usage: node hubstack.mjs <state dir> [mail] [roof-off] [roof-off-weather] [roof-<app>]…'); process.exit(2); }
if (!existsSync(`${IFL}/today/src/hub.js`)) { console.error(`no inflite repo beside (${IFL})`); process.exit(3); }
rmSync(`${S}/hubstack.up`, { force: true });
writeFileSync(`${S}/hostpass.jsonl`, '');

// the ports (8790 is the typing Worker's; 8789 Today's stand-in's; 8793–8801 the other stand-ins')
const PASS = { 8791: 'account.ifl.test:8788', 8792: 'chat.ifl.test:8788', 8802: 'weather.ifl.test:8788', 8803: 'fitness.ifl.test:8788', 8804: 'finance.ifl.test:8788',
  ...(mail ? { 8807: 'email.ifl.test:8788>8806' } : {}) };
const VARS = {
  ACCOUNT_ORIGIN: 'http://127.0.0.1:8791',
  CHAT_ORIGIN: 'http://chat.ifl.test:8788', CHAT_VIA: 'http://127.0.0.1:8792',
  WEATHER_ORIGIN: 'http://weather.ifl.test:8788', WEATHER_VIA: 'http://127.0.0.1:8802',
  FITNESS_ORIGIN: 'http://fitness.ifl.test:8788', FITNESS_VIA: 'http://127.0.0.1:8803',
  MARKETS_ORIGIN: 'http://finance.ifl.test:8788', MARKETS_VIA: 'http://127.0.0.1:8804',
  MAIL_ORIGIN: 'http://email.ifl.test:8788', AUTH_ORIGIN: 'http://auth.ifl.test:8788',
  ...(mail ? { MAIL_VIA: 'http://127.0.0.1:8807' } : {}),
  HUB_KEY: 'hub-test-key', TEST_AT: '1',
  ...(roofOff ? { ROOF_OFF: '1' } : {}),
  ...ROOFS,
};
const vars = (o) => Object.entries(o).flatMap(([k, v]) => ['--var', `${k}:${v}`]);
const wrangler = [`${IFL}/node_modules/.bin/wrangler`, `${HERE}node_modules/.bin/wrangler`].find((f) => existsSync(f));
const log = (name) => openSync(`${S}/${name}.log`, 'a');
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };

const kids = [];
// (each in a process group of its own, so stopping it stops what it started)
const start = (cmd, args, cwd, name) => { const k = spawn(cmd, args, { cwd, detached: true, stdio: ['ignore', log(name), log(name)], env }); kids.push(k); return k; };
start(process.execPath, [`${HERE}mocks/hostpass.mjs`, `${S}/hostpass.jsonl`, ...Object.entries(PASS).map(([p, h]) => `${p}=${h}`)], HERE, 'hostpass');
start(wrangler, ['dev', '-c', 'wrangler.toml', '--port', '8787', '--inspector-port', '9231', '--show-interactive-dev-session=false', '--persist-to', `${S}/iflstate`, ...vars(VARS)], IFL, 'ifl');
// (--local-upstream: wrangler dev otherwise puts its first route's host in place of the browser's Origin, and the account
// refuses Mail's hand-back from the frame)
if (mail) start(wrangler, ['dev', '-c', 'wrangler.jsonc', '--port', '8806', '--inspector-port', '9232', '--show-interactive-dev-session=false', '--local-upstream', 'email.ifl.test:8788', '--persist-to', `${S}/mailstate`,
  ...vars({ ACCOUNT_ORIGIN: 'http://127.0.0.1:8791', HUB_ORIGIN: 'http://ifl.test:8788', MAIL_KEY: 'mail-test-key', ...(want.includes('roof-mail') ? { HUB_API_TEST: '1' } : {}) })], `${IFL}/email`, 'mail');

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return; stopping = true;
  for (const k of kids) { try { process.kill(-k.pid, 'SIGTERM'); } catch (_) {} }
  setTimeout(() => { for (const k of kids) { try { process.kill(-k.pid, 'SIGKILL'); } catch (_) {} } rmSync(`${S}/hubstack.up`, { force: true }); process.exit(code); }, 1500);
};
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => stop(0));
for (const k of kids) k.on('exit', (c) => { if (!stopping) { console.error(`hubstack: ${k.spawnargs.slice(0, 3).join(' ')} stopped (${c})`); stop(1); } });

// (up: each pass-through reaching the site, the Worker's /version, Mail's page)
const answers = async (url, ok = (r) => r.status < 500) => { try { return ok(await fetch(url, { signal: AbortSignal.timeout(5000) })); } catch (_) { return false; } };
const checks = [...Object.keys(PASS).map((p) => `http://127.0.0.1:${p}/version`), 'http://127.0.0.1:8787/version', ...(mail ? ['http://127.0.0.1:8806/'] : [])];
for (let i = 0; ; i++) {
  if ((await Promise.all(checks.map((u) => answers(u)))).every(Boolean)) break;
  if (i > 120) { console.error('hubstack: not up after 2 minutes'); stop(1); break; }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!stopping) { writeFileSync(`${S}/hubstack.up`, String(Date.now())); console.log('hubstack: up'); }
setInterval(() => {}, 1 << 30);
