// Preloaded into every test: the map card opens pulled up (as it did before it
// could fold), unless a test chooses otherwise. And no passkey offered in the
// keyboard (passkey autofill) unless a test asks for it (window.__autofill): the
// tests' stand-in authenticators answer that ask by themselves, where a phone
// waits for a tap, so a page would sign in with a passkey as soon as it's drawn.
import { chromium } from 'playwright';
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
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
