// One roof's switches in .github/hub/hub.sh (stage 1's ROOF_OFF; stages 2–4's per module, roof/s24-contracts.md §12),
// sourced in bash with wrangler (npx), curl and sleep stood in for on PATH (jq is the real one): for every app × state,
// the secret's exact name and value (put, or delete for all/on), the refusal of a module's on while ROOF_OFF is set,
// Mail's own switch first, and the verdict's words. Nothing real is asked. (The whole workflow, step by step, is the
// harness roof/j0-roof-test.sh's, with tf/i0-wfsim.py.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAIN_DIR } from './fixtures/roof.mjs';

const HUB = join(MAIN_DIR, '.github/hub/hub.sh');
const jq = spawnSync('bash', ['-c', 'command -v jq'], { encoding: 'utf8' }).status === 0;
const skip = !existsSync(HUB) ? 'no .github/hub/hub.sh' : !jq ? 'no jq on this machine' : !/^roof_secret\(\)/m.test(readFileSync(HUB, 'utf8')) && 'hub.sh from before stages 2–4 (no roof_secret)';

// (a scratch PATH: npx (wrangler) notes each put/delete; curl answers Cloudflare's API with a settled Worker and the
// secrets named in $T/names_<worker>, and the hubs' /api/hub from $T/hub_<host>)
function sandbox() {
  const T = mkdtempSync(join(tmpdir(), 'roofswitch-')), BIN = join(T, 'bin');
  spawnSync('mkdir', ['-p', BIN]);
  writeFileSync(join(BIN, 'npx'), `#!/usr/bin/env bash\nshift 2\nif [ "$1 $2" = "secret put" ]; then echo "put $5 $3=$(cat)" >> "${T}/calls"; elif [ "$1 $2" = "secret delete" ]; then echo "delete $5 $3" >> "${T}/calls"; else echo "other $*" >> "${T}/calls"; fi\n`);
  writeFileSync(join(BIN, 'curl'), `#!/usr/bin/env bash
out="" fmt="" url=""
while [ $# -gt 0 ]; do case "$1" in -o) out=$2; shift 2 ;; -w) fmt=$2; shift 2 ;; -X|-H|-A|--max-time|--data) shift 2 ;; -*) shift ;; *) url=$1; shift ;; esac; done
code=200
case "$url" in
  */deployments) body='{"success":true,"result":{"deployments":[{"versions":[{"version_id":"v1","percentage":100}]}]}}' ;;
  */versions) body='{"success":true,"result":{"items":[{"id":"v1","number":3}]}}' ;;
  */secrets) w=\${url%/secrets}; w=\${w##*/}; body="{\\"success\\":true,\\"result\\":[$(cat "${T}/names_$w" 2>/dev/null)]}" ;;
  */api/hub) h=\${url#https://}; h=\${h%%/*}; body=$(cat "${T}/hub_$h" 2>/dev/null || echo '{"ready":true,"roof":true}') ;;
  *) code=404; body='{}' ;;
esac
if [ -n "$out" ]; then printf '%s' "$body" > "$out"; else printf '%s' "$body"; fi
[ -n "$fmt" ] && printf "\${fmt//%\\{http_code\\}/$code}" | sed 's/%header{[^}]*}//g'
exit 0
`);
  writeFileSync(join(BIN, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  for (const f of ['npx', 'curl', 'sleep']) chmodSync(join(BIN, f), 0o755);
  const run = (script, env = {}) => spawnSync('bash', ['-c', `set -u; . "${HUB}"; ${script}`], { encoding: 'utf8', env: { PATH: `${BIN}:${process.env.PATH}`, HOME: T, HUB_ACCOUNT: 'acc1', CLOUDFLARE_API_TOKEN: 'tok', EVERY: '1', ...env } });
  const calls = () => (existsSync(join(T, 'calls')) ? readFileSync(join(T, 'calls'), 'utf8').trim().split('\n').filter(Boolean) : []);
  return { T, run, calls, names: (w, list) => writeFileSync(join(T, `names_${w}`), list.map((n) => `{"name":"${n}"}`).join(',')), hub: (host, j) => writeFileSync(join(T, `hub_${host}`), JSON.stringify(j)), done: () => rmSync(T, { recursive: true, force: true }) };
}

test('roof_secret: the one table of the switches’ names, for every app and state', { skip }, () => {
  const s = sandbox();
  const want = {
    'all off': 'ROOF_OFF 1', 'all on': 'ROOF_OFF -',
    'weather off': 'ROOF_OFF_WEATHER 1', 'weather on': 'ROOF_OFF_WEATHER 0',
    'markets on': 'ROOF_MARKETS 1', 'markets off': 'ROOF_MARKETS 0',
    'fitness on': 'ROOF_FITNESS 1', 'fitness off': 'ROOF_FITNESS 0',
    'mail on': 'ROOF_MAIL 1', 'mail off': 'ROOF_MAIL 0',
    'chats on': 'ROOF_CHATS 1', 'chats off': 'ROOF_CHATS 0',
  };
  for (const [k, v] of Object.entries(want)) { const r = s.run(`roof_secret ${k}`); assert.equal(r.status, 0, k); assert.equal(r.stdout.trim(), v, k); }
  for (const bad of ['news on', 'markets maybe', 'all', '"" on']) { const r = s.run(`roof_secret ${bad}`); assert.notEqual(r.status, 0, bad); assert.match(r.stdout, /Nothing was changed/); }
  assert.equal(s.run('mail_gate inflite').stdout.trim(), 'HUB_API'); assert.equal(s.run('mail_gate inflite-next').stdout.trim(), 'HUB_API_NEXT');
  assert.notEqual(s.run('mail_gate inflite-email').status, 0);
  s.done();
});

test('roof_set: puts the value it’s given by name on the Worker named (stdin, never versions secret put); deletes for "-" only where it’s there; stage 1’s off|on still ROOF_OFF’s', { skip }, () => {
  const s = sandbox();
  for (const [w, n, v] of [['inflite', 'ROOF_MARKETS', '1'], ['inflite-next', 'ROOF_FITNESS', '0'], ['inflite', 'ROOF_OFF_WEATHER', '1'], ['inflite-email', 'HUB_API', '1'], ['inflite-email', 'HUB_API_NEXT', '0']]) assert.equal(s.run(`roof_set ${w} ${n} ${v}`).status, 0, `${w} ${n}`);
  assert.deepEqual(s.calls(), ['put inflite ROOF_MARKETS=1', 'put inflite-next ROOF_FITNESS=0', 'put inflite ROOF_OFF_WEATHER=1', 'put inflite-email HUB_API=1', 'put inflite-email HUB_API_NEXT=0']);
  // (delete: only what's there; nothing to delete is fine)
  let r = s.run('roof_set inflite ROOF_OFF -');
  assert.equal(r.status, 0); assert.match(r.stdout, /has no ROOF_OFF: the roof is on there already/); assert.equal(s.calls().length, 5);
  s.names('inflite', ['HUB_KEY', 'ROOF_OFF']);
  assert.equal(s.run('roof_set inflite ROOF_OFF -').status, 0);
  assert.equal(s.calls().at(-1), 'delete inflite ROOF_OFF');
  // (stage 1's form)
  assert.equal(s.run('roof_set inflite off').status, 0); assert.equal(s.calls().at(-1), 'put inflite ROOF_OFF=1');
  // (refused: an unknown name, value or Worker; nothing changed)
  const n = s.calls().length;
  for (const bad of ['inflite HUB_KEY 1', 'inflite ROOF_MARKETS yes', 'inflite-other ROOF_MARKETS 1', 'inflite ROOF_MARKETS']) { r = s.run(`roof_set ${bad}`); assert.notEqual(r.status, 0, bad); }
  assert.equal(s.calls().length, n, 'nothing changed');
  assert.ok(!s.calls().some((c) => /versions/.test(c)), 'never versions secret put');
  s.done();
});

test('roof_refused: a module’s on while ROOF_OFF is set is refused with the words; its off, all and weather never are', { skip }, () => {
  const s = sandbox();
  s.names('inflite', ['HUB_KEY', 'ROOF_OFF']);
  for (const app of ['markets', 'fitness', 'mail']) {
    const r = s.run(`roof_refused ${app} on inflite`);
    assert.notEqual(r.status, 0, app); assert.match(r.stdout, /Every module is off \(ROOF_OFF\)\. Turn them all on first\./);
    assert.equal(s.run(`roof_refused ${app} off inflite`).status, 0, `${app} off`);
  }
  for (const app of ['all', 'weather']) assert.equal(s.run(`roof_refused ${app} on inflite`).status, 0, app);
  s.names('inflite', ['HUB_KEY', 'ROOF_MARKETS']);
  assert.equal(s.run('roof_refused markets on inflite').status, 0, 'no ROOF_OFF: allowed');
  s.done();
});

test('wait_roof: reads the app’s own flag in apps (roof for all; a Worker from before: off, never on)', { skip }, () => {
  const s = sandbox();
  s.hub('inflite.ai', { ready: true, roof: true, apps: { weather: true, markets: true, fitness: false, mail: false } });
  assert.equal(s.run('wait_roof https://inflite.ai markets true 2').status, 0);
  assert.equal(s.run('wait_roof https://inflite.ai fitness false 2').status, 0);
  assert.notEqual(s.run('wait_roof https://inflite.ai fitness true 2').status, 0);
  assert.equal(s.run('wait_roof https://inflite.ai true 2').status, 0, 'stage 1’s form: all');
  assert.notEqual(s.run('wait_roof https://inflite.ai all false 2').status, 0, 'all off needs every module off');
  s.hub('inflite.ai', { ready: true, roof: false, apps: { weather: false, markets: false, fitness: false, mail: false } });
  assert.equal(s.run('wait_roof https://inflite.ai all false 2').status, 0);
  s.hub('inflite.ai', { ready: true, roof: true });
  assert.equal(s.run('wait_roof https://inflite.ai markets false 2').status, 0, 'a stage-1 Worker: Markets off');
  assert.notEqual(s.run('wait_roof https://inflite.ai markets true 2').status, 0, 'and never on');
  assert.equal(s.run('wait_roof https://inflite.ai weather true 2').status, 0, 'Weather from roof');
  s.done();
});

test('roof_verdict: names the module and what it is now; refusals and failures say so and fail the run', { skip }, () => {
  const s = sandbox();
  const v = (env) => s.run('roof_verdict', { OUT_ACCOUNT: 'success', OUT_SETTLED: 'success', OUT_ALLOWED: 'success', OUT_SET: 'success', OUT_WAIT: 'success', ROOF_WHERE: 'inflite.ai', ...env });
  let r = v({ ROOF_APP: 'markets', ROOF_STATE: 'on' });
  assert.equal(r.status, 0); assert.match(r.stdout, /Markets is on at https:\/\/inflite\.ai: Markets opens in InFlite's one page at \/markets\//);
  r = v({ ROOF_APP: 'fitness', ROOF_STATE: 'off' });
  assert.equal(r.status, 0); assert.match(r.stdout, /Fitness is back to its own page at \/fitness\//);
  r = v({ ROOF_APP: 'mail', ROOF_STATE: 'off' });
  assert.match(r.stdout, /Mail is back to its framed page at \/mail\//);
  r = v({ ROOF_APP: 'weather', ROOF_STATE: 'off' });
  assert.match(r.stdout, /Weather is back to its own page at \/weather\//);
  r = v({ ROOF_STATE: 'off' });
  assert.match(r.stdout, /The roof is off at https:\/\/inflite\.ai/); assert.match(r.stdout, /Asked: the roof off at inflite\.ai/);
  r = v({ ROOF_APP: 'markets', ROOF_STATE: 'on', OUT_ALLOWED: 'failure', OUT_SET: 'skipped', OUT_WAIT: 'skipped' });
  assert.notEqual(r.status, 0); assert.match(r.stdout, /Refused, nothing changed: every module is off \(ROOF_OFF\)/);
  r = v({ ROOF_APP: 'markets', ROOF_STATE: 'on', OUT_WAIT: 'failure' });
  assert.notEqual(r.status, 0); assert.match(r.stdout, /ROOF_MARKETS is set on inflite, but not every hub said so in time/);
  r = v({ ROOF_APP: 'mail', ROOF_STATE: 'on', OUT_SETTLED: 'failure' });
  assert.notEqual(r.status, 0); assert.match(r.stdout, /Refused, nothing changed: not every Worker/);
  s.done();
});
