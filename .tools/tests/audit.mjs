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
// a time (names, figures); a clamp of several lines is a preview, as meant. Text is looked at along its length (each end
// and the middle), so a box drawn over part of it (a map's credits over its scale) is caught (COVERED); and text below
// the screen that nothing will scroll up to be seen (a panel fixed to the screen that runs past its foot, a page held
// still) is too (UNREACHABLE), but not a sheet or drawer waiting off the screen, nor one only peeking in. What passes
// under a bar fixed to the screen as it's scrolled (a header, a tab bar) isn't counted as covered by it, nor as
// overlapping its words, where scrolling brings it out from under; held under one, it is.
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
  // own box is see-through but for its lines and shapes; a shape with neither fill nor line, as a chart's place to point,
  // is see-through too)
  const clear = (v) => /^(none|transparent|rgba\(.*, 0\))$/.test(v);
  const unpainted = (x, c) => /^(svg|g|a|switch|foreignObject)$/.test(x.tagName) || (clear(c.fill) || +c.fillOpacity === 0) && (clear(c.stroke) || +c.strokeOpacity === 0 || c.strokeWidth === '0px');
  const bare = (x) => { const c = css(x); return !/^(IMG|CANVAS|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT)$/.test(x.tagName) && !(x instanceof SVGElement && !unpainted(x, c)) && /^(transparent|rgba\(.*, 0\))$/.test(c.backgroundColor) && c.backgroundImage === 'none' && (c.backdropFilter || 'none') === 'none'; };
  // (hit outside its own box, it's its ::before or ::after that's there (a dot's wider place to tap): see-through, unless
  // that's painted; and what's not seen (see-through, or clipped to nothing) is see-through)
  const PSEUDO = new Map();
  const pseudoBare = (h) => {
    if (!PSEUDO.has(h)) PSEUDO.set(h, ['::before', '::after'].every((k) => { const c = getComputedStyle(h, k); return c.content === 'none' || c.content === 'normal' || (/^(transparent|rgba\(.*, 0\))$/.test(c.backgroundColor) && c.backgroundImage === 'none' && /^(none|""|'')$/.test(c.content) && (c.backdropFilter || 'none') === 'none'); }));
    return PSEUDO.get(h);
  };
  const bareAt = (h, x, y) => bare(h) || !seen(h) || ![...h.getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) && pseudoBare(h);
  const onTop = (e, x, y) => { for (const h of document.elementsFromPoint(x, y)) { if (h === e || e.contains(h) || h.contains(e)) return true; if (!bareAt(h, x, y)) return false; } return false; };
  // (words that take no taps (pointer-events: none, as a map's scale) are made to for the moment they're looked for, or
  // what's behind them would seem to be over them; put back as they were)
  const hittable = (e, f) => {
    if (css(e).pointerEvents !== 'none') return f();
    const had = e.hasAttribute('style'), was = e.style.getPropertyValue('pointer-events'), how = e.style.getPropertyPriority('pointer-events');
    e.style.setProperty('pointer-events', 'auto', 'important');   // (by the CSSOM, which a page's CSP allows, as it doesn't a style attribute)
    // (the attribute read before it's taken away: the browser writes what the CSSOM changed back to it only when it's
    // read, and would otherwise leave an empty one there later)
    try { return f(); } finally { if (was) e.style.setProperty('pointer-events', was, how); else e.style.removeProperty('pointer-events'); if (!had) { e.getAttribute('style'); e.removeAttribute('style'); } }
  };
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
  // (what's drawn over e there: the first thing painted there that isn't see-through, nor e's own)
  const coverAt = (e, x, y) => document.elementsFromPoint(x, y).find((h) => !(h === e || e.contains(h) || h.contains(e)) && !bareAt(h, x, y));
  // (a control, or a box with words of its own: over decoration, it's in the way, where a photo over the big initial
  // behind it isn't)
  const says = (h) => !!h.closest('a[href], button, input, select, textarea, [role=button]') || [...h.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  // (the page scrolls up and down: the screen does (the root's overflow, or the body's given to it), or, the root held
  // still, the body does, in itself)
  const RC = css(R), BC = css(B);
  const pageScrolls = !/hidden|clip/.test(RC.overflowY !== 'visible' ? RC.overflowY : BC.overflowY);
  const bodyScrolls = RC.overflowY !== 'visible' && scrolls(BC, 'y') && B.scrollHeight > B.clientHeight + 1;
  // (held below the screen, v, with nothing to scroll it up: fixed to the screen, or on a page held still, or past the
  // page's end, and nothing between that scrolls. Not in what's waiting off the screen or only peeking in (a closed
  // sheet, a drawer, a preview folded down: under a quarter of it on the screen), nor under a sheet, nor outside a modal
  // that's open (a menu sheet, the page held still under it till it's closed))
  const MODAL = [...document.querySelectorAll('dialog:modal, [aria-modal=true]')].filter((d) => { const r = d.getBoundingClientRect(); return seen(d) && css(d).visibility === 'visible' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
  const held = (e, v) => {
    if (MODAL.length && !MODAL.some((d) => d.contains(e))) return false;
    let fixed = null, placed = null;
    for (let x = e; x && x !== B && x !== R; x = x.parentElement) {
      const c = css(x);
      if (scrolls(c, 'y') && x.scrollHeight > x.clientHeight + 1) return false;
      if (!placed && (/fixed|absolute/.test(c.position) || c.transform !== 'none' || (c.translate || 'none') !== 'none')) placed = x;
      if (c.position === 'fixed') { fixed = x; break; }
    }
    if (!fixed && (bodyScrolls || pageScrolls && v.t + scrollY < document.scrollingElement.scrollHeight - 1)) return false;
    if (placed) { const r = placed.getBoundingClientRect(); if (Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) < Math.min(r.height, innerHeight) / 4) return false; }
    return fixed ? drawn(fixed) : there(e);
  };
  // (the bar it's in, if any: a box fixed to the screen, or stuck, that what's scrolled passes under)
  const LAYER = new Map();
  const layer = (e) => {
    if (!e || e === B || e === R) return null;
    if (!LAYER.has(e)) LAYER.set(e, /fixed|sticky/.test(css(e).position) ? e : layer(e.parentElement));
    return LAYER.get(e);
  };
  // (what scrolls e: its own scroller, or the page (R); fixed, or on a page held still, nothing)
  const mover = (e) => {
    for (let x = e; x && x !== B && x !== R; x = x.parentElement) {
      const c = css(x);
      if (scrolls(c, 'y') && x.scrollHeight > x.clientHeight + 1) return x;
      if (c.position === 'fixed') return null;
    }
    return bodyScrolls ? B : pageScrolls ? R : null;
  };
  // (passing under h as it's scrolled: h stays where it is as what scrolls e moves (fixed to the screen, stuck, or
  // outside that scroller: a header, a tab bar), and scrolling would bring e out from under it, down from one at the top,
  // up from one at the foot (of what scrolls it: a sheet's own title, stuck at its top, may sit low on the screen). Held
  // under it, it's hidden there)
  const passing = (e, v, h) => {
    const m = mover(e), bar = layer(h);
    if (!m || (m === R ? !bar || bar.contains(e) : m.contains(h) && !(bar && m.contains(bar) && !bar.contains(e)))) return false;
    const r = (bar && !bar.contains(e) ? bar : h).getBoundingClientRect(), [up, down] = m === R ? [scrollY, document.scrollingElement.scrollHeight - innerHeight - scrollY] : [m.scrollTop, m.scrollHeight - m.clientHeight - m.scrollTop];
    const q = m === R || m === B ? { top: 0, bottom: innerHeight } : m.getBoundingClientRect(), mid = (Math.max(q.top, 0) + Math.min(q.bottom, innerHeight)) / 2;
    return (r.top + r.bottom) / 2 < mid ? r.bottom - v.t <= up + 1 : v.b - r.top <= down + 1;
  };
  // (in a dialog, a menu, a popover, a toast that e isn't in: drawn over the page on purpose, as a sheet is)
  const popped = (h, e) => { const d = h.closest('dialog, [role=dialog], [aria-modal=true], [role=menu], [role=listbox], [role=tooltip], [popover], [role=status], [role=alert]'); return !!d && !d.contains(e); };
  // (small beside e: a pill, a button, a badge (64px across at most), and no more than a quarter of what holds them both,
  // as a map's © over its scale; not a sheet, a menu or a card stacked over it, nor a row's top over the actions waiting
  // under it)
  const small = (h, e) => {
    let a = h.parentElement;
    while (a && !a.contains(e)) a = a.parentElement;
    if (!a || a === B || a === R) return false;
    const r = h.getBoundingClientRect(), q = a.getBoundingClientRect();
    return Math.min(r.width, r.height) <= 64 && r.width * r.height <= (q.width * q.height) / 4;
  };
  const name = (e) => (e.getAttribute('class') || '').trim() || e.tagName.toLowerCase();
  const boxes = [], issues = [], trunc = [];
  for (const e of B.querySelectorAll('*')) {
    if (/^(TEXTAREA|SELECT|OPTION|SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(e.tagName)) continue;
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const c = css(e);
      if (c.visibility !== 'visible' || !seen(e) || e.checkVisibility?.() === false) continue;   // (hidden on purpose, e.g. a collapsed chip's label, a closed <details>' words)
      const s = n.textContent, t = s.trim().replace(/\s+/g, ' ').slice(0, 40), rg = document.createRange();
      rg.setStart(n, s.search(/\S/)); rg.setEnd(n, s.length - s.match(/\s*$/)[0].length);
      const [it, ib] = ink(c, s.trim()), cut = [...(clipper(e) ? [e] : []), ...cutters(e)];
      let off = false, by = null, how = '', away = false, under = false, aside = 0, lost = false, low = null, cover = null;
      const deco = !!e.closest('[aria-hidden="true"]');
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
        if (w.l >= w.r || w.t >= w.b) { away = true; if (v.r <= 0 || v.l >= innerWidth) aside++; else { far.push(v); if (v.t >= innerHeight) low = v; } continue; }
        // (looked at along it, at each end and in the middle: under something at all three, it's under a sheet, a menu, a
        // bar, unless that's a small box beside it; at one or two, a box is drawn over part of it, as a map's credits over
        // its scale)
        const y = (w.t + w.b) / 2, d = Math.min(3, (w.r - w.l) / 4), xs = [w.l + d, (w.l + w.r) / 2, w.r - d];
        const [at, h] = hittable(e, () => { const at = xs.map((x) => onTop(e, x, y)); return [at, at.every(Boolean) ? null : coverAt(e, xs[at.indexOf(false)], y)]; });
        const hides = h && !over(h, e) && !popped(h, e) && (!deco || says(h)) && !passing(e, v, h);
        if (!at.some(Boolean) && !(hides && small(h, e))) { under = true; continue; }
        if (!cover && hides) cover = h;
        if (v.l < w.l - 1 || v.r > w.r + 1) off = true;
        if (v.b > innerHeight + 1) low = v;
        vis.push(w);
      }
      // (below the screen, and held there: it can't be seen)
      if (low && !under && held(e, low)) issues.push(`UNREACHABLE "${t}"`);
      if (cover) issues.push(`COVERED <${name(cover)}> "${t}"`);
      if (!vis.length && (lost && by ? !drawn(by) : under || !away || pinned(e) || !there(e))) continue;
      // (all of it past the side of the screen, where it was laid out: not slid there, as a closed drawer is)
      if (!vis.length && aside && !moved(e)) off = true;
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
    if (passing(a.e, a.v, b.e) || passing(b.e, b.v, a.e)) continue;   // (one passing under a bar the other's in)
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
