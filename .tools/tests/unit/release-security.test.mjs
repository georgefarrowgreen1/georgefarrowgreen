import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkLock, checkWorkflow, checkReleaseWorkflow, secretFindings, packageRoots, auditPackages, inspectRepository } from '../../security/check.mjs';
import { trustedSignInSite } from '../live/trusted-site.mjs';

const pkg = { dependencies: { example: '1.2.3' } };
function locked() { return { lockfileVersion: 3, packages: { '': { dependencies: { ...pkg.dependencies } }, 'node_modules/example': { resolved: 'https://registry.npmjs.org/example/-/example-1.2.3.tgz', integrity: 'sha512-' + Buffer.alloc(64, 7).toString('base64') } } }; }
const pinned = 'a'.repeat(40);
const checkout = `permissions:\n  contents: read\njobs:\n  check:\n    steps:\n      - uses: actions/checkout@${pinned}\n        with:\n          persist-credentials: false\n`;

test('lock policy rejects manifest drift, registry substitution and missing or weak integrity', () => {
  checkLock(pkg, locked());
  const changes = [l => l.packages[''].dependencies.example = '^1.2.3', l => l.packages['node_modules/example'].resolved = 'http://registry.npmjs.org/example.tgz', l => l.packages['node_modules/example'].resolved = 'https://registry.npmjs.org.evil.test/example.tgz', l => l.packages['node_modules/example'].resolved = 'https://credential@registry.npmjs.org/example.tgz', l => l.packages['node_modules/example'].integrity = 'sha1-' + Buffer.alloc(20).toString('base64'), l => l.packages['node_modules/example'].integrity = 'sha512-short'];
  for (const mutate of changes) { const lock = locked(); mutate(lock); assert.throws(() => checkLock(pkg, lock)); }
});
test('workflow policy rejects mutable actions, persisted tokens and privileged untrusted execution', () => {
  checkWorkflow(checkout);
  assert.throws(() => checkWorkflow(checkout.replace(pinned, 'v4')), /not pinned/);
  assert.throws(() => checkWorkflow(checkout.replace('persist-credentials: false', 'persist-credentials: true')), /persists/);
  assert.throws(() => checkWorkflow('on:\n  pull_request_target:\n' + checkout), /privileged/);
  assert.throws(() => checkWorkflow(checkout + '    env:\n      KEY: ${{ secrets.DEPLOY_TOKEN }}\n'), /trusted production ref/);
});
function credentialedWorkflow(ref) {
  return checkout.replace('  check:\n', `  check:\n    if: github.ref == '${ref}'\n`) + '    env:\n      KEY: ${{ secrets.DEPLOY_TOKEN }}\n';
}
test('secret-bearing workflows use only their own repository canonical production ref', () => {
  checkWorkflow(credentialedWorkflow('refs/heads/main')); // Preserve account defaults.
  const refs = ['refs/heads/main', 'refs/heads/claude/inflite', 'refs/heads/atlas-integration', 'refs/heads/feature/release', 'refs/heads/main-copy', 'refs/tags/main'];
  for (const trustedRef of ['refs/heads/main', 'refs/heads/claude/inflite']) {
    for (const ref of refs) {
      if (ref === trustedRef) checkWorkflow(credentialedWorkflow(ref), 'workflow', trustedRef);
      else assert.throws(() => checkWorkflow(credentialedWorkflow(ref), 'workflow', trustedRef), /trusted production ref/);
    }
  }
  for (const ref of ['refs/heads/atlas-integration', 'refs/heads/trunk', 'refs/tags/main']) {
    assert.throws(() => checkWorkflow(credentialedWorkflow(ref), 'workflow', ref), /unsupported trusted production ref/);
  }
});
test('repository inspection forwards its canonical ref without trusting the checkout name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'workflow-policy-'));
  try {
    mkdirSync(join(dir, '.github/workflows'), { recursive: true });
    writeFileSync(join(dir, '.github/workflows/deploy.yml'), credentialedWorkflow('refs/heads/claude/inflite'));
    execFileSync('git', ['init', '--quiet', dir]);
    assert.throws(() => inspectRepository(dir), /trusted production ref/);
    assert.equal(inspectRepository(dir, 'refs/heads/claude/inflite'), 0);
    writeFileSync(join(dir, '.github/workflows/deploy.yml'), credentialedWorkflow('refs/heads/atlas-integration'));
    assert.throws(() => inspectRepository(dir, 'refs/heads/claude/inflite'), /trusted production ref/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('the actual release cannot bypass security failures or share production tokens with the gate', () => {
  const source = readFileSync(new URL('../../../.github/workflows/worker-deploy.yml', import.meta.url), 'utf8');
  checkReleaseWorkflow(source);
  assert.throws(() => checkReleaseWorkflow(source.replace('--require-root --audit', '--require-root')));
  assert.throws(() => checkReleaseWorkflow(source.replace('node --test .tools/tests/unit/*.test.mjs', 'node --test .tools/tests/unit/acctsec.test.mjs')));
  assert.throws(() => checkReleaseWorkflow(source.replace('    steps:', '    env:\n      KEY: ${{ secrets.DEPLOY_TOKEN }}\n    steps:')), /credentials/);
  assert.throws(() => checkReleaseWorkflow(source.replace('        run: node --test', '        continue-on-error: true\n        run: node --test')), /cannot be optional/);
});
test('fork-local checks may omit the sibling framework while production checks fail closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-fixture-'));
  try {
    assert.equal(packageRoots(dir, join(dir, 'missing')).length, 2);
    assert.throws(() => packageRoots(dir, join(dir, 'missing'), true), /Required sibling/);
    mkdirSync(join(dir, 'root')); writeFileSync(join(dir, 'root/package-lock.json'), '{}');
    assert.equal(packageRoots(dir, join(dir, 'root'), true).length, 4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('secret scanning reports only redacted rule names and does not treat secret references as secrets', () => {
  const example = 'gh' + 'p_' + 'A'.repeat(36);
  assert.deepEqual(secretFindings(`token=${example}`), ['github-token']);
  assert.ok(!JSON.stringify(secretFindings(example)).includes(example));
  assert.deepEqual(secretFindings('${{ secrets.CLOUDFLARE_API_TOKEN }}'), []);
});
test('credentialed monitoring accepts only owned HTTPS sites and the explicit local fixture', () => {
  for (const origin of ['https://inflite.ai', 'https://next.inflite.ai', 'https://os.inflite.ai']) assert.equal(trustedSignInSite(origin), origin);
  for (const origin of ['https://evil.test', 'https://inflite.ai.evil.test', 'http://inflite.ai', 'https://inflite.ai:8443', 'https://user@inflite.ai', 'https://inflite.ai/?next=evil', 'http://ifl.test:8788']) assert.throws(() => trustedSignInSite(origin));
  assert.equal(trustedSignInSite('http://ifl.test:8788', true), 'http://ifl.test:8788');
  assert.throws(() => trustedSignInSite('http://evil.test', true));
});

test('dependency audits retain evidence and fail closed on findings, failed network or incomplete output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-evidence-'));
  try {
    const cases = [
      { status: 1, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 1 } } }) },
      { status: 1, stdout: JSON.stringify({ error: { code: 'ENETUNREACH' } }) },
      { status: 0, stdout: '{}' },
      { status: 0, stdout: 'not json' },
      { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }), error: Error('timeout') },
    ];
    for (const result of cases) {
      assert.throws(() => auditPackages([['fixture', dir]], dir, () => result));
      assert.equal(readFileSync(join(dir, 'audit-fixture.json'), 'utf8'), result.stdout);
    }
    auditPackages([['fixture', dir]], dir, (command, args) => {
      assert.equal(command, 'npm'); assert.ok(args.includes('--package-lock-only')); assert.ok(args.includes('--ignore-scripts'));
      return { status: 0, stdout: JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }) };
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
