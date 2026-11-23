// Release checks have no third-party runtime dependencies and never print matched secret material.
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function checkLock(manifest, lock, label = 'package') {
  if (lock.lockfileVersion !== 3 || !lock.packages?.['']) throw Error(`${label}: expected npm lockfile v3`);
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const declared = manifest[group] || {}, locked = lock.packages[''][group] || {};
    if (JSON.stringify(Object.entries(declared).sort()) !== JSON.stringify(Object.entries(locked).sort())) throw Error(`${label}: manifest and lockfile disagree (${group})`);
  }
  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (!name) continue;
    let url;
    try { url = new URL(pkg.resolved); } catch { throw Error(`${label}: unresolved locked dependency ${name}`); }
    if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password || url.search || url.hash) throw Error(`${label}: untrusted dependency source ${name}`);
    if (!String(pkg.integrity || '').split(/\s+/).some(s => /^(sha256|sha384|sha512)-[A-Za-z0-9+/]+=*$/.test(s) && Buffer.from(s.split('-')[1], 'base64').length === ({ sha256: 32, sha384: 48, sha512: 64 })[s.split('-')[0]])) throw Error(`${label}: missing strong dependency integrity ${name}`);
  }
}

export function checkWorkflow(source, label = 'workflow', trustedRef = 'refs/heads/main') {
  // The caller supplies the known repository's canonical production branch;
  // a workflow may not nominate its own trusted ref or authorize feature secrets.
  if (!['refs/heads/main', 'refs/heads/claude/inflite'].includes(trustedRef)) throw Error(`${label}: unsupported trusted production ref`);
  const requiredGuard = `    if: github.ref == '${trustedRef}'`;
  if (/^\s*pull_request_target\s*:/m.test(source) || /^\s*permissions:\s*write-all/m.test(source)) throw Error(`${label}: privileged untrusted workflow event or permissions`);
  const jobs = source.split(/^jobs:\s*$/m)[1] || '';
  for (const block of jobs.split(/(?=^  [\w-]+:\s*$)/m)) {
    if (block.includes('secrets.') && !block.split('\n').some(line => line.trimEnd() === requiredGuard)) throw Error(`${label}: secret-bearing job is not restricted to the trusted production ref`);
  }
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/);
    if (!match || match[1].startsWith('./')) continue;
    if (!/^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/.test(match[1])) throw Error(`${label}: remote action is not pinned to a commit`);
    if (match[1].startsWith('actions/checkout@')) {
      let end = i + 1;
      while (end < lines.length && !/^\s*-\s/.test(lines[end])) end++;
      if (!/^\s*persist-credentials:\s*false\s*$/m.test(lines.slice(i, end).join('\n'))) throw Error(`${label}: checkout persists repository credentials`);
    }
  }
}

export function checkReleaseWorkflow(source) {
  const provision = source.indexOf('node .tools/workers/prepare-files-storage.mjs');
  const deploy = source.indexOf('node .tools/tests/node_modules/wrangler/bin/wrangler.js deploy');
  const audit = source.indexOf('node .tools/security/check.mjs --require-root --audit');
  const units = source.indexOf('node --test .tools/tests/unit/*.test.mjs');
  if (!(audit >= 0 && units > audit && provision > units && deploy > provision)) throw Error('Release must pass required audits and the complete unit suite before storage provisioning or deployment');
  if (!/--branch claude\/inflite .*\.\.\/inflite/.test(source) || !source.includes('npm ci --prefix ../inflite/email')) throw Error('Release security gate requires the production framework and Mail fixtures');
  const header = source.slice(source.indexOf('  deploy:'), source.indexOf('    steps:'));
  if (header.includes('secrets.')) throw Error('Production credentials must not be inherited by dependency installation or security tests');
  const steps = source.split(/^      - /m);
  for (const step of steps) {
    if ((step.includes('node .tools/security/check.mjs') || step.includes('node --test .tools/tests/unit/')) && (/continue-on-error:\s*true/.test(step) || !/^        if: steps\.ready\.outputs\.go == '1'\s*$/m.test(step))) throw Error('Release security gates cannot be optional when deployment credentials are present');
  }
}

export function secretFindings(source) {
  // High-confidence credential formats only; diagnostics identify a file and rule, never a matched value.
  const rules = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]{80,}/],
    ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{70,})\b/],
    ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ];
  return rules.filter(([, expression]) => expression.test(source)).map(([name]) => name);
}

export function packageRoots(apps, root, requireRoot = false) {
  const roots = [['tools', join(apps, '.tools/tests')], ['routing', join(apps, 'workers/routing')]];
  if (!existsSync(join(root, 'package-lock.json'))) {
    if (requireRoot) throw Error('Required sibling InFlite production checkout is missing');
    return roots;
  }
  return roots.concat([['root', root], ['mail', join(root, 'email')]]);
}

export function inspectRepository(repo, trustedRef = 'refs/heads/main') {
  for (const name of readdirSync(join(repo, '.github/workflows')).filter(s => /\.ya?ml$/.test(s))) checkWorkflow(readFileSync(join(repo, '.github/workflows', name), 'utf8'), relative(dirname(repo), join(repo, '.github/workflows', name)), trustedRef);
  const listing = spawnSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' });
  if (listing.status !== 0) throw Error('Could not enumerate tracked sources for credential scanning');
  let count = 0;
  for (const file of listing.stdout.split('\0').filter(Boolean)) {
    let body;
    try { body = readFileSync(join(repo, file)); } catch { continue; } // A staged deletion is not releasable content.
    if (body.includes(0) || body.length > 2 * 1024 * 1024) continue;
    const findings = secretFindings(body.toString('utf8'));
    if (findings.length) throw Error(`${relative(dirname(repo), join(repo, file))}: potential credential (${findings.join(', ')}; value redacted)`);
    count++;
  }
  return count;
}

export function auditPackages(roots, output, runner = spawnSync) {
  mkdirSync(output, { recursive: true });
  for (const [label, dir] of roots) {
    const result = runner('npm', ['audit', '--package-lock-only', '--ignore-scripts', '--json', '--registry=https://registry.npmjs.org/'], { cwd: dir, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    writeFileSync(join(output, `audit-${label}.json`), result.stdout || '{}');
    let report;
    try { report = JSON.parse(result.stdout); } catch { throw Error(`${label}: dependency audit did not return valid evidence`); }
    const total = report.metadata?.vulnerabilities?.total;
    if (result.error || result.status !== 0 || typeof total !== 'number' || total !== 0 || report.error) throw Error(`${label}: dependency audit failed (${typeof total === 'number' ? total + ' findings' : 'no complete report'}); see audit evidence`);
    console.log(`${label}: dependency audit clean`);
  }
}

export function run(args = process.argv.slice(2)) {
  const apps = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), root = resolve(apps, '../inflite');
  const roots = packageRoots(apps, root, args.includes('--require-root'));
  for (const [label, dir] of roots) checkLock(JSON.parse(readFileSync(join(dir, 'package.json'))), JSON.parse(readFileSync(join(dir, 'package-lock.json'))), label);
  const repos = [[apps, 'refs/heads/main']];
  if (roots.some(([label]) => label === 'root')) repos.push([root, 'refs/heads/claude/inflite']);
  checkReleaseWorkflow(readFileSync(join(apps, '.github/workflows/worker-deploy.yml'), 'utf8'));
  for (const [repo, trustedRef] of repos) console.log(`${relative(dirname(apps), repo)}: pinned actions, checkout credentials and ${inspectRepository(repo, trustedRef)} tracked text files checked`);
  if (args.includes('--audit')) {
    const at = args.indexOf('--out');
    if (at < 0 || !args[at + 1]) throw Error('Dependency audits require an explicit --out evidence directory');
    const output = resolve(args[at + 1]);
    mkdirSync(output, { recursive: true });
    const evidence = roots.map(([label, dir]) => ({ label, revision: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim(), files: Object.fromEntries(['package.json', 'package-lock.json'].map(file => [file, createHash('sha256').update(readFileSync(join(dir, file))).digest('hex')])) }));
    writeFileSync(join(output, 'locks.json'), JSON.stringify(evidence, null, 2) + '\n');
    auditPackages(roots, output);
  }
  console.log(`Supply-chain checks passed for ${roots.length} lockfiles`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) { console.error(`Security check failed: ${error.message}`); process.exitCode = 1; }
}
