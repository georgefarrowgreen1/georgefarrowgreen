// Preloaded into every test: the map card opens pulled up (as it did before it
// could fold), unless a test chooses otherwise.
import { chromium } from 'playwright';
const launch = chromium.launch.bind(chromium);
chromium.launch = async (...a) => {
  const b = await launch(...a), nc = b.newContext.bind(b);
  b.newContext = async (...o) => { const ctx = await nc(...o); await ctx.addInitScript(() => { try { if (!localStorage.getItem('inflight-mapcard')) localStorage.setItem('inflight-mapcard', 'open'); } catch (_) {} }); return ctx; };
  return b;
};
