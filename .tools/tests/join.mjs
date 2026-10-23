// A new account, as one's made now: on the account's own page (accounts are made there and only there), then InFlight
// signed in to on the same phone (its place chosen, and its passkey offer answered). For the tests that start with
// someone new.
//   joinInFlight(page, inflightUrl, { name, handle, email, password, city, passkey })
//   makeAccount(page, accountUrl, { name, handle, email, password }), signInInFlight(page, inflightUrl, { email, password })
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
// (signed in on the site already, in this browser, as the account's page leaves it where the site's sign-in is shared:
// Continue as, and the password to unlock the key; else Sign in)
export async function signInInFlight(page, inflight, { email, password = PASSWORD }) {
  await open(page, inflight);
  await page.waitForSelector('.welcome [data-act=to][data-id=signin]', { timeout: 30000 });
  const shared = (await page.context().cookies(inflight)).some((c) => /^(__Secure-)?account$/.test(c.name));
  if (shared && await page.waitForSelector('.welcome [data-act=resume]', { timeout: 5000 }).catch(() => null)) {
    await page.click('[data-act=resume]'); await page.waitForSelector('[data-form=unlock] #f-password', { timeout: 15000 });
    await page.fill('[data-form=unlock] #f-password', password); await page.click('[data-form=unlock] .btn');
    return;
  }
  await page.click('[data-act=to][data-id=signin]');
  await page.fill('#f-email', email); await page.fill('#f-password', password);
  await page.click('[data-form=signin] .btn');
}
export async function joinInFlight(page, inflight, { name, handle, email, password = PASSWORD, city, passkey = false }) {
  await makeAccount(page, accountUrl(inflight), { name, handle, email, password });
  // (where the account's page and InFlight don't share the site's sign-in, as locally: signed out there, so the account
  // has just InFlight's sign-in, as on the site, where Continue as takes over the page's)
  if (!new URL(inflight).hostname.startsWith('chat.')) await page.evaluate(() => fetch('/api/account/signout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  await signInInFlight(page, inflight, { email, password });
  await page.waitForSelector('#city', { state: 'attached', timeout: 40000 });
  if (city) await page.selectOption('#city', city);
  await page.waitForSelector('[data-act=onbdone]', { timeout: 20000 });
  await page.click(passkey ? '[data-act=pkadd]' : '[data-act=onbdone]');
  await page.waitForSelector('.tabs', { timeout: 30000 });
}
