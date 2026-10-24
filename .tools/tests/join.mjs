// A new account, as one's made now: from InFlight's welcome (Create your account), on the account's own page (accounts
// are made there, and signed in to there, and only there), and straight back to InFlight, signed in (its place chosen,
// and its passkey offer answered). For the tests that start with someone new.
//   joinInFlight(page, inflightUrl, { name, handle, email, password, city, passkey })
//   makeAccount(page, accountUrl, { name, handle, email, password }), signInInFlight(page, inflightUrl, { email, password })
//   onAccountPage(page, { email, password }): on the account's page, sent there by an app to sign in; then back in it
import http from 'http';
export const PASSWORD = 'a long test password';
// the account's page beside InFlight: account.<site> beside chat.<site>; account.localhost beside InFlight run locally
export function accountUrl(inflight) {
  const u = new URL(inflight), port = u.port ? ':' + u.port : '';
  return u.hostname.startsWith('chat.') ? `${u.protocol}//account.${u.hostname.slice(5)}${port}/` : `${u.protocol}//account.localhost${port}/`;
}
// (a new load of the page even where only the # differs from where it is)
async function open(page, url) {
  let same = false;
  try { const a = new URL(page.url()), b = new URL(url); same = a.origin === b.origin && a.pathname === b.pathname && a.search === b.search; } catch (_) {}
  await page.goto(url);
  if (same) await page.reload();
}
export async function makeAccount(page, acct, { name, handle, email, password = PASSWORD }) {
  await open(page, `${acct}#join`);
  await page.waitForSelector('main .signin input[name=name]', { timeout: 30000 });
  await page.fill('main input[name=name]', name);
  await page.fill('main input[name=handle]', handle);
  await page.fill('main input[name=email]', email);
  await page.fill('main input[name=password]', password);
  await page.click('main .signin form .btn');
  await page.waitForSelector('main .hero', { timeout: 60000 });
}
// On the account's page, sent there by an app to sign in: its sign-in (email and password), or, signed in there
// already, the password to carry on as yourself; then back in the app. → the page's address, if it signed in just now
// (rather than carrying on as who it had signed in already)
export async function onAccountPage(page, { email, password = PASSWORD }) {
  await page.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 30000 });
  await page.waitForSelector('main .signin input[name=password]', { timeout: 30000 });
  const acct = new URL(page.url()).origin + '/', fresh = !!(await page.$('main .signin input[name=email]'));
  if (fresh) await page.fill('main .signin input[name=email]', email);
  await page.fill('main .signin input[name=password]', password);
  await page.click('main .signin form .btn');
  await page.waitForURL((u) => !u.hostname.startsWith('account.'), { timeout: 60000 });
  return fresh ? acct : null;
}
// Where the account's page and the app don't share the site's sign-in (as locally, apart from the tests' gfg.test), the
// page's own, made just to hand InFlight its sign-in, signed out again once InFlight has it: so the account has just
// InFlight's, as on the site, where the page's sign-in is moved to the app it's handed to
// (straight to this machine, with the page's cookie: only the browser knows account.localhost by name; and only the
// page's own, as the browser would send it: InFlight's on localhost isn't, though Playwright lists it for the address)
async function pageOut(page, inflight, acct) {
  if (!acct || new URL(inflight).hostname.endsWith('.gfg.test')) return;
  await page.waitForSelector('.tabs, #city', { state: 'attached', timeout: 60000 });
  const u = new URL(acct), cookie = (await page.context().cookies(acct)).filter((c) => c.domain.replace(/^\./, '') === u.hostname)
    .map((c) => `${c.name}=${c.value}`).join('; ');
  if (!cookie) return;
  await new Promise((done) => {
    const r = http.request({ host: '127.0.0.1', port: u.port || 80, path: '/api/account/signout', method: 'POST',
      headers: { Host: u.host, Origin: u.origin, Cookie: cookie, 'Content-Type': 'application/json', 'Content-Length': 2 } }, (res) => { res.resume(); res.on('end', done); });
    r.on('error', done); r.end('{}');
  });
  await page.context().clearCookies({ domain: u.hostname }).catch(() => {});
}
// InFlight signed in to: its Sign in (Continue as, signed in on the site already where its sign-in is shared), on the
// account's page, and back
export async function signInInFlight(page, inflight, { email, password = PASSWORD }) {
  await open(page, inflight);
  await page.waitForSelector('.welcome [data-act=acctsignin]', { state: 'visible', timeout: 30000 });
  await page.click('.welcome [data-act=acctsignin]');
  await pageOut(page, inflight, await onAccountPage(page, { email, password }));
}
export async function joinInFlight(page, inflight, { name, handle, email, password = PASSWORD, city, passkey = false }) {
  await open(page, inflight);
  await page.waitForSelector('.welcome [data-act=acctjoin]', { state: 'visible', timeout: 30000 });
  await page.click('.welcome [data-act=acctjoin]');
  await page.waitForSelector('main .signin input[name=name]', { timeout: 30000 });
  await page.fill('main input[name=name]', name);
  await page.fill('main input[name=handle]', handle);
  await page.fill('main input[name=email]', email);
  await page.fill('main input[name=password]', password);
  const acct = new URL(page.url()).origin + '/';
  await page.click('main .signin form .btn');
  await page.waitForURL((u) => !u.hostname.startsWith('account.'), { timeout: 60000 });
  await page.waitForSelector('#city', { state: 'attached', timeout: 40000 });
  await pageOut(page, inflight, acct);
  if (city) await page.selectOption('#city', city);
  await page.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
  await page.click(passkey ? '[data-act=pkadd]' : '[data-act=onbdone]');
  await page.waitForSelector('.tabs', { timeout: 30000 });
}
