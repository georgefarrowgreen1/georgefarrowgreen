import { chromium } from 'playwright';
const out = process.argv[2];
// What's wrong on a screen, as someone sees it: text that overlaps other text, text cut off with no way to see the
// rest, text running off the screen, and a page that scrolls sideways. Only what's drawn counts: not hidden, not
// see-through, not clipped to nothing (words kept for screen readers, .sr-only; actions folded to no width), not under
// something else; below the screen too, as the page scrolls to it (but not beside it, nor under a sheet, nor fixed off
// the screen). Text is measured by its letters, not the line they sit on (a big number's line runs well past its
// digits), and only the boxes that clip it can cut it (what's positioned outside one isn't); all of it past the side of
// one is cut too, where it was laid out (not slid there, as a row's actions are). A box that scrolls that way shows the
// rest when it's scrolled (a strip of hours, a row of cards), so what's past its edge isn't cut off, nor off the screen.
// Decoration (aria-hidden) may lie behind the words (a big initial behind a name), so isn't counted as overlapping them
// there; drawn over them (an icon run into a label), it is. Cut off with an ellipsis is listed apart (trunc): a line at
// a time (names, figures); a clamp of several lines is a preview, as meant.
const AUDIT = () => {
  const B = document.body, R = document.documentElement, CS = new Map();
  const css = (e) => { let c = CS.get(e); if (!c) CS.set(e, c = getComputedStyle(e)); return c; };
  const clips = (c, ax) => (ax === 'x' ? c.overflowX : c.overflowY) !== 'visible' && c.display !== 'contents';
  const scrolls = (c, ax) => /auto|scroll/.test(ax === 'x' ? c.overflowX : c.overflowY);
  // (overflow doesn't apply to an inline box, but for a drawing's)
  const clipper = (x) => { const c = css(x); return (clips(c, 'x') || clips(c, 'y')) && (c.display !== 'inline' || x instanceof SVGElement); };
  // seen: drawn, at least partly opaque, not clipped to nothing (each ancestor too)
  const SEEN = new Map();
  const seen = (e) => {
    if (!e || e === B || e === R) return true;
    if (SEEN.has(e)) return SEEN.get(e);
    const c = css(e);
    let ok = c.display !== 'none' && +c.opacity > 0.05 && c.clip !== 'rect(0px, 0px, 0px, 0px)' && c.clipPath !== 'inset(50%)';
    if (ok && (clips(c, 'x') || clips(c, 'y'))) { const r = e.getBoundingClientRect(); ok = !(clips(c, 'x') && r.width <= 1 || clips(c, 'y') && r.height <= 1); }
    ok = ok && seen(e.parentElement);
    SEEN.set(e, ok); return ok;
  };
  // the boxes that clip e, nearest first (a box positioned absolutely, or fixed, escapes those between it and what it's
  // placed against)
  const holds = (c, fixed) => (!fixed && c.position !== 'static') || c.transform !== 'none' || c.filter !== 'none' || c.perspective !== 'none' || (c.backdropFilter || 'none') !== 'none' || /paint|layout|strict|content/.test(c.contain);
  const CUT = new Map();
  const cutters = (e) => {
    if (CUT.has(e)) return CUT.get(e);
    const pos = css(e).position;
    let p = e.parentElement;
    if (pos === 'absolute' || pos === 'fixed') while (p && p !== B && p !== R && !holds(css(p), pos === 'fixed')) p = p.parentElement;
    const out = !p || p === B || p === R ? [] : [...(clipper(p) ? [p] : []), ...cutters(p)];
    CUT.set(e, out); return out;
  };
  const BOX = new Map();
  const box = (p) => {
    if (BOX.has(p)) return BOX.get(p);
    const r = p.getBoundingClientRect(), sx = p.offsetWidth ? r.width / p.offsetWidth : 1, sy = p.offsetHeight ? r.height / p.offsetHeight : 1;
    const l = r.left + p.clientLeft * sx, t = r.top + p.clientTop * sy;
    const b = p instanceof SVGElement ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : { l, t, r: l + p.clientWidth * sx, b: t + p.clientHeight * sy };
    BOX.set(p, b); return b;
  };
  // the letters' top and bottom within the line's box, as fractions of its height (from the font's own measures)
  const pen = document.createElement('canvas').getContext('2d');
  const ink = (c, s) => {
    pen.font = '1px serif'; pen.font = `${c.fontStyle} ${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
    if (pen.font === '1px serif') return [0, 1];
    const m = pen.measureText(c.textTransform === 'uppercase' ? s.toUpperCase() : s), h = m.fontBoundingBoxAscent + m.fontBoundingBoxDescent;
    return h > 0 ? [Math.max(0, (m.fontBoundingBoxAscent - m.actualBoundingBoxAscent) / h), Math.min(1, (m.fontBoundingBoxAscent + m.actualBoundingBoxDescent) / h)] : [0, 1];
  };
  // drawn on top: nothing painted over it where it is (text over text, both see-through, is both seen; a drawing's
  // own box is see-through but for its lines and shapes)
  const bare = (x) => { const c = css(x); return !/^(IMG|CANVAS|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT)$/.test(x.tagName) && !(x instanceof SVGElement && x.tagName !== 'svg') && /^(transparent|rgba\(.*, 0\))$/.test(c.backgroundColor) && c.backgroundImage === 'none' && (c.backdropFilter || 'none') === 'none'; };
  const onTop = (e, x, y) => { for (const h of document.elementsFromPoint(x, y)) { if (h === e || e.contains(h) || h.contains(e)) return true; if (!bare(h)) return false; } return false; };
  // there when scrolled to: out of sight now, but what holds it is on the screen, and not under a sheet (something
  // fixed or placed over at least half the screen; what's painted beside it in the same place doesn't count)
  const over = (h, e) => {
    for (let x = h; x && !x.contains(e); x = x.parentElement) {
      const p = css(x).position, r = x.getBoundingClientRect();
      if ((p === 'fixed' || p === 'absolute') && r.width >= innerWidth / 2 && r.height >= innerHeight / 2) return true;
    }
    return false;
  };
  const THERE = new Map();
  const there = (e) => {
    for (let x = e.parentElement; x && x !== R; x = x.parentElement) {
      const r = x.getBoundingClientRect(), l = Math.max(r.left, 0), rr = Math.min(r.right, innerWidth), t = Math.max(r.top, 0), b = Math.min(r.bottom, innerHeight);
      if (rr - l < 2 || b - t < 2) continue;
      if (!THERE.has(x)) THERE.set(x, [0.25, 0.5, 0.75].some((f) => { const h = document.elementsFromPoint((l + rr) / 2, t + (b - t) * f).find((h) => !bare(h)); return !h || h.contains(e) || !over(h, e); }));
      return THERE.get(x);
    }
    return false;
  };
  // (slid or placed where it is, from e up to p: a closed drawer, a row's actions waiting beside it)
  const slid = (e, p) => { for (let x = e; x && x !== p; x = x.parentElement) { const c = css(x); if (c.transform !== 'none' || (c.translate || 'none') !== 'none' || /fixed|absolute/.test(c.position)) return true; } return false; };
  const moved = (e) => slid(e, B);
  // (fixed to the screen: off it, it's never scrolled to, as a sheet waiting below it)
  const pinned = (e) => { for (let x = e; x && x !== B; x = x.parentElement) if (css(x).position === 'fixed') return true; return false; };
  // (a box drawn on the screen, not under anything; or below it, there as the page scrolls)
  const drawn = (x) => { const b = box(x), l = Math.max(b.l, 0), r = Math.min(b.r, innerWidth), t = Math.max(b.t, 0), bt = Math.min(b.b, innerHeight); return l < r && t < bt ? onTop(x, (l + r) / 2, (t + bt) / 2) : !pinned(x) && there(x); };
  // (decoration behind the words where they cross, as a big initial behind a name, is meant; drawn over them, as an icon
  // run into a label, it isn't. Below the screen, or not to be found there, it's taken as behind)
  const behind = (d, w, x, y) => {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true;
    const hs = document.elementsFromPoint(x, y), i = hs.findIndex((h) => h === d || d.contains(h)), j = hs.findIndex((h) => h === w || w.contains(h));
    return i < 0 || (j >= 0 && j < i);
  };
  const name = (e) => (e.getAttribute('class') || '').trim() || e.tagName.toLowerCase();
  const boxes = [], issues = [], trunc = [];
  for (const e of B.querySelectorAll('*')) {
    if (/^(TEXTAREA|SELECT|OPTION|SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName)) continue;
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const c = css(e);
      if (c.visibility !== 'visible' || !seen(e)) continue;   // (hidden on purpose, e.g. a collapsed chip's label)
      const s = n.textContent, t = s.trim().replace(/\s+/g, ' ').slice(0, 40), rg = document.createRange();
      rg.setStart(n, s.search(/\S/)); rg.setEnd(n, s.length - s.match(/\s*$/)[0].length);
      const [it, ib] = ink(c, s.trim()), cut = [...(clipper(e) ? [e] : []), ...cutters(e)];
      let off = false, by = null, how = '', away = false, under = false, aside = 0, lost = false;
      const vis = [], far = [];
      for (const rc of rg.getClientRects()) {
        if (rc.width < 1 || rc.height < 1) continue;
        const v = { l: rc.left, r: rc.right, t: rc.top + rc.height * it, b: rc.top + rc.height * ib };
        let gone = '';
        for (const p of cut) {
          const pc = css(p), pb = box(p);
          for (const [ax, lo, hi] of [['x', 'l', 'r'], ['y', 't', 'b']]) {
            if (gone || !clips(pc, ax)) continue;
            // (cut: past an edge that doesn't scroll; with an ellipsis on one line, or a clamp of several lines)
            const k = ax === 'x' ? (pc.textOverflow === 'ellipsis' ? 'ELLIPSIS' : 'CLIPPED') : pc.webkitLineClamp === 'none' ? 'CLIPPED' : pc.webkitLineClamp === '1' ? 'ELLIPSIS' : '';
            if (!by && k && !scrolls(pc, ax) && (v[lo] < pb[lo] - 1 || v[hi] > pb[hi] + 1)) { by = p; how = k; }
            v[lo] = Math.max(v[lo], pb[lo]); v[hi] = Math.min(v[hi], pb[hi]);
            if (v[hi] - v[lo] < 2) gone = scrolls(pc, ax) ? 'scrolled' : ax === 'x' && !slid(e, p) ? 'cut' : 'folded';
          }
          if (gone) break;
        }
        // (all of it out of sight: scrolled out of a strip, or below the screen, is still there to see; folded away isn't;
        // past the side of a row it was laid out in, it's lost)
        if (gone) { away = away || gone === 'scrolled'; lost = lost || gone === 'cut'; continue; }
        const w = { l: Math.max(v.l, 0), r: Math.min(v.r, innerWidth), t: Math.max(v.t, 0), b: Math.min(v.b, innerHeight) };
        if (w.l >= w.r || w.t >= w.b) { away = true; if (v.r <= 0 || v.l >= innerWidth) aside++; else far.push(v); continue; }
        if (!onTop(e, (w.l + w.r) / 2, (w.t + w.b) / 2)) { under = true; continue; }   // (under a sheet, a menu, a bar)
        if (v.l < w.l - 1 || v.r > w.r + 1) off = true;
        vis.push(w);
      }
      if (!vis.length && (lost && by ? !drawn(by) : under || !away || pinned(e) || !there(e))) continue;
      // (all of it past the side of the screen, where it was laid out: not slid there, as a closed drawer is)
      if (!vis.length && aside && !moved(e)) off = true;
      const deco = !!e.closest('[aria-hidden="true"]');
      for (const v of [...vis, ...far]) boxes.push({ e, v, t, deco });   // (overlaps below the screen too, as the page scrolls)
      if (how) (how === 'ELLIPSIS' ? trunc : issues).push(`${how} <${name(by)}> "${t}"`);
      if (off) issues.push(`OFFSCREEN "${t}"`);
    }
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; if (a.e === b.e) continue;
    const ix = Math.min(a.v.r, b.v.r) - Math.max(a.v.l, b.v.l), iy = Math.min(a.v.b, b.v.b) - Math.max(a.v.t, b.v.t);
    if (ix <= 2 || iy <= 2) continue;
    const x = (Math.max(a.v.l, b.v.l) + Math.min(a.v.r, b.v.r)) / 2, y = (Math.max(a.v.t, b.v.t) + Math.min(a.v.b, b.v.b)) / 2;
    if (a.deco !== b.deco && (a.deco ? behind(a.e, b.e, x, y) : behind(b.e, a.e, x, y))) continue;
    issues.push(`OVERLAP "${a.t}" × "${b.t}"`);
  }
  if (R.scrollWidth > innerWidth) issues.push('PAGE SCROLLS SIDEWAYS');
  return { issues: [...new Set(issues)], trunc: [...new Set(trunc)] };
};
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const sizes = [[320, 568], [375, 667], [430, 932]];
let total = 0;
for (const [w, h] of sizes) for (const scheme of ['light', 'dark']) {
  if (scheme === 'dark' && w !== 375) continue;
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, colorScheme: scheme });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => m.type() === 'error' && !m.text().includes('404') && errs.push(m.text()));
  await p.goto('http://localhost:8765/test.html'); await p.waitForSelector('#phone-a .welcome', { timeout: 20000 });
  await p.click('#phone-a [data-act=to][data-id=signin]'); await p.click('#phone-a [data-act=fill]'); await p.click('#phone-a [data-form=signin] .btn');
  await p.waitForSelector('#phone-a .hdr', { timeout: 15000 }); await p.click('#phone-a [data-act=open]'); await p.waitForTimeout(500);
  const shots = [];
  const check = async (name) => { await p.waitForTimeout(350); const r = await p.evaluate(AUDIT); total += r.issues.length; console.log(`[${w} ${scheme}] ${name}: ${r.issues.length ? r.issues.join(' | ') : 'ok'}${r.trunc.length ? '   (ellipsis: ' + r.trunc.join('; ') + ')' : ''}`); if (w === 375 || w === 320) await p.screenshot({ path: `${out}/a-${w}-${scheme}-${name}.png` }); };
  const A = '#phone-a', B = '#phone-b';
  await check('chat');
  await p.click(A + ' [data-act=menu]'); await check('menu');
  await p.click(A + ' [data-act=sample]'); await p.waitForTimeout(600);
  await p.fill(A + ' textarea', 'Here is the view from my window this morning, the light was unreal.'); await check('attached');
  await p.click(A + ' .send'); await p.waitForTimeout(600); await check('sent');
  await p.click(A + ' [data-act=map]'); await p.waitForTimeout(400); await check('map');
  await p.click(A + ' .done');
  await p.click('.who [data-who="1"]'); await p.waitForTimeout(400); await check('mira-aviary');
  await p.click(B + ' [data-act=open]'); await p.waitForTimeout(400); await check('mira-chat-inbound');
  await p.click('#clockbtn'); await check('controls');
  for (let i = 0; i < 3; i++) await p.click('[data-skip="24"]');
  await p.waitForTimeout(800);
  await p.click('[data-dact=server]'); await p.waitForTimeout(400); await check('server');
  await p.click('.sheet .done'); await p.waitForTimeout(400); await check('mira-landed');
  await p.fill(B + ' textarea', 'Gorgeous!'); await p.click(B + ' .send'); await p.waitForTimeout(400);
  await p.fill(B + ' textarea', 'And another by swift pigeon'); await p.click(B + ' .send'); await p.waitForTimeout(400); await check('mira-swift');
  await p.click(B + ' .who2'); await p.waitForTimeout(400); await check('safety'); await p.click(B + ' .done');
  await p.click('#clockbtn'); await p.click('[data-skip="24"]'); await p.click('[data-skip="24"]'); await p.click('.sheet .done'); await p.waitForTimeout(800);
  await check('toast-and-expired');
  await p.click('.who [data-who="0"]'); await p.waitForTimeout(400); await check('george-after');
  await p.click(A + ' [data-act=tab][data-id=flock]'); await check('flock');
  await p.fill(A + ' .add input', 'nobody'); await p.click(A + ' .add .btn'); await check('flock-flash');
  await p.click(A + ' [data-act=requests]'); await check('requests');
  await p.click(A + ' [data-act=accept]'); await p.waitForTimeout(400); await p.click(A + ' .done');
  await p.click(A + ' [data-act=tab][data-id=roost]'); await check('roost');
  await p.click(A + ' [data-act=tab][data-id=aviary]'); await check('aviary');
  await p.click(A + ' [data-act=compose]'); await check('compose');
  console.log('errors', errs);
  await p.close();
}
const p = await b.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true });
await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/a-landscape.png` });
const q = await b.newPage({ viewport: { width: 1280, height: 900 } });
await q.goto('http://localhost:8765/test.html'); await q.waitForTimeout(1200); await q.screenshot({ path: `${out}/a-desktop.png` });
console.log('TOTAL ISSUES', total);
await b.close();
