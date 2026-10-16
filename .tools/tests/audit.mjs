import { chromium } from 'playwright';
const out = process.argv[2];
const AUDIT = () => {
  const boxes = [];
  const all = document.querySelectorAll('body *');
  for (const e of all) {
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      if (getComputedStyle(e).visibility === 'hidden') continue;   // hidden on purpose (e.g. a collapsed chip label)
      const r = document.createRange(); r.selectNodeContents(n);
      for (const rc of r.getClientRects()) {
        if (rc.width < 1 || rc.height < 1) continue;
        const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || !(hit === e || e.contains(hit) || hit.contains(e))) continue; // covered by an overlay, or offscreen
        boxes.push({ e, rc, t: n.textContent.trim().slice(0, 40) });
      }
    }
  }
  const issues = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j]; if (a.e === b.e) continue;
    const ix = Math.min(a.rc.right, b.rc.right) - Math.max(a.rc.left, b.rc.left);
    const iy = Math.min(a.rc.bottom, b.rc.bottom) - Math.max(a.rc.top, b.rc.top);
    if (ix > 2 && iy > 3) issues.push(`OVERLAP "${a.t}" × "${b.t}"`);
  }
  for (const b of boxes) if (b.rc.left < -1 || b.rc.right > innerWidth + 1) issues.push(`OFFSCREEN "${b.t}"`);
  const trunc = [];
  for (const e of all) {
    const cs = getComputedStyle(e);
    if (e.offsetParent === null || cs.visibility === 'hidden' || cs.overflow === 'visible' && cs.overflowX === 'visible') continue;
    if (['TEXTAREA','INPUT','SELECT','svg','CANVAS'].includes(e.tagName) || e.classList.contains('sr') || e.classList.contains('view') || e.classList.contains('body') || e.classList.contains('ct') || e.classList.contains('app') || e.classList.contains('phones')) continue;
    if (e.scrollWidth > e.clientWidth + 1 && e.textContent.trim()) (cs.textOverflow === 'ellipsis' ? trunc : issues).push(`${cs.textOverflow === 'ellipsis' ? 'ELLIPSIS' : 'CLIPPED'} <${e.className}> "${e.textContent.trim().slice(0, 40)}"`);
  }
  if (document.documentElement.scrollWidth > innerWidth) issues.push('PAGE SCROLLS SIDEWAYS');
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
