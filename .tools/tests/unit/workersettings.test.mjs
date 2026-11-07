// Exercise the operational helpers with a fake Wrangler; never touches Cloudflare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const helper = fileURLToPath(new URL('../../../.github/hub/hub.sh', import.meta.url));
function run(code) {
  return spawnSync('bash', ['-eo', 'pipefail', '-c', `source "$1"
ACCOUNT=test
worker_settled() { echo "checked $1"; }
fake_wrangler() { local value; value=$(cat); echo "changed $* value=<$value>"; }
WRANGLER=fake_wrangler
${code}`, 'test', helper], { encoding: 'utf8' });
}
test('shared secrets update both existing site Workers, after both preflight checks', () => {
  const r = run('site_secret MAIL_KEY test-value');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /checked inflite-apps\nchecked gfg\nchanged secret put MAIL_KEY --name inflite-apps value=<test-value>/);
  assert.match(r.stdout, /changed secret put MAIL_KEY --name gfg value=<test-value>/);
});
test('a failed preflight leaves both Workers unchanged', () => {
  const r = run('worker_settled() { [ "$1" != gfg ]; }; site_secret HUB_KEY value');
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /changed/);
});
test('off switches override stored defaults instead of removing the override', () => {
  const r = run('site_off 1 1');
  assert.equal(r.status, 0, r.stderr);
  for (const w of ['inflite-apps', 'gfg']) {
    assert.ok(r.stdout.includes(`changed secret put HUB_KEY --name ${w} value=<>`));
    assert.ok(r.stdout.includes(`changed secret put HUB_PUSH --name ${w} value=<0>`));
    assert.ok(r.stdout.includes(`changed secret put TODAY_ACTS --name ${w} value=<0>`));
  }
  assert.doesNotMatch(r.stdout, /secret delete/);
});
