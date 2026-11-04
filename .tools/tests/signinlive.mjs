// needs: hub
// The nightly sign-in check (live/signincheck.mjs, .github/workflows/signin-check.yml), run here against the test stack's
// stand-in for the site (ifl.test) with an account made for it: so the check itself is known to work before it's
// trusted with the real one.
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { CHROMIUM_ARGS, ACCOUNT_AT } from './rooflib.mjs';
import { makeAccount } from './join.mjs';
import { randomBytes } from 'node:crypto';
const [,, , out] = process.argv;
const email = `live${randomBytes(3).toString('hex')}@example.com`, password = 'a long test password';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: CHROMIUM_ARGS });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-GB' });
await makeAccount(await ctx.newPage(), `${ACCOUNT_AT}/`, { name: 'Casey Lin', handle: email.split('@')[0], email, password });
await b.close();
const r = spawnSync(process.execPath, [new URL('./live/signincheck.mjs', import.meta.url).pathname, out], { env: { ...process.env, SITE: 'http://ifl.test:8788', CHECK_EMAIL: email, CHECK_PASSWORD: password, CHECK_LOCAL: '1' }, encoding: 'utf8', timeout: 15 * 60e3 });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  the nightly check, against the test stack: every sign-in worked`);
console.log(`FAILS ${r.status === 0 ? 0 : 1}`);
