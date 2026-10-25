// Sheets come up smoothly: How It Flies is redrawn as its plan arrives, but only once it's up (a redraw mid-slide made
// it jump, then judder), it never overshoots, its rows keep growing, and the screen behind stays put.
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
const swapAt = redrawn.findIndex((x) => !x.same), h = redrawn.at(-1).h;
console.log('frames', redrawn.length, 'redrawn at frame', swapAt, swapAt > 0 ? `(${Math.round(redrawn[swapAt].t)}ms, y ${Math.round(redrawn[swapAt - 1].y)} → ${Math.round(redrawn[swapAt].y)})` : '');
console.log('path', redrawn.filter((_, j) => j % 3 === 0).map((x) => `${Math.round(x.t)}:${Math.round(x.y)}`).join(' '));
ok(swapAt > 0, 'How It Flies is redrawn with its plan', `frame ${swapAt}`);
// the redraw waits until it's up: while it's still sliding it's the same sheet, moving a little every frame
const sliding = redrawn.filter((x) => x.y > 1);
ok(sliding.every((x) => x.same), 'no redraw while it slides up (that made it judder)', `redrawn at ${Math.round(redrawn[swapAt]?.t)}ms, y ${Math.round(redrawn[swapAt]?.y)}`);
const steps = redrawn.slice(1).map((x, i) => redrawn[i].y - x.y), worst = Math.max(...steps);
ok(worst < h * 0.35, 'no frame jumps a big part of the way', `${Math.round(worst)} of ${h}px`);
ok(Math.min(...redrawn.map((x) => x.y)) > -1, 'it never goes past the top and back (no bounce)', String(Math.round(Math.min(...redrawn.map((x) => x.y)))));
ok(Math.abs(redrawn.at(-1).y) < 1, 'and it ends up exactly in place', String(redrawn.at(-1).y));
// the bars grow on after the redraw, rather than snapping to full
const b0 = redrawn[swapAt]?.bars?.[0], bEnd = redrawn.at(-1).bars?.[0];
ok(swapAt < 0 || b0 == null || bEnd == null || b0 < bEnd * 0.98, 'its bars keep growing through the redraw', `${b0?.toFixed?.(1)} → ${bEnd?.toFixed?.(1)} at ${Math.round(redrawn[swapAt]?.t || 0)}ms`);
// the screen behind stays put: no shrinking, filter or corners (repaints of the whole chat, every frame)
const behind = await A.p.evaluate(() => { document.querySelector('.compose .kind').click(); return new Promise((r) => setTimeout(() => { const v = getComputedStyle(document.querySelector('.view')), c = getComputedStyle(document.querySelector('.compose')); r({ vt: v.transform, vf: v.filter, vr: v.borderTopLeftRadius, ct: c.transform }); }, 700)); });
ok(behind.vt === 'none' && behind.vf === 'none' && behind.vr === '0px' && behind.ct === 'none', 'the screen behind stays put (the scrim dims it)', JSON.stringify(behind));
// a screen reader is taken into it once it's up
const focus = await A.p.evaluate(() => document.activeElement?.closest?.('.sheet') ? document.activeElement.tagName : document.activeElement?.tagName);
ok(focus === 'H2', 'once up, focus is in the sheet (its title)', focus);
await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(800);

// ---- moving between screens ----
// every frame of a move: where the new screen is, and the copy of the old one left under it
const track = (start) => A.p.evaluate((start) => new Promise((done) => {
  const out = [], t0 = performance.now();
  (new Function(start))();
  const step = () => {
    const v = document.querySelector('#screen > .view'), g = document.querySelector('.nav-ghost'), t = performance.now() - t0;
    const cs = getComputedStyle(v), m = new DOMMatrix(cs.transform);
    out.push({ t, x: m.m41, o: +cs.opacity, cls: v.className, ghost: g ? g.className : null, gf: g ? getComputedStyle(g).filter : null, sh: cs.boxShadow });
    if (t < 700) requestAnimationFrame(step); else done(out);
  };
  requestAnimationFrame(step);
}), start);
await A.p.evaluate(() => document.querySelector('.view .nbtn.back')?.click()); await A.p.waitForTimeout(900);
await A.p.evaluate(() => document.querySelector('[data-act=tab][data-id=friends]')?.click()); await A.p.waitForTimeout(900);
await A.p.waitForSelector(`.view [data-act=open][data-id="${bs.me.id}"]`);
// 1. into a chat: it slides in from the right on the smooth curve, never past its place, the list sliding aside under it
const push = await track(`document.querySelector('.view [data-act=open][data-id="${bs.me.id}"]').click()`);
const px = push.map((f) => f.x), W = await A.p.evaluate(() => innerWidth);
console.log('push', push.filter((_, j) => j % 3 === 0).map((f) => `${Math.round(f.t)}:${Math.round(f.x)}`).join(' '));
ok(push.some((f) => /nav-push/.test(f.cls)) && Math.max(...px) > W * 0.3, 'into a chat: it slides in from the right', `${Math.round(Math.max(...px))} of ${W}px`);
ok(Math.min(...px) > -1 && Math.abs(px.at(-1)) < 1, 'it never goes past its place (no bounce), and ends exactly there', String(Math.round(Math.min(...px))));
ok(push.some((f) => /nav-ghost-push/.test(f.ghost || '')) && push.every((f) => !f.gf || f.gf === 'none'), 'the list slides aside under it, dimmed by a shade (no filter to repaint)', JSON.stringify([...new Set(push.map((f) => f.gf))]));
const pSteps = px.slice(1).map((x, i) => px[i] - x);
ok(Math.max(...pSteps) < W * 0.35, 'no frame jumps a big part of the way', `${Math.round(Math.max(...pSteps))}px`);
// 2. back: the chat slides away to the right and the list slides back in
await A.p.waitForTimeout(600);
const pop = await track(`document.querySelector('.view .nbtn.back').click()`);
ok(pop.some((f) => /nav-pop/.test(f.cls)) && pop.some((f) => /nav-ghost-pop/.test(f.ghost || '')) && Math.abs(pop.at(-1).x) < 1, 'back: the chat slides away and the list slides back', `${Math.round(Math.min(...pop.map((f) => f.x)))} → ${Math.round(pop.at(-1).x)}`);
await A.p.waitForTimeout(600);
// 3. tabs: they slide a touch toward the one picked as they fade in, the old one under it (no blank frame)
const tabL = await track(`document.querySelector('[data-act=tab][data-id=messages]').click()`);
await A.p.waitForTimeout(400);
const tabR = await track(`document.querySelector('[data-act=tab][data-id=friends]').click()`);
ok(tabR.some((f) => /nav-tab-r/.test(f.cls)) && tabR.some((f) => /nav-ghost-tab/.test(f.ghost || '')) && tabR.some((f) => f.x > 4) && Math.abs(tabR.at(-1).x) < 1 && tabR.at(-1).o === 1, 'to a tab on the right: it slides in from the right as it fades in, over the old one', `${Math.round(Math.max(...tabR.map((f) => f.x)))}px`);
ok(tabL.some((f) => /nav-tab-l/.test(f.cls)) && tabL.some((f) => f.x < -4) && Math.abs(tabL.at(-1).x) < 1, 'back to one on the left: from the left', `${Math.round(Math.min(...tabL.map((f) => f.x)))}px`);
ok(tabR.concat(tabL).every((f) => f.ghost || f.o > 0.02 || f.t > 300), 'no blank frame: the old tab is there until the new one has come in', '');
await A.p.waitForTimeout(600);
// 4. inside a sheet: on to another slides in from the right, back from the left
await openChat(A, bs.me.id); await A.p.waitForTimeout(800);
await A.p.evaluate((id) => { const b = document.createElement('button'); b.hidden = true; b.dataset.act = 'friendinfo'; b.dataset.id = id; document.querySelector('#screen').append(b); b.click(); b.remove(); }, bs.me.id);
await A.p.waitForTimeout(800);
await A.p.click('.sheet [data-act=loft]'); await A.p.waitForTimeout(80);
const on = await A.p.evaluate(() => [document.querySelector('.sheet .body')?.className, getComputedStyle(document.querySelector('.sheet .body')).animationName]);
await A.p.waitForTimeout(1200);
await A.p.click('.sheet header [data-act=loftback]').catch(() => {}); await A.p.waitForTimeout(80);
const back = await A.p.evaluate(() => [document.querySelector('.sheet .body')?.className, getComputedStyle(document.querySelector('.sheet .body')).animationName]);
ok(/go-on/.test(on[0]) && on[1] === 'sheet-on', 'in a sheet, on to another: it slides in from the right', JSON.stringify(on));
ok(/go-back/.test(back[0]) && back[1] === 'sheet-back', 'and back: from the left', JSON.stringify(back));
// 5. with a sheet up, Tab stays in it (the screen behind can't be reached), and once it's closed the screen can be again
const tabbed = [];
for (let i = 0; i < 16; i++) { await A.p.keyboard.press('Tab'); tabbed.push(await A.p.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'body' : a.closest('.layer') ? 'sheet' : a.outerHTML.slice(0, 80); })); }
const under = await A.p.evaluate(() => [document.querySelector('#screen > .view').inert, document.querySelector('.tabbar').inert, document.querySelector('.compose').inert]);
ok(tabbed.every((x) => x === 'sheet' || x === 'body') && under.every(Boolean), 'with a sheet up, Tab never leaves it for the screen behind', JSON.stringify([...new Set(tabbed)]) + ' ' + JSON.stringify(under));
await A.p.keyboard.press('Escape'); await A.p.waitForTimeout(900);
const freed = await A.p.evaluate(() => [document.querySelector('#screen > .view').inert, document.querySelector('.compose').inert]);
ok(freed.every((x) => !x), 'and once it closes, the screen can be reached again', JSON.stringify(freed));
// 6. a switch flipped by keyboard on Account (the whole screen is drawn again): focus stays on it, so a second press flips it back
await A.p.evaluate(() => document.querySelector('[data-act=tab][data-id=account]')?.click()); await A.p.waitForSelector('.view [data-act=haptics]'); await A.p.waitForTimeout(900);
const sw = () => A.p.evaluate(() => { const a = document.activeElement; return { act: a?.dataset?.act || a?.tagName, on: a?.getAttribute?.('aria-checked') }; });
await A.p.evaluate(() => document.querySelector('.view [data-act=haptics]').focus());
const s0 = await sw(); await A.p.keyboard.press(' '); await A.p.waitForTimeout(400);
const s1 = await sw(); await A.p.keyboard.press(' '); await A.p.waitForTimeout(400);
const s2 = await sw();
ok(s1.act === 'haptics' && s1.on !== s0.on && s2.act === 'haptics' && s2.on === s0.on, 'a switch flipped by keyboard keeps its focus through the redraw', JSON.stringify([s0, s1, s2]));
// 7. a menu opened by a tap that focused its button (as Android's do): the button's inert under the menu, which lets
// its focus go, and a tap outside the menu gives it back
await openChat(A, bs.me.id);
await A.p.click('.view [data-act=chatmenu]'); await A.p.waitForSelector('.menu-pop'); await A.p.waitForTimeout(300);
const under7 = await A.p.evaluate(() => document.activeElement?.dataset?.act || document.activeElement?.tagName);
await A.p.click('.menu-scrim', { position: { x: 20, y: 700 } }); await A.p.waitForTimeout(500);
const back7 = await A.p.evaluate(() => document.activeElement?.dataset?.act || document.activeElement?.tagName);
ok(back7 === 'chatmenu', 'a menu closed by a tap outside it gives the focus back to what opened it', `${under7} → ${back7}`);
// 8. a card in the air keeps its focus as Messages is drawn again (it's the same card, put back in the new list)
await K.say(A, 'standard', 'Off to New York');
await A.p.evaluate(() => document.querySelector('[data-act=tab][data-id=messages]')?.click()); await A.p.waitForSelector('.view .acard', { timeout: 15000 }); await A.p.waitForTimeout(900);
const where = () => A.p.evaluate(() => { const a = document.activeElement; return a?.classList?.contains('acard') ? 'acard' : a?.outerHTML?.slice(0, 120) || String(a); });
await A.p.evaluate(() => { document.querySelector('.view .acard').focus(); document.querySelector('.view .mlist').dataset.was = '1'; }); const card0 = await where();
// (news for Ann, from Ben: her sync draws the list again)
K.one(`UPDATE pg_users SET place = 'Brooklyn' WHERE id = '${bs.me.id}'`);
await A.p.evaluate(() => dispatchEvent(new Event('online'))); await A.p.waitForFunction(() => !document.querySelector('.view .mlist[data-was]'), null, { timeout: 20000 }).catch(() => {}); await A.p.waitForTimeout(400);
const card = await where(), drawn = await A.p.evaluate(() => !document.querySelector('.view .mlist[data-was]'));
ok(card0 === 'acard' && drawn && card === 'acard', 'a card in the air keeps its focus through a redraw of Messages', `${card0} → ${card}${drawn ? '' : ' (not redrawn)'}`);
await A.p.screenshot({ path: `${out}/after.png` });
console.log('errs', K.errs);
console.log(`FAILS ${K.fails()}`);
process.exit(0);
