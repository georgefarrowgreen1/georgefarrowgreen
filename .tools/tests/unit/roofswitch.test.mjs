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

test('roof_refused: a module’s on (Weather’s too) while ROOF_OFF is set is refused with the words; its off and all never are', { skip }, () => {
  const s = sandbox();
  s.names('inflite', ['HUB_KEY', 'ROOF_OFF']);
  for (const app of ['weather', 'markets', 'fitness', 'mail']) {
    const r = s.run(`roof_refused ${app} on inflite`);
    assert.notEqual(r.status, 0, app); assert.match(r.stdout, /Every module is off \(ROOF_OFF\)\. Turn them all on first\./);
    assert.equal(s.run(`roof_refused ${app} off inflite`).status, 0, `${app} off`);
  }
  assert.equal(s.run('roof_refused all on inflite').status, 0, 'all');
  assert.equal(s.run('roof_refused all off inflite').status, 0, 'all off');
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
  // (all on with Weather off by its own switch: ROOF_OFF is gone, so that's on, naming what's still off by its own switch)
  s.hub('inflite.ai', { ready: true, roof: false, apps: { weather: false, markets: true, fitness: false, mail: false } });
  let r = s.run('wait_roof https://inflite.ai all true 2');
  assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /says roof: true .*Off by their own switches still: Weather, Fitness, Mail\./);
  s.hub('inflite.ai', { ready: true, roof: true, apps: { weather: true, markets: false, fitness: false, mail: false } });
  r = s.run('wait_roof https://inflite.ai all true 2');
  assert.equal(r.status, 0); assert.match(r.stdout, /Off by their own switches still: Markets, Fitness, Mail\./);
  // (every module off, each by its own switch: reads as ROOF_OFF; the words say where to look)
  s.hub('inflite.ai', { ready: true, roof: false, apps: { weather: false, markets: false, fitness: false, mail: false } });
  r = s.run('wait_roof https://inflite.ai all true 2');
  assert.notEqual(r.status, 0); assert.match(r.stdout, /by its own switch, ROOF_OFF_WEATHER and ROOF_<APP>/);
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

// ---- roof.yml's own steps (stage 2's SV, s2 spec §7, RI5a): each step's script read out of the workflow and run as a
// runner would (bash -eo pipefail, its env), in the same sandbox, for every app × state × where ----
const YML = join(MAIN_DIR, '.github/workflows/roof.yml');
// (the run: block of the step with that id, its indentation taken off)
const stepOf = (id) => {
  const lines = readFileSync(YML, 'utf8').split('\n'), at = lines.findIndex((l) => new RegExp(`^\\s+id: ${id}\\s*$`).test(l));
  assert.ok(at > 0, `roof.yml has a step ${id}`);
  const run = lines.findIndex((l, i) => i > at && /^\s+run: \|\s*$/.test(l)), pad = /^\s*/.exec(lines[run + 1])[0].length;
  const out = [];
  for (let i = run + 1; i < lines.length && (lines[i].trim() === '' || /^\s*/.exec(lines[i])[0].length >= pad); i++) out.push(lines[i].slice(pad));
  return out.join('\n');
};
const ymlSkip = skip || (!existsSync(YML) && 'no roof.yml') || (!/\bROOF_APP\b/.test(readFileSync(YML, 'utf8')) && 'roof.yml from before stages 2–4 (no app input)');
const WHERE = { both: ['inflite-next', 'inflite'], 'inflite.ai': ['inflite'], 'next.inflite.ai': ['inflite-next'] };
const SITES = { both: ['https://inflite.ai', 'https://next.inflite.ai'], 'inflite.ai': ['https://inflite.ai'], 'next.inflite.ai': ['https://next.inflite.ai'] };
const GATE = { inflite: 'HUB_API', 'inflite-next': 'HUB_API_NEXT' };
const NAME = { all: 'Every module', weather: 'Weather', markets: 'Markets', fitness: 'Fitness', mail: 'Mail' };
function runStep(s, id, env) {
  return spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', stepOf(id)], { cwd: MAIN_DIR, encoding: 'utf8',
    env: { PATH: `${join(s.T, 'bin')}:${process.env.PATH}`, HOME: s.T, HUB_ACCOUNT: 'acc1', CLOUDFLARE_API_TOKEN: 'tok', EVERY: '1', GITHUB_WORKSPACE: MAIN_DIR, ...env } });
}

test('roof.yml’s set step, for every app × state × where: exactly these secrets, by name, put (or deleted for all on), staging first; for mail, Mail’s own switch first, both ways', { skip: ymlSkip }, () => {
  for (const where of Object.keys(WHERE)) for (const app of ['all', 'weather', 'markets', 'fitness', 'mail']) for (const state of ['on', 'off']) {
    const s = sandbox();
    // (ROOF_OFF there on each Worker, for all on to delete)
    for (const w of WHERE[where]) s.names(w, ['HUB_KEY', 'ROOF_OFF']);
    const r = runStep(s, 'set', { ROOF_APP: app, ROOF_STATE: state, ROOF_WHERE: where });
    const k = `${app} ${state} at ${where}`;
    assert.equal(r.status, 0, `${k}: ${r.stdout}${r.stderr}`);
    const v = { markets: state === 'on' ? '1' : '0', fitness: state === 'on' ? '1' : '0', mail: state === 'on' ? '1' : '0', weather: state === 'on' ? '0' : '1' }[app];
    const want = app === 'all' ? WHERE[where].map((w) => (state === 'off' ? `put ${w} ROOF_OFF=1` : `delete ${w} ROOF_OFF`))
      : [...(app === 'mail' ? WHERE[where].map((w) => `put inflite-email ${GATE[w]}=${v}`) : []),
        ...WHERE[where].map((w) => `put ${w} ${app === 'weather' ? 'ROOF_OFF_WEATHER' : `ROOF_${app.toUpperCase()}`}=${v}`)];
    assert.deepEqual(s.calls(), want, k);
    s.done();
  }
});

test('roof.yml’s allowed step: a module’s on, Weather’s included, refused while ROOF_OFF is set on any Worker named (nothing set after it); its off and all never; the settled step checks Mail’s own Worker for mail alone', { skip: ymlSkip }, () => {
  const s = sandbox();
  s.names('inflite', ['HUB_KEY', 'ROOF_OFF']); s.names('inflite-next', ['HUB_KEY']);
  for (const app of ['weather', 'markets', 'fitness', 'mail']) {
    let r = runStep(s, 'allowed', { ROOF_APP: app, ROOF_STATE: 'on', ROOF_WHERE: 'both' });
    assert.notEqual(r.status, 0, `${app} on, both`); assert.match(r.stdout, /Every module is off \(ROOF_OFF\)\. Turn them all on first\./);
    r = runStep(s, 'allowed', { ROOF_APP: app, ROOF_STATE: 'on', ROOF_WHERE: 'next.inflite.ai' });
    assert.equal(r.status, 0, `${app} on at next.inflite.ai, where ROOF_OFF isn’t: allowed`);
    assert.equal(runStep(s, 'allowed', { ROOF_APP: app, ROOF_STATE: 'off', ROOF_WHERE: 'both' }).status, 0, `${app} off`);
  }
  for (const state of ['on', 'off']) assert.equal(runStep(s, 'allowed', { ROOF_APP: 'all', ROOF_STATE: state, ROOF_WHERE: 'both' }).status, 0, `all ${state}`);
  assert.deepEqual(s.calls(), [], 'the check changes nothing');
  const env = (app) => ({ ROOF_APP: app, ROOF_STATE: 'on', ROOF_WHERE: 'inflite.ai', GITHUB_ENV: join(s.T, 'genv') });
  let r = runStep(s, 'settled', env('mail'));
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /The Worker inflite-email is settled/); assert.match(r.stdout, /The Worker inflite is settled/);
  r = runStep(s, 'settled', env('markets'));
  assert.equal(r.status, 0); assert.doesNotMatch(r.stdout, /inflite-email/); assert.match(r.stdout, /The Worker inflite is settled/);
  s.done();
});

test('roof.yml’s wait step reads each app’s own flag: on and off for every module, both hubs; never confirmed by another module’s flag', { skip: ymlSkip }, () => {
  const s = sandbox();
  const apps = (o) => ({ weather: true, markets: false, fitness: false, mail: false, ...o });
  for (const app of ['weather', 'markets', 'fitness']) for (const state of ['on', 'off']) {
    const on = state === 'on';
    for (const h of ['inflite.ai', 'next.inflite.ai']) s.hub(h, { ready: true, roof: app === 'weather' ? on : true, apps: apps({ [app]: on }) });
    let r = runStep(s, 'wait', { ROOF_APP: app, ROOF_STATE: state, ROOF_WHERE: 'both' });
    assert.equal(r.status, 0, `${app} ${state}: ${r.stdout}`); assert.match(r.stdout, new RegExp(`next\\.inflite\\.ai/api/hub says ${app}: ${on}`));
    // (the hubs saying the opposite of this app, every other flag as asked: red)
    const other = Object.fromEntries(Object.keys(apps()).filter((a) => a !== app).map((a) => [a, on]));
    for (const h of ['inflite.ai', 'next.inflite.ai']) s.hub(h, { ready: true, roof: true, apps: apps({ ...other, [app]: !on }) });
    r = runStep(s, 'wait', { ROOF_APP: app, ROOF_STATE: state, ROOF_WHERE: 'inflite.ai' });
    assert.notEqual(r.status, 0, `${app} ${state}, the hub saying otherwise`);
  }
  // (all: off only once roof and every module say off; on once roof does)
  s.hub('inflite.ai', { ready: true, roof: false, apps: apps({ weather: false, markets: true }) });
  assert.notEqual(runStep(s, 'wait', { ROOF_APP: 'all', ROOF_STATE: 'off', ROOF_WHERE: 'inflite.ai' }).status, 0, 'all off with Markets still on: red');
  s.hub('inflite.ai', { ready: true, roof: false, apps: apps({ weather: false }) });
  assert.equal(runStep(s, 'wait', { ROOF_APP: 'all', ROOF_STATE: 'off', ROOF_WHERE: 'inflite.ai' }).status, 0);
  s.done();
});

test('roof_verdict’s words for every app × state, green: names the module, the hubs and what it is now; asked by whom', { skip }, () => {
  const s = sandbox();
  const v = (app, state, where = 'both') => s.run('roof_verdict', { OUT_ACCOUNT: 'success', OUT_SETTLED: 'success', OUT_ALLOWED: 'success', OUT_SET: 'success', OUT_WAIT: 'success', ROOF_APP: app, ROOF_STATE: state, ROOF_WHERE: where, GITHUB_ACTOR: 'george' });
  const words = {
    'all off': 'The roof is off at https://inflite.ai https://next.inflite.ai: every module is the hub\'s milestone-1 page again (Weather at /weather/, and the others), its files not found.',
    'all on': 'The roof is on at https://inflite.ai https://next.inflite.ai: each module as its own switch says (Weather in InFlite\'s one page).',
    'weather off': 'Weather is off at https://inflite.ai https://next.inflite.ai: Weather is back to its own page at /weather/, its module\'s files not found.',
    'weather on': 'Weather is on at https://inflite.ai https://next.inflite.ai: Weather opens in InFlite\'s one page at /weather/.',
    'markets off': 'Markets is off at https://inflite.ai https://next.inflite.ai: Markets is back to its own page at /markets/, its module\'s files not found.',
    'markets on': 'Markets is on at https://inflite.ai https://next.inflite.ai: Markets opens in InFlite\'s one page at /markets/.',
    'fitness off': 'Fitness is off at https://inflite.ai https://next.inflite.ai: Fitness is back to its own page at /fitness/, its module\'s files not found.',
    'fitness on': 'Fitness is on at https://inflite.ai https://next.inflite.ai: Fitness opens in InFlite\'s one page at /fitness/.',
    'mail off': 'Mail is off at https://inflite.ai https://next.inflite.ai: Mail is back to its framed page at /mail/, its module\'s files not found.',
    'mail on': 'Mail is on at https://inflite.ai https://next.inflite.ai: Mail opens in InFlite\'s one page at /mail/.',
  };
  for (const [k, line] of Object.entries(words)) {
    const [app, state] = k.split(' '), r = v(app, state);
    assert.equal(r.status, 0, k);
    assert.ok(r.stdout.split('\n').includes(line), `${k}: ${r.stdout}`);
    assert.match(r.stdout, app === 'all' ? new RegExp(`Asked: the roof ${state} at both, by george`) : new RegExp(`Asked: ${NAME[app]} ${state} at both, by george`), k);
  }
  // (the set step failing part way: the switch's own name, red, level 2 named)
  for (const [app, name] of [['markets', 'ROOF_MARKETS'], ['fitness', 'ROOF_FITNESS'], ['weather', 'ROOF_OFF_WEATHER'], ['all', 'ROOF_OFF']]) {
    const r = s.run('roof_verdict', { OUT_ACCOUNT: 'success', OUT_SETTLED: 'success', OUT_ALLOWED: 'success', OUT_SET: 'failure', OUT_WAIT: 'skipped', ROOF_APP: app, ROOF_STATE: 'off', ROOF_WHERE: 'inflite.ai' });
    assert.notEqual(r.status, 0, app); assert.match(r.stdout, new RegExp(`${name} wasn't changed on every Worker`)); assert.match(r.stdout, /rollback level 2/);
  }
  s.done();
});
