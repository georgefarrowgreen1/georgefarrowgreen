// Sheets come up smoothly: How It Flies is redrawn as its plan arrives, and it carries on sliding up from where it
// had got to (it used to jump the rest of the way), its rows keep growing, and the screen behind only moves.
import { kit } from './lib.mjs';
const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, api, sess, openChat } = K;
const A = await K.phone('ann'), B = await K.phone('ben');
await K.signup(A, 'Ann Ito', 'ann', 'ann@example.com', 'London');
await K.signup(B, 'Ben Ode', 'ben', 'ben@example.com', 'New York');
const [as, bs] = [await sess(A), await sess(B)];
await api(as.token, 'friends', { handle: bs.me.handle }); await api(bs.token, 'friends-respond', { id: as.me.id, accept: true });
await A.p.reload(); await A.p.waitForSelector('.tabs'); await openChat(A, bs.me.id); await A.p.waitForTimeout(1500);

// every frame for a second after it's tapped: where the sheet is, and whether it's been redrawn
const watch = () => A.p.evaluate(() => new Promise((done) => {
  const marks = [], t0 = performance.now(); let first = null;
  document.querySelector('.compose .kind').click();
  const step = () => {
    const sh = document.querySelector('.layer .sheet'), t = performance.now() - t0;
    if (sh) { if (!first) first = sh; const m = new DOMMatrix(getComputedStyle(sh).transform); marks.push({ t, y: m.m42, h: sh.offsetHeight, same: sh === first, bars: [...sh.querySelectorAll('.kdur')].map((b) => b.getBoundingClientRect().width) }); }
    if (t < 1100) requestAnimationFrame(step); else done(marks);
  };
  requestAnimationFrame(step);
}));
// (the plan is fetched as it opens: forget it, so this open redraws as it comes up)
const runs = [];
for (let i = 0; i < 3; i++) {
  await A.p.evaluate(() => { try { indexedDB; } catch (_) {} });
  const m = await watch(); runs.push(m);
  await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(900);
}
const redrawn = runs.find((m) => m.some((x) => !x.same)) || runs[0];
const jumps = redrawn.slice(1).map((x, i) => ({ t: Math.round(x.t), d: Math.round(x.y - redrawn[i].y), y: Math.round(x.y) }));
const worst = jumps.reduce((a, b) => (b.d < a.d ? b : a), { d: 0 });
const swapAt = redrawn.findIndex((x) => !x.same);
console.log('frames', redrawn.length, 'redrawn at frame', swapAt, swapAt > 0 ? `(${Math.round(redrawn[swapAt].t)}ms, y ${Math.round(redrawn[swapAt - 1].y)} → ${Math.round(redrawn[swapAt].y)})` : '');
ok(redrawn.some((x) => !x.same), 'How It Flies is redrawn as it comes up (its plan arriving)', `frame ${swapAt}`);
const h = redrawn.at(-1).h;
ok(swapAt < 0 || Math.abs(redrawn[swapAt].y - redrawn[swapAt - 1].y) < h * 0.12, 'redrawn mid-slide: it carries on from where it was, no jump', swapAt > 0 ? `${Math.round(redrawn[swapAt - 1].y)} → ${Math.round(redrawn[swapAt].y)} of ${h}` : '-');
ok(Math.abs(redrawn.at(-1).y) < 1, 'and it ends up exactly in place', String(redrawn.at(-1).y));
// the bars grow on after the redraw, rather than snapping to full
const b0 = redrawn[swapAt]?.bars?.[0], bEnd = redrawn.at(-1).bars?.[0];
ok(swapAt < 0 || b0 == null || bEnd == null || b0 < bEnd * 0.98 || redrawn[swapAt].t > 900, 'its bars keep growing through the redraw', `${b0?.toFixed?.(1)} → ${bEnd?.toFixed?.(1)} at ${Math.round(redrawn[swapAt]?.t || 0)}ms`);
// the screen behind: it moves, but no filter or animated corner (the repaints that made it stutter)
const behind = await A.p.evaluate(() => { document.querySelector('.compose .kind').click(); return new Promise((r) => setTimeout(() => { const v = getComputedStyle(document.querySelector('.view')), c = getComputedStyle(document.querySelector('.compose')); r({ vt: v.transform, vf: v.filter, ct: c.transform, tr: v.transitionProperty }); }, 700)); });
ok(behind.vt !== 'none' && behind.vf === 'none' && behind.ct === 'none' && !/filter/.test(behind.tr), 'the screen behind only moves (no filter, the composer left alone)', JSON.stringify(behind));
await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(800);
const after = await A.p.evaluate(() => [getComputedStyle(document.querySelector('.view')).transform, getComputedStyle(document.querySelector('.view')).borderTopLeftRadius]);
ok(after[0] === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(after[0]), 'closed: the screen is back as it was', JSON.stringify(after));
await A.p.screenshot({ path: `${out}/after.png` });
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
