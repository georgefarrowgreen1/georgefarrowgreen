// Preloaded into every test: the map card opens pulled up (as it did before it
// could fold), unless a test chooses otherwise. And no passkey offered in the
// keyboard (passkey autofill) unless a test asks for it (window.__autofill): the
// tests' stand-in authenticators answer that ask by themselves, where a phone
// waits for a tap, so a page would sign in with a passkey as soon as it's drawn.
// And the sign-in page's address (auth.ifl.test) counted as secure wherever the account's is, as every sign-in is
// there: passkeys and the password's stretching need a secure page.
import { chromium } from 'playwright';
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
  const args = a[0]?.args;
  if (args) a[0].args = args.map((x) => (/^--unsafely-treat-insecure-origin-as-secure=.*account\.ifl\.test/.test(x) && !/auth\.ifl\.test/.test(x) ? x.replace(/(http:\/\/account\.ifl\.test(:\d+)?)/, "$1,http://auth.ifl.test$2") : x));
  const b = await launch(...a), nc = b.newContext.bind(b);
  b.newContext = async (...o) => {
    const ctx = await nc(...o);
    await ctx.addInitScript(() => {
      try { if (!localStorage.getItem('inflight-mapcard')) localStorage.setItem('inflight-mapcard', 'open'); } catch (_) {}
      const P = window.PublicKeyCredential, can = P?.isConditionalMediationAvailable?.bind(P);
      if (can) P.isConditionalMediationAvailable = async () => !!window.__autofill && can();
    });
    return ctx;
  };
  return b;
};
