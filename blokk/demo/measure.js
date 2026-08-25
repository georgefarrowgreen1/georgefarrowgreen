/* Measured in a real browser, rather than asserted about the stylesheet.
 *
 * CLAUDE.md has claimed for a while that a dozen behaviours here are
 * "measured in a real browser, not asserted" — 44pt targets at three
 * widths, zero text below 4.5:1 in both themes, nothing rendering past the
 * right edge, every container inset the same on four sides. They were
 * measured, once, by hand. Nothing re-ran them, so the claims were true of
 * a moment rather than of the code, and every one of them is the kind of
 * thing a single padding change quietly breaks.
 *
 * The other suites read the source. That catches a rule pinned wrong and
 * cannot catch a rule that is right and loses: two selectors of equal
 * specificity where source order decides, a token that resolves to nothing,
 * a control that declares no height and renders at whatever its text needs.
 * Those are the ones that got through before.
 *
 * Playwright is a dependency, and Blokk's rule is stdlib only. The rule is
 * about the runtime — this has to still boot in two years on a machine
 * nobody has maintained — and nothing here is in the runtime. So it is
 * guarded: no Playwright, no browser, this prints why and exits 0. A check
 * that cannot run must not look like a check that passed, so it says which
 * of the two it is on every run.
 */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8171;
const BUGS = [];
const probe = (n, found, d) => {
  console.log((found ? '  BUG   ' : '  ok    ') + n + (d ? '  — ' + d : ''));
  if (found) BUGS.push(n);
};

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.log('  skipped  no browser: playwright is not installed here.');
  console.log('           npm i -D playwright && npx playwright install chromium');
  console.log('           Everything else still runs; these checks did not.');
  process.exit(0);
}

// Where the browser is. PLAYWRIGHT_BROWSERS_PATH installs land outside the
// package, and a machine that has the module but not the binary should say
// so rather than throw a wall of Playwright's own text.
function browserPath() {
  const env = process.env.BLOKK_CHROMIUM;
  if (env && fs.existsSync(env)) return env;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      for (const rel of ['chrome-linux/chrome',
                         'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(base, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;                    // let Playwright find its own
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const token = (() => {
    try { return fs.readFileSync(path.join(ROOT, '.blokk-token'), 'utf8').trim(); }
    catch (e) { return ''; }
  })();
  const server = spawn('python3', ['-m', 'api.server', String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    // Wait for it rather than sleeping a guessed amount: a slow machine
    // that has not finished opening the database is not a layout defect.
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await sleep(250);
      up = await fetch(`http://127.0.0.1:${PORT}/api/v1/health?t=${token}`)
        .then(r => r.ok).catch(() => false);
    }
    if (!up) {
      probe('M0 the control plane never came up for the measurements', true,
        `nothing answered on ${PORT} after 15s`);
      throw new Error('no server');
    }
    // Something in the queue, or every card check measures an empty page.
    await fetch(`http://127.0.0.1:${PORT}/api/v1/sweep?t=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: '{}' }).catch(() => {});

    const exe = browserPath();
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
    const url = `http://127.0.0.1:${PORT}/?t=${token}`;

    // ── M1  every control is a fingertip, at every width ────────────────
    // B20 reads heights off the stylesheet, which cannot see a control that
    // declares no size and renders at whatever its text needs — `.ghost`
    // did exactly that and came out 17px tall.
    const WIDTHS = [[360, 780], [390, 844], [768, 1024], [1440, 900]];
    for (const [w, h] of WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto(url, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const got = await page.evaluate(() => {
        const small = [], over = [];
        for (const el of document.querySelectorAll(
            'button,a[href],input,select,textarea,[role=button]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;   // not on screen
          if (getComputedStyle(el).visibility === 'hidden') continue;
          if (r.width < 44 || r.height < 44)
            small.push(`${el.tagName}"${(el.textContent || '').trim().slice(0, 16)}" `
                       + `${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        for (const el of document.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > window.innerWidth + 1)
            over.push(`${el.tagName}.${el.className}`.slice(0, 40));
        }
        return { small: [...new Set(small)].slice(0, 5),
                 over: [...new Set(over)].slice(0, 5),
                 sideways: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      probe(`M1 a control is under 44pt at ${w}`, got.small.length > 0,
        got.small.length ? got.small.join(', ')
          : 'every control on screen is at least 44x44');
      probe(`M2 something renders past the right edge at ${w}`,
        got.over.length > 0 || got.sideways,
        got.over.length ? got.over.join(', ')
          : got.sideways ? 'the page scrolls sideways with nothing over the edge'
          : 'nothing crosses the right edge and the page does not scroll sideways');
      probe(`M3 the page threw at ${w}`, errs.length > 0,
        errs.length ? errs[0].slice(0, 90) : 'no uncaught errors');

      // The sheets, and the ask panel. CLAUDE.md's claim is "every control
      // on every surface — dashboard, five sheets, ask panel and wizard",
      // and a closed dialog has no boxes to measure: everything above only
      // ever saw the dashboard. Opening each one is the difference between
      // checking the claim and checking a sixth of it.
      // Opened by clicking what a person clicks, not by calling showModal
      // on the dialog. The sheets fill their bodies in the row's own
      // handler, so a dialog opened directly is an empty box with a Close
      // button in it — which is exactly what the first version of this
      // measured, and reported as "1 control, all at least 44x44" for three
      // of the six sheets. A measurement of an empty sheet is not a
      // measurement of the sheet.
      const SHEETS = [['menu', '#menudlg', null], ['sources', '#srcdlg', '#sources'],
                      ['update', '#updlg', '#update'],
                      ['appearance', '#appdlg', '#appearance'],
                      ['phone', '#phonedlg', '#phone'],
                      ['schedule', '#schedlg', '#nightrow']];
      for (const [name, sel, row] of SHEETS) {
        const opened = await page.evaluate(async ([sel, row]) => {
          const nap = ms => new Promise(r => setTimeout(r, ms));
          document.querySelectorAll('dialog[open]').forEach(d => d.close());
          const open = document.querySelector('#openmenu');
          if (open) { open.click(); await nap(150); }
          if (row) {
            const b = document.querySelector(row);
            if (!b) return false;
            b.click();
          }
          await nap(200);
          const d = document.querySelector(sel);
          return !!(d && d.open);
        }, [sel, row]);
        if (!opened) {
          probe(`M1a the ${name} sheet would not open at ${w}`, true,
            `${sel} is not in the page`);
          continue;
        }
        await page.waitForTimeout(1800);   // bodies load over HTTP
        const inside = await page.evaluate((sel) => {
          const d = document.querySelector(sel);
          const small = [], over = [];
          for (const el of d.querySelectorAll(
              'button,a[href],input,select,textarea,[role=button]')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (getComputedStyle(el).visibility === 'hidden') continue;
            if (r.width < 44 || r.height < 44)
              small.push(`${el.tagName}"${(el.textContent || '').trim().slice(0, 14)}" `
                         + `${Math.round(r.width)}x${Math.round(r.height)}`);
            if (r.right > window.innerWidth + 1)
              over.push(`${el.tagName}"${(el.textContent || '').trim().slice(0, 14)}"`);
          }
          return { small: [...new Set(small)].slice(0, 4),
                   over: [...new Set(over)].slice(0, 3),
                   controls: d.querySelectorAll('button,input,select,[role=button]').length };
        }, sel);
        probe(`M1a a control in the ${name} sheet is under 44pt at ${w}`,
          inside.small.length > 0,
          inside.small.length ? inside.small.join(', ')
            : `${inside.controls} control(s), all at least 44x44`);
        probe(`M2a the ${name} sheet runs past the right edge at ${w}`,
          inside.over.length > 0,
          inside.over.length ? inside.over.join(', ') : 'nothing crosses the edge');
      }
      await page.evaluate(() =>
        document.querySelectorAll('dialog[open]').forEach(d => d.close()));

      // The ask panel is not a dialog — it grows out of the bubble.
      const ask = await page.evaluate(async () => {
        const nap = ms => new Promise(r => setTimeout(r, ms));
        const b = document.querySelector('#openask');
        if (!b) return null;
        b.click();
        await nap(600);
        const small = [];
        for (const el of document.querySelectorAll(
            '.panel button, .panel input, .panel textarea, .panel [role=button]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.width < 44 || r.height < 44)
            small.push(`${el.tagName}"${(el.textContent || '').trim().slice(0, 14)}" `
                       + `${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        const n = document.querySelectorAll('.panel button, .panel input').length;
        return { small: [...new Set(small)].slice(0, 4), n };
      });
      if (ask && ask.n)
        probe(`M1b a control in the ask panel is under 44pt at ${w}`,
          ask.small.length > 0,
          ask.small.length ? ask.small.join(', ')
            : `${ask.n} control(s), all at least 44x44`);
      await page.close();
    }

    // ── M6  the wizard, which is the first screen anybody sees ──────────
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto(`http://127.0.0.1:${PORT}/setup.html?t=${token}`,
        { timeout: 30000 });
      await page.waitForTimeout(2000);
      const got = await page.evaluate(() => {
        const small = [], over = [];
        for (const el of document.querySelectorAll(
            'button,a[href],input,select,textarea,[role=button]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (getComputedStyle(el).visibility === 'hidden') continue;
          if (r.width < 44 || r.height < 44)
            small.push(`${el.tagName}"${(el.textContent || '').trim().slice(0, 14)}" `
                       + `${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        for (const el of document.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > window.innerWidth + 1)
            over.push(`${el.tagName}.${el.className}`.slice(0, 36));
        }
        return { small: [...new Set(small)].slice(0, 4),
                 over: [...new Set(over)].slice(0, 3) };
      });
      probe(`M6 a wizard control is under 44pt at ${w}`, got.small.length > 0,
        got.small.length ? got.small.join(', ') : 'every control is 44x44 or more');
      probe(`M6a the wizard runs past the right edge at ${w}`,
        got.over.length > 0, got.over.length ? got.over.join(', ')
          : 'nothing crosses the right edge');
      probe(`M6b the wizard threw at ${w}`, errs.length > 0,
        errs.length ? errs[0].slice(0, 90) : 'no uncaught errors');
      await page.close();
    }

    // ── M4  the floating bubble and the cards under it ──────────────────
    // A floating control covers content; that is what it is for. What it
    // must not cover is the *centre* of a control, because the centre is
    // where a thumb aims — measured at every scroll position, not just the
    // top of the page. B37 pins the case nobody can scroll out of; this is
    // the one that only exists once the page moves.
    for (const [w, h] of [[360, 780], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(url, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const got = await page.evaluate(async () => {
        const nap = ms => new Promise(r => setTimeout(r, ms));
        const comp = document.querySelector('.composer');
        if (!comp) return { none: true };
        const centres = new Set();
        let worst = 0, worstOn = '';
        const H = document.documentElement.scrollHeight;
        for (let y = 0; y <= H; y += Math.floor(window.innerHeight / 4)) {
          window.scrollTo(0, y);
          await nap(30);
          for (const t of document.querySelectorAll('button,[role=button]')) {
            if (comp.contains(t)) continue;
            const r = t.getBoundingClientRect();
            if (r.width < 8 || r.top < 0 || r.bottom > window.innerHeight) continue;
            const label = (t.textContent || '').trim().slice(0, 18);
            const mid = document.elementFromPoint(r.left + r.width / 2,
                                                  r.top + r.height / 2);
            if (mid && (mid === comp || comp.contains(mid))) centres.add(label);
            const cr = comp.getBoundingClientRect();
            const ox = Math.min(cr.right, r.right) - Math.max(cr.left, r.left);
            const oy = Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top);
            if (ox > 0 && oy > 0) {
              const frac = (ox * oy) / (r.width * r.height);
              if (frac > worst) { worst = frac; worstOn = label; }
            }
          }
        }
        window.scrollTo(0, 0);
        return { centres: [...centres], worst: Math.round(worst * 100), worstOn };
      });
      if (got.none) { probe(`M4 there is no composer at ${w}`, true, 'no .composer'); continue; }
      probe(`M4 the bubble takes the middle of a control at ${w}`,
        got.centres.length > 0,
        got.centres.length ? got.centres.join(', ') + ' — a thumb aims at the '
          + 'centre, so this is a mis-tap and not a near miss'
          : `the centre of every control stays free (worst corner: `
            + `${got.worst}% of "${got.worstOn}")`);
      // A third of a control is no longer a corner. Not a number anybody
      // picked: it is the point at which the covered part stops being the
      // edge you aim away from and starts being part of the target.
      probe(`M4a the bubble covers a third of a control at ${w}`,
        got.worst > 33, `worst coverage ${got.worst}% on "${got.worstOn}"`);
      await page.close();
    }

    // ── M5  text is readable, on rendered pixels, in both themes ────────
    // Composited against what is actually behind it. The token values can
    // all be right while a glass layer between them makes the result 2:1.
    for (const scheme of ['dark', 'light']) {
      const page = await browser.newPage({
        viewport: { width: 390, height: 844 }, colorScheme: scheme });
      await page.goto(url, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const bad = await page.evaluate(() => {
        const lum = (c) => {
          const [r, g, b] = c.map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
        // Composite a colour with alpha over what is behind it, because
        // that is what the eye gets.
        const over = (fg, bg) => fg.length < 4 || fg[3] === 1 ? fg.slice(0, 3)
          : [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const groundOf = (el) => {
          for (let n = el; n; n = n.parentElement) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c.length === 3 || (c.length === 4 && c[3] > 0.85))
              return c.slice(0, 3);
          }
          return [0, 0, 0];
        };
        const out = [];
        for (const el of document.querySelectorAll('*')) {
          const txt = [...el.childNodes]
            .filter(n => n.nodeType === 3 && n.textContent.trim())
            .map(n => n.textContent.trim()).join(' ');
          if (!txt) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
          const ground = groundOf(el);
          const fg = over(parse(cs.color), ground);
          const a = lum(fg), b = lum(ground);
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          // 4.5:1 for body text; large text is allowed 3:1 by WCAG and this
          // does not distinguish, so it is checked at the stricter number
          // and a genuine large-text exception would have to be argued for.
          if (ratio < 4.5)
            out.push(`"${txt.slice(0, 22)}" ${ratio.toFixed(2)}:1`);
        }
        return [...new Set(out)].slice(0, 6);
      });
      probe(`M5 text below 4.5:1 in ${scheme}`, bad.length > 0,
        bad.length ? bad.join('; ') : 'every run of text clears 4.5:1 on '
          + 'composited pixels');
      await page.close();
    }
  } catch (e) {
    probe('M9 the measurements could not run', true,
      `${e.constructor.name}: ${String(e.message).slice(0, 120)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
  console.log(`\n  ${BUGS.length} issues found`);
  process.exit(BUGS.length ? 1 : 0);
})();
