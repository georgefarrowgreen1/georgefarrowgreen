// A new account, as one's made now: from Chat's welcome (Create your account), on the account's own page (accounts
// are made there, and signed in to there, and only there), and straight back to Chat, signed in (its place chosen,
// and its passkey offer answered). For the tests that start with someone new.
//   joinChat(page, inflightUrl, { name, handle, email, password, city, passkey })
//   makeAccount(page, accountUrl, { name, handle, email, password }), signInChat(page, inflightUrl, { email, password })
//   onAccountPage(page, { email, password }): on the account's page, sent there by an app to sign in; then back in it
//   fillJoin(page, { name, handle, email, password }, { send }): the account's page's join card, a step at a time
import http from 'http';
export const PASSWORD = 'a long test password';
// the account's page beside Chat: account.<site> beside chat.<site>; account.localhost beside Chat run locally
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
  await fillJoin(page, { name, handle, email, password });
  await page.waitForSelector('main .hero', { timeout: 60000 });
}
// The account's page's join card, a step at a time (Next after each): name, handle, email, then the password, and
// Create account (unless not sent)
export async function fillJoin(page, { name, handle, email, password = PASSWORD }, { send = true } = {}) {
  const step = async (f, v, last) => {
    await page.waitForSelector(`main .signin input[name=${f}]`, { state: 'visible', timeout: 30000 });
    await page.fill(`main .signin input[name=${f}]`, v);
    if (!last || send) await page.click('main .signin form .btn');
  };
  await step('name', name); await step('handle', handle); await step('email', email); await step('password', password, true);
}
// On the account's page, sent there by an app to sign in: its sign-in (email and password), or, signed in there
// already, the password to carry on as yourself; then back in the app. → the page's address, if it signed in just now
// (rather than carrying on as who it had signed in already)
export async function onAccountPage(page, { email, password = PASSWORD }) {
  await page.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 30000 });
  await page.waitForSelector('main .signin input[name=password]', { state: 'attached', timeout: 30000 });
  const acct = new URL(page.url()).origin + '/';
  // (signed in there before as someone else, who it remembers: Not you?)
  const known = await page.$eval('main .signin.remembered input[type=email]', (i) => i.value).catch(() => null);
  if (known && known !== email) { await page.click('main .notyou'); await page.waitForSelector('main .signin input[name=email]', { timeout: 20000 }); }
  const typed = !!(await page.$('main .signin input[name=email]')), fresh = typed || known === email;
  if (typed) await page.fill('main .signin input[name=email]', email);
  // (last time with a passkey: the password a tap away)
  if (!(await page.isVisible('main .signin input[name=password]')) && await page.$('main .signin .usepw')) await page.click('main .signin .usepw');
  await page.fill('main .signin input[name=password]', password);
  await page.click('main .signin form .btn');
  await pastOffer(page);
  return fresh ? acct : null;
}
// Back in the app: past a passkey offered on the way, if there's one (Not now). → whether there was
export async function pastOffer(page) {
  const gone = (u) => !u.hostname.startsWith('account.');
  const offer = await Promise.race([page.waitForURL(gone, { timeout: 60000 }).then(() => false),
    page.waitForSelector('main .signin.offer .link', { timeout: 60000 }).then(() => true)]).catch(() => false);
  if (offer && !gone(new URL(page.url()))) await page.click('main .signin.offer .link');
  await page.waitForURL(gone, { timeout: 60000 });
  return offer;
}
// Where the account's page and the app don't share the site's sign-in (as locally, apart from the tests' gfg.test), the
// page's own, made just to hand Chat its sign-in, signed out again once Chat has it: so the account has just
// Chat's, as on the site, where the page's sign-in is moved to the app it's handed to
// (straight to this machine, with the page's cookie: only the browser knows account.localhost by name; and only the
// page's own, as the browser would send it: Chat's on localhost isn't, though Playwright lists it for the address)
async function pageOut(page, inflight, acct) {
  if (!acct || new URL(inflight).hostname.endsWith('.ifl.test')) return;
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
// Chat signed in to: its Sign in (Continue as, signed in on the site already where its sign-in is shared), on the
// account's page, and back
export async function signInChat(page, inflight, { email, password = PASSWORD }) {
  await open(page, inflight);
  await page.waitForSelector('.welcome [data-act=acctsignin]', { state: 'visible', timeout: 30000 });
  await page.click('.welcome [data-act=acctsignin]');
  await pageOut(page, inflight, await onAccountPage(page, { email, password }));
}
export async function joinChat(page, inflight, { name, handle, email, password = PASSWORD, city, passkey = false }) {
  await open(page, inflight);
  await page.waitForSelector('.welcome [data-act=acctjoin]', { state: 'visible', timeout: 30000 });
  await page.click('.welcome [data-act=acctjoin]');
  await page.waitForSelector('main .signin input[name=name]', { timeout: 30000 });
  const acct = new URL(page.url()).origin + '/';
  await fillJoin(page, { name, handle, email, password });
  await page.waitForURL((u) => !u.hostname.startsWith('account.'), { timeout: 60000 });
  await page.waitForSelector('#city', { state: 'attached', timeout: 40000 });
  await pageOut(page, inflight, acct);
  if (city) await page.selectOption('#city', city);
  await page.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
  await page.click(passkey ? '[data-act=pkadd]' : '[data-act=onbdone]');
  await page.waitForSelector('.tabs', { timeout: 30000 });
}

// Chat's settings on the account's page, as its Settings opens them (Chat Settings: a window of its own, signed
// in there by the code Chat hands over, with the sheet open): → that window. Its first page has Email me (#if-email);
// sub (its row's title: Notifications, Who sees what, Blocked) opens one of its own pages, with its switches
// #if-<setting> (landed, names, quiet… on Notifications, receipts, approxLocation… on Who sees what) and hours
// (#if-quietFrom, #if-quietTo). Each change is saved as it's made; Chat takes it up as it next syncs.
export async function inflightSettings(page, sub = null) {
  await page.click('[data-act=tab][data-id=account]'); await page.waitForTimeout(500);
  const [w] = await Promise.all([page.context().waitForEvent('page'), page.click('#screen > main.view [data-act=ifsettings]')]);
  await w.waitForURL((u) => u.hostname.startsWith('account.'), { timeout: 20000, waitUntil: 'commit' });
  const go = await w.waitForSelector('#sheet[open] #if-email, main .welcome .btn', { timeout: 20000 });
  if (await go.evaluate((e) => e.matches('.btn'))) { await go.click(); await w.waitForSelector('#sheet[open] #if-email', { timeout: 20000 }); }
  await w.waitForTimeout(400);
  if (sub) await ifPage(w, sub);
  return w;
}
// one of Chat's settings' own pages, from its first (by its row's title), drawn once what's kept is in
export async function ifPage(w, sub) {
  await w.locator('#sheet .row', { hasText: sub }).first().click();
  await w.waitForSelector(`#sheet .sheet-head h2:text-is("${sub}")`, { timeout: 10000 });
  await w.waitForTimeout(600);
}
