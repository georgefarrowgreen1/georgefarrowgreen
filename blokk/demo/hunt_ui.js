const fs=require('fs');
const h=fs.readFileSync('web/index.html','utf8');
const js=h.split('<script>')[1].split('</'+'script>')[0];
const BUGS=[];
const probe=(n,found,d)=>{console.log((found?'  BUG   ':'  ok    ')+n+(d?'  — '+d:'')); if(found)BUGS.push(n);};

// B1 — Promise.all masks a partial failure as "offline"
probe('B1  one failing endpoint renders as fully offline',
  /Promise\.all\(\[[\s\S]{0,200}\]\)/.test(js) && /catch\(e\)\{[\s\S]{0,200}can't reach the Mac/.test(js),
  'health succeeds but handled 500s -> whole UI shows the offline card');

// B2 — paint() parses result without a guard
probe('B2  malformed run.result throws inside paint()',
  /JSON\.parse\(r\.result\|\|'\{\}'\)/.test(js) && !/try\s*\{[\s\S]{0,80}JSON\.parse\(r\.result/.test(js),
  'one bad row and the entire dashboard stops rendering');

// B3 — esc() does not escape quotes
// Evaluate esc() rather than pattern-matching it — the source contains
// '&amp;', so a [^;]+ match truncates and reports a false positive.
const esc = new Function('return '+js.match(/const esc = (s =>[\s\S]*?\}\[c\]\)\);)/)[1].replace(/;$/,''))();
const bad = esc('"><img src=x onerror=1>');
probe('B3  esc() leaves quotes unescaped', /["'<>]/.test(bad), 'escaped to: '+bad);

// B4 — double send in ask
probe('B4  ask can start two overlapping streams',
  /async function send\(q\)\{/.test(js) && !/if\s*\(\s*asking\s*\)\s*return/.test(js),
  'asking is overwritten, so only the last stream is abortable');

// B5 — suggestions destroyed permanently
probe('B5  ask suggestions removed rather than hidden',
  /\$\('#sugg'\)\.remove\?\.\(\)/.test(js),
  'element deleted on first send; the guard below then reads null forever');

// B6 — no timeout on fetch
probe('B6  no timeout on any fetch', !/AbortSignal\.timeout|setTimeout\([^)]*abort/.test(js),
  'a half-open socket after the Mac sleeps hangs the poll indefinitely');

// B7 — service worker cache version is manual
const sw=fs.readFileSync('web/sw.js','utf8');
probe('B7  service worker serves a stale shell after an update',
  /SHELL\s*=\s*'blokk-shell-v1'/.test(sw),
  'cache name is hand-versioned; ship a UI change and the phone keeps the old one');

// B8 — the repeat-decide response is a different shape
// Found by driving the real dashboard against the real server: decide on the
// phone, then tap Approve on the Mac. The server answers {ok, already} with no
// category, res.category.replace threw, and the catch rendered "Nothing was
// sent — the item is still in the queue" for an item that had in fact been
// decided. Reporting a write as failed when it succeeded is invariant 6 in
// reverse, and it sends someone looking for a card that is gone.
probe('B8  a decision made on another device reports "nothing was sent"',
  /res\.category\.replace/.test(js) && !/res\.already/.test(js),
  'the {ok, already} shape carries no category or trust');

// B9 — giving up watching is reported as the thing going wrong
// The sweep runs every workspace's workflow inside the request. With a real
// model that is minutes, the page gave up at twelve seconds, and said "Sweep
// failed" while the runs on screen carried on and finished. A write that
// succeeded must never be reported as one that did not.
probe('B9  a slow sweep is reported as a failed one',
  !/timedOut/.test(js) || !/Still sweeping/.test(js)
  || /post\('\/api\/v1\/sweep'\)/.test(js),
  'abort is distinguished from error, and the sweep is given minutes not seconds');

// B10 — the model server's log is not ours
// It is whatever llama-server printed, which includes file paths and, on a
// bad day, whatever was in the model's name. It goes on the dashboard, so it
// goes through esc() first. Run the real function rather than grepping for
// the call: a probe that matches a string passes the day someone moves it.
{
  const src = js.match(/function paintModel\(r\)\{[\s\S]*?\n\}/);
  if(!src){
    probe('B10 the model server banner is gone', true, 'paintModel() not found');
  } else {
    let html = '';
    const el = { set innerHTML(v){ html = v; }, get innerHTML(){ return html; } };
    const escFn = s => String(s??'').replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const paintModel = new Function('$','esc',
      'return (' + src[0] + ')')(()=>el, escFn);
    paintModel({ok:false, todo:['<script>alert(1)</'+'script>'],
                tiers:[{name:'SMALL', state:'not running',
                        log:['error: <img src=x onerror=alert(1)>']}]});
    const leaked = /<img|<script/i.test(html);
    probe('B10 llama-server output is written to the page unescaped', leaked,
      leaked ? html.slice(0,90) : 'the log tail and the advice are both escaped');
    // And it must say nothing at all when there is nothing wrong, or it
    // becomes the banner everyone learns to scroll past.
    paintModel({ok:true, todo:[], tiers:[]});
    probe('B10b a healthy model server still shows the warning', html !== '',
      html === '' ? 'silent when the model server is up' : html.slice(0,60));
  }
}

// B11 — the update button is two taps from replacing the running code
// Not "does it work" — whether the page can walk you into a state it cannot
// get you out of. Pulled-but-not-restarted has to be a thing it says, and
// reloading before the Mac answers again leaves you on a dead page.
{
  const up = js.match(/async function paintUpdate\(\)\{[\s\S]*?\n\}/);
  probe('B11 the update panel is gone', !up, up ? '' : 'paintUpdate() not found');
  if(up){
    const src = up[0];
    probe('B11a a pull that cannot restart is reported as done',
      !/rr\.error/.test(src),
      'says "pulled — restart it yourself" instead of spinning');
    probe('B11b the page reloads into the gap while the Mac is down',
      !/health/.test(src) || !/for\s*\(/.test(src),
      'polls health until it answers, then reloads');
    probe('B11c a failed update still offers to restart',
      !/failed\s*=\s*true/.test(src) || !/if\(failed\)/.test(src),
      'a failed pull stops before the restart');
  }
}

// B12 — the night shift row, and where its control lives
{
  const w = js.match(/function nightWords\(s\)\{[\s\S]*?\n\}/);
  probe('B12 the night shift is invisible on the dashboard', !w,
    w ? '' : 'nightWords() not found');
  if(w){
    const f = new Function('return (' + w[0] + ')')();
    probe('B12a a night shift that is off reads as one that is on',
      f({on:false, at:'04:00'}) !== 'off', 'off says off');
    probe('B12b a failed sweep reads as a healthy one',
      !/failed/.test(f({on:true, at:'04:00', error:'boom'})),
      'a failed run says so in the row');
    // The row cannot promise a minute: the Mac may be shut at that minute.
    const notrun = f({on:true, at:'04:00'});
    probe('B12c the row promises a time the Mac may be asleep for',
      /next/i.test(notrun), 'says when the window opens, not when it will run');
  }
  // A <select> inside paintHealth would be rebuilt every four seconds, which
  // shuts a dropdown under the finger holding it open.
  const ph = js.match(/function paintHealth\(h\)\{[\s\S]*?\n\}/);
  probe('B12d the schedule control is rebuilt under the finger using it',
    !!ph && /<select/.test(ph[0]),
    'the control is in its own dialog, not in the repainted card');
}

// B13 — the layout, and the things a stylesheet can quietly undo
{
  const css = h.split('<style>')[1].split('</'+'style>')[0];
  // A media query placed before the rules it overrides loses every fight of
  // equal specificity, silently — the desktop rail was drawn at phone width
  // for exactly this reason and nothing said so.
  const mq = css.indexOf('grid-template-columns');
  const lastBase = Math.max(css.lastIndexOf('\n  .run{'), css.lastIndexOf('\n  .runs{'),
                            css.lastIndexOf('\n  .col-main{'), css.lastIndexOf('\n  .ask .thread{'));
  probe('B13 the wide-screen rules are overridden by later base rules',
    mq !== -1 && lastBase > mq,
    'the media query comes after the rules it overrides');
  probe('B13a the desktop layout is gone', !/grid-template-columns/.test(css),
    'two columns above 900px');
  // Everything reachable by Tab must show where it is, not just <button>.
  probe('B13b only <button> gets a focus ring',
    !/\[role="button"\]:focus-visible/.test(css),
    'links and role=button are covered too');
  // The composer is sticky; without room, the last card sits under it.
  probe('B13c the sticky composer covers the end of the queue',
    !/padding[^;]*84px/.test(css), 'the page reserves its height');
  // Three dialogs were being kept in step by hand and had already drifted.
  // Chrome means the sheet itself: a bare #xxxdlg{} setting padding and a
  // radius. Rules for what is *inside* one dialog are not duplication.
  const perDialog = (css.match(/#(phone|src|sche|up)dlg\s*\{[^}]*padding/g) || []).length;
  probe('B13d each dialog carries its own copy of the dialog chrome',
    perDialog > 0, 'one dialog component, four widths');
}

// B14 — Liquid Glass, and the two ways to get it wrong
{
  const css = h.split('<style>')[1].split('</'+'style>')[0];
  // Chrome is glass. Content is not: a card you are reading a stranger's
  // words off must not have the wall showing through it, and iOS puts the
  // material on bars, sheets and controls only.
  const glassed = ['action','quiet','health','run{','chip'].filter(k => {
    const i = css.indexOf('.' + k);
    return i !== -1 && /backdrop-filter/.test(css.slice(i, i + 400));
  });
  probe('B14 the material is on the content, not just the chrome',
    glassed.length > 0, glassed.length ? glassed.join(',') : 'bars and sheets only');
  // Reduce Transparency and Increase Contrast are settings, not hints.
  probe('B14a glass ignores Reduce Transparency',
    !/prefers-reduced-transparency/.test(css) || !/prefers-contrast/.test(css),
    'both pin the material solid');
  // iOS 26 added these two. Without them a glass bar dissolves into whatever
  // is behind it and the edge of the toolbar disappears.
  probe('B14b the glass has no edge and no specular highlight',
    !/darkened edge/.test(css) || !/inset 0 \.6px 0 rgba\(255,255,255/.test(css),
    'darkened outer edge, bright inner top');
  // The scroll edge effect is conditional by definition: no bar until
  // something is under it.
  probe('B14c the toolbar bar is drawn before anything scrolls under it',
    !/header\.edge::before\{opacity:1\}/.test(css) || !/header::before[^}]*opacity:0/.test(css),
    'the bar appears on scroll, and not before');
  const js2 = js;
  probe('B14d the transparency setting is not remembered',
    !/localStorage\.setItem\(GLASS_KEY/.test(js2), 'kept per browser');
  probe('B14e the OS setting loses to the app setting',
    !/if\(!REDUCED\) applyGlass/.test(js2), 'the system setting wins');
  // A <dialog> carries a UA max-width of calc(100% - 38px). A sheet that
  // comes up from the bottom edge and stops short of it is not a sheet.
  probe('B14f the bottom sheet stops short of the screen edge',
    !/max-width:100%/.test(css), 'the UA max-width is overridden');
  // 44pt is the target size, not the drawn size.
  const small = ['.icobtn{height:38px', '.icobtn{height:36px']
    .filter(k => css.includes(k) && !css.slice(css.indexOf(k) - 300, css.indexOf(k))
      .includes('max-width:374px'));
  probe('B14g the toolbar targets are under 40px on a normal phone',
    small.length > 0, small.length ? small.join() : 'targets are 40px and up');
}

// B15 — the two pages have to mean the same thing by the same name
{
  const setup = fs.readFileSync('web/setup.html', 'utf8');
  const dash  = h;
  const val = (src, name) => {
    const m = src.match(new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})'));
    return m && m[1].toLowerCase();
  };
  const same = ['card', 'card2', 'hair'].every(n => {
    const a = val(dash, n), b = val(setup, n);
    return !a || !b || a === b;
  });
  probe('B15 card and card2 mean different things on the two pages',
    !same, same ? 'the dashboard and the wizard agree on the palette'
                : 'same names, different colours');
}

// B16 — "up to date" with what?
// The clone was on main, main was twenty commits behind the branch the work
// was on, and ./blokk update said "already up to date". True, useless, and
// it sends you looking for a feature that was never in the checkout.
{
  const up = js.match(/async function paintUpdate\(\)\{[\s\S]*?\n\}/);
  probe('B16 the update panel says up to date without saying with what',
    !up || !/elsewhere/.test(up[0]),
    'it names the branch, and any branch carrying newer work');
}

// B17 — the allowlist has to be visible, and revocable, where people look
// core/egress.py is the only way anything leaves this Mac, and the list it
// checks against grows on its own: adding a weather source allows two hosts.
// If the sheet does not render them, the list only exists in sqlite3 and
// nobody ever revokes anything.
//
// This used to be a row per workspace with its own hosts under it. There is
// one list now, which makes the sheet simpler and the stakes higher: a host
// on it is a host everything wired here can reach.
{
  const box = js.match(/const egressbox = `[\s\S]*?\n    \$\{\(SRC\.egress_log[\s\S]*?\n\s*\}\).join\(''\)\}<\/div>` : ''\}`;/);
  const g = box ? box[0] : '';
  probe('B17 the sheet does not say what can leave this Mac',
    !g || !/SRC\.egress/.test(js) || !/out\.map\(h =>/.test(g),
    'the group lists every host on the one allowlist');
  // An allowlist with nothing on it must say so. A blank space reads the
  // same as a feature that has not shipped, and this is the one claim in the
  // product people check.
  probe('B17a an allowlist with nothing on it renders as silence',
    !/Nothing reaches off this Mac/.test(g),
    'the empty case is a sentence');
  // Hosts come out of the database and go into markup and an attribute.
  probe('B17b a host is interpolated into an attribute unescaped',
    /data-deny="\$\{(?!esc\()/.test(g) || !/esc\(h\)/.test(g),
    'escaped in the label and in the attribute');
  probe('B17c the control on a host does not revoke anything',
    !/\/api\/v1\/egress\/deny/.test(js) || !/data-deny/.test(js),
    'it posts to egress/deny and repaints from the server');
  // The revoke used to be a 16px chip inside the workspace row, which wrapped
  // out of the text block on any workspace with two hosts. Its own group, and
  // a row per host.
  probe('B17d revoking is a chip inside somebody else\'s row',
    !/class="hrow2"/.test(g) || /class="host"/.test(js),
    'each host is a row of its own');
  // The log is served by /api/v1/sources and had no reader for a while.
  probe('B17e what has actually left is served and never shown',
    !/SRC\.egress_log/.test(js),
    'the sheet shows the tail of logs/egress.log');
}

// B18 — a decision that lands on a run that then cannot continue
// The tap is recorded and the run is marked failed. Saying only the first
// half empties the queue and looks like work that finished.
probe('B18 a run that could not resume is not mentioned at all',
  /res\.run_resumed/.test(js) && !/res\.run_error/.test(js),
  'both halves are said on the card');

// B19 — the whole front end is one <script>, so one stray paren is a blank
// page. Every probe above matches patterns in the source, which a file that
// cannot parse satisfies perfectly well. Parse it.
{
  let err = '';
  try { new Function(js); } catch (e) { err = e.message; }
  probe('B19 the dashboard script does not parse', !!err,
    err || 'index.html parses');
  for (const f of ['web/setup.html', 'demo/index.html']) {
    const src = fs.readFileSync(f, 'utf8');
    const blocks = src.split('<script>').slice(1)
      .map(b => b.split('</' + 'script>')[0]);
    let bad = '';
    blocks.forEach(b => { try { new Function(b); } catch (e) { bad = e.message; } });
    probe(`B19 ${f} does not parse`, !!bad, bad || f + ' parses');
  }
}

// B38 — the automatic-update switch says the same three words everywhere
// A setting with two names is a setting somebody sets in one place and
// reads in the other. The switch, ./blokk autoupdate and the API all take
// off / notify / apply, and the panel is built from the same three — so a
// fourth position added to the UI, or one renamed, is caught here rather
// than by somebody wondering why "Install" does nothing.
//
// The other half is that reading it must never fetch. The whole reason
// updating was manual was that a machine quietly reaching GitHub is one you
// cannot pin to a moment; a panel that ran a check on every open would put
// that back, one menu tap at a time.
{
  const py = fs.readFileSync('core/autoupdate.py', 'utf8');
  // MODES is built from the three constants, not from literals, so the
  // names have to be resolved before they can be compared with the markup.
  // Reading the tuple raw gave OFF/NOTIFY/APPLY against off/notify/apply —
  // a mismatch every time, reported with only the UI's half printed, which
  // read as "both offer off / notify / apply" next to the word BUG.
  const consts = {};
  for (const m of py.matchAll(/^([A-Z]+(?:,\s*[A-Z]+)*)\s*=\s*(.+)$/gm)) {
    const names = m[1].split(',').map(x => x.trim());
    const vals = [...m[2].matchAll(/"([^"]*)"/g)].map(x => x[1]);
    if (names.length === vals.length)
      names.forEach((n, i) => { consts[n] = vals[i]; });
  }
  const modes = (py.match(/^MODES\s*=\s*\(([^)]*)\)/m) || [, ''])[1]
    .split(',').map(x => x.trim()).filter(Boolean)
    .map(x => consts[x] !== undefined ? consts[x]
              : x.replace(/^["']|["']$/g, ''));
  const inUi = [...h.matchAll(/data-auto="([a-z]+)"/g)].map(m => m[1]);
  const same = modes.length === inUi.length &&
               modes.every(m => inUi.includes(m));
  probe('B38 the update switch and core/autoupdate.py disagree',
    !same || modes.length === 0,
    modes.length === 0 ? 'could not read MODES out of core/autoupdate.py'
      : same ? `both offer ${inUi.join(' / ')}`
      // Both sides, always. A mismatch reported with one of them printed
      // says nothing about which is wrong.
      : `core has ${modes.join(' / ') || '(none)'}, the panel has `
        + `${inUi.join(' / ') || '(none)'}`);

  // The GET reads state; the POST moves it. If opening the panel posted a
  // check, every look would be a fetch.
  const fn = (js.match(/async function paintAuto\([\s\S]*?\n\}/) || [''])[0];
  // The detail has to follow the verdict. Written as a two-way ternary on
  // whether paintAuto exists, it printed "it does not fetch" underneath the
  // word BUG — the same defect this file had just caught in B38 above.
  const fetches = /update\/check/.test(fn);
  probe('B38a opening the update panel asks GitHub',
    !fn || fetches,
    !fn ? 'paintAuto is gone'
      : fetches ? 'it runs a check on open, so every look is a git fetch'
      : 'it reads the switch, it does not fetch');

  // And what the panel renders has to be what the endpoint sends.
  const srv = fs.readFileSync('api/server.py', 'utf8');
  const state = (srv.match(/def state\(self\)[\s\S]*?\n    def /) || [''])[0];
  const shape = (py.match(/def state\(self\)[\s\S]*?\n\n/) || [''])[0];
  const reads = [...fn.matchAll(/r\.([a-z_]+)/g)].map(m => m[1]);
  const missing = [...new Set(reads)].filter(k =>
    k !== 'error' && !shape.includes(`"${k}"`));
  probe('B38b the panel reads a field the switch never sends',
    missing.length > 0,
    missing.length ? missing.join(', ') + ' is read and never sent'
      : `${[...new Set(reads)].length} field(s) read, all of them sent`);
}

// B37 — the floating bubble and the last card in the queue
// The composer is fixed to the bottom-right corner, so it floats over
// whatever card is under it. Measured in a browser at 360, 390, 430 and
// 600: the centre of every control is always free — a thumb lands on the
// button — but the bubble takes the button's bottom-right corner, at worst
// 25% of it at 360. That is what a floating control does, and it is not
// what this checks.
//
// What this checks is the case nobody can scroll out of. The last card in
// the queue has nothing below it, so if the column does not end clear of
// the bubble, its Approve sits under 56 points of glass for ever. `main`'s
// 84px bottom padding is what stops that, and nothing said so — it reads
// like a round number somebody liked. Cut it to the 24px the wide layout
// uses and the last decision in the queue becomes untappable on every
// phone, with all four suites green.
//
// The wide layout may use 24 because it earns it differently: the column
// is centred and the bubble is out beyond its right edge. That is a
// separate guarantee, checked separately, at the width where it is
// tightest.
{
  const css = h.split('<style>')[1].split('</' + 'style>')[0];
  const tok = (name) => {
    const m = css.match(new RegExp('--' + name + '\\s*:\\s*(\\d+(?:\\.\\d+)?)px'));
    return m ? parseFloat(m[1]) : null;
  };
  const bodyOf = (sel, from) => {
    // First `sel{...}` at or after `from`. Selectors repeat across media
    // queries, and taking whichever the regex reached first got the wide
    // layout's override — which is how the first draft of this read 24px
    // for the phone rule and reported the wrong number for the right bug.
    const i = css.indexOf(sel + '{', from || 0);
    return i < 0 ? '' : css.slice(i + sel.length + 1, css.indexOf('}', i));
  };
  const lastPx = (t) => {
    const m = (t || '').match(/(\d+(?:\.\d+)?)px\s*$/);
    return m ? parseFloat(m[1]) : null;
  };
  // The base rule, before any @media — that is the one phones get.
  // Against the first *width* query, not the first @media of any kind: the
  // palette's prefers-color-scheme blocks sit hundreds of lines above the
  // layout rules, so comparing against those declared the base rule to be
  // an override and turned this whole check off while it still printed a
  // reason. A probe that goes blind has to fail, and this one did — but for
  // its own bug rather than the product's.
  const firstWidthMedia = (() => {
    const m = css.match(/@media\s*\(min-width:/);
    return m ? m.index : css.length;
  })();
  const mainBase = bodyOf('main', 0);
  const baseIsBase = css.indexOf('main{') < firstWidthMedia;
  const padBottom = (() => {
    const pb = (mainBase.match(/(?:^|;)\s*padding-bottom\s*:\s*([^;]+)/) || [])[1];
    if (pb) return lastPx(pb);
    const p4 = (mainBase.match(/(?:^|;)\s*padding\s*:\s*([^;]+)/) || [])[1];
    return p4 ? lastPx(p4) : null;
  })();

  const bubble = bodyOf('.bubble', 0);
  const bubbleH = lastPx((bubble.match(/(?:^|;)\s*height\s*:\s*([^;]+)/) || [])[1]);
  const bubbleW = lastPx((bubble.match(/(?:^|;)\s*width\s*:\s*([^;]+)/) || [])[1]);
  // .composer sits var(--sp-4) above the safe area, which is 0 on anything
  // without a home indicator — the worst case, and the one to size for.
  const lift = tok('sp-4');

  const blind = [bubbleH, bubbleW, lift, padBottom].some(v => v === null) || !baseIsBase;
  const need = blind ? null : bubbleH + lift;
  probe('B37 the last card in the queue sits under the bubble for ever',
    blind || padBottom < need,
    blind
      ? 'could not read .bubble, --sp-4 or the base main{} — the check went blind'
      : `main ends ${padBottom}px clear and the bubble needs ${need}px `
        + `(${bubbleH} tall, ${lift} up)`);

  // And it stays a corner, not a bar. The comment above .composer says why a
  // full-width bar was rejected: it covers the card underneath it for the
  // whole page rather than 56 points of one corner. A bubble that grew wide
  // would take the centre of every button with it, and the centre is the
  // part that is always free today.
  probe('B37a the composer has grown from a corner into a bar',
    bubbleW === null || bubbleW > 96,
    bubbleW === null ? 'no width on .bubble'
      : `${bubbleW}px wide — it covers a corner, never a whole row`);

  // The wide layout's own guarantee. Taken at the breakpoint that defines
  // .col-main, because that is the narrowest window the rule applies to and
  // therefore the tightest the clearance ever gets.
  {
    const at = css.indexOf('.col-main{');
    const before = css.slice(0, at);
    const m = [...before.matchAll(/@media\s*\(min-width:\s*(\d+)px\)/g)].pop();
    const bp = m ? parseFloat(m[1]) : null;
    const measure = tok('measure'), gutter = tok('gutter');
    const ok = [measure, gutter, bp, bubbleW].every(v => v !== null);
    const colRight = ok ? (bp + measure + 2 * gutter) / 2 : 0;
    const bubbleLeft = ok ? bp - gutter - bubbleW : 0;
    probe('B37b the wide column runs under the bubble at the breakpoint',
      !ok || colRight > bubbleLeft,
      !ok ? 'could not read --measure, --gutter or .col-main\'s breakpoint'
        : `at ${bp}px the column ends at ${Math.round(colRight)} and the `
          + `bubble starts at ${Math.round(bubbleLeft)}`);
  }
}

// B20 — 44 points, everywhere, measured off the stylesheet
// Every control in the app was under it: the toolbar at 40, the sheet
// buttons at 38, the health row at 31, the send button at 38, the
// transparency slider at 28 and the allowlist chip at 16. A fingertip is
// 44pt and a mis-tap here revokes something. The rule is one token, so the
// check is that nothing pins an interactive element below it.
{
  const CONTROL = /button|input|select|textarea|\.mini|\.icobtn|\.go\b|\.stop\b|\.rowbtn|\.chip\b|role=button|\.hrow2|\.sugg/;
  const bad = [];
  for (const f of ['web/index.html', 'web/setup.html']) {
    const css = fs.readFileSync(f, 'utf8').split('<style>')[1].split('</' + 'style>')[0];
    // Rule by rule: selector { body }
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].replace(/\s+/g, ' ').trim(), body = m[2];
      if (/::/.test(sel)) continue;
      // The element being *sized* has to be the control. `.icobtn svg` sizes
      // the glyph inside the button, and an 18px glyph in a 44px target is
      // exactly right — matching the whole selector called that a defect.
      const target = sel.split(',').some(one => {
        const last = one.trim().split(/[ >]+/).pop() || '';
        return CONTROL.test(last);
      });
      if (!target) continue;
      for (const h of body.matchAll(/(?:^|;)\s*(min-height|height)\s*:\s*([\d.]+)px/g)) {
        if (parseFloat(h[2]) < 44)
          bad.push(`${f}  ${sel.slice(0, 46)}  ${h[1]}:${h[2]}px`);
      }
    }
  }
  probe('B20 a control is pinned smaller than a fingertip',
    bad.length > 0, bad.length ? bad[0] : 'nothing interactive is under 44px');
  // What neither this nor B20a can see: a control whose class declares no
  // size at all, which then renders at whatever its text needs. `.ghost` did
  // exactly that and came out 17px tall, and every ghost in the wizard
  // happened to also carry `.go`, so nothing showed it. Catching that
  // statically means deciding which rules match which element — a CSS
  // engine — so it is not attempted here. It is what a rendered measurement
  // is for, and the reason `.ghost` now declares its own height.

  // B20a — and it says so, rather than adding up to it
  // A control whose height is only the sum of its padding is 44 by luck.
  // Snapping the spacing to a 4-point grid took four of them from 48 to
  // 42 without any rule about size changing, and B20 above cannot see it:
  // there is no height in the rule to read.
  const emergent = [];
  for (const f of ['web/index.html', 'web/setup.html', 'demo/index.html']) {
    const css = fs.readFileSync(f, 'utf8').split('<style>')[1].split('</' + 'style>')[0];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].replace(/\s+/g, ' ').trim(), body = m[2];
      if (/::|:hover|:active|:focus|:disabled/.test(sel)) continue;
      const last = sel.split(',')[0].trim().split(/[ >]+/).pop() || '';
      // Only rules that lay a control out: a padding and a shape.
      if (!/^(button|\.mini|\.rowbtn|\.icobtn|\.go|\.pair|\.ctl)/.test(last)
          && !/button/.test(last)) continue;
      if (/(min-)?height\s*:/.test(body)) continue;
      // Only vertical padding can leave a control short. `padding:0 16px`
      // in a media query is a horizontal override and says nothing about
      // height — flagging it made this probe cry wolf on its first run.
      const pad = body.match(/(?:^|;)\s*padding\s*:\s*([^;]+)/);
      const top = body.match(/(?:^|;)\s*padding-(?:top|bottom)\s*:\s*([^;]+)/);
      let vertical = 0;
      if (pad) {
        const parts = pad[1].trim().split(/\s+/);
        vertical = Math.max(parseFloat(parts[0]) || 0,
                            parseFloat(parts[2] ?? parts[0]) || 0);
      }
      if (top) vertical = Math.max(vertical, parseFloat(top[1]) || 0);
      if (!vertical) continue;
      emergent.push(`${f} ${sel.slice(0, 40)}`);
    }
  }
  probe('B20a a control is 44 only by luck',
    emergent.length > 0,
    emergent.length ? `${emergent.length}, e.g. ${emergent[0]}`
                    : 'every control declares its own minimum height');
}

// B21 — styling in the markup is a rule nothing can find
// A style= attribute in a template cannot be overridden, is not reached by
// any media query, and does not exist as far as the Reduce Transparency and
// dark-mode blocks are concerned. Data is different: a bar width and a
// per-workspace colour are values, and they come through as custom
// properties, with the rule that uses them in the stylesheet like every
// other rule.
{
  const bad = [];
  for (const f of ['web/index.html', 'web/setup.html', 'demo/index.html']) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/style="([^"]*)"/g)) {
      const decls = m[1].split(';').map(d => d.trim()).filter(Boolean);
      // Only custom properties, or a template hole that is entirely one.
      if (decls.some(d => !/^--/.test(d) && !/^\$\{/.test(d)))
        bad.push(`${f}: ${m[1].slice(0, 54)}`);
    }
  }
  probe('B21 a CSS rule is written into the markup',
    bad.length > 0, bad.length ? `${bad.length} of them, e.g. ${bad[0]}`
                               : 'markup carries values, never rules');
}

// B22 — six numeric columns, on a 375-point phone
// The wizard's model table is what somebody sees first, and at 375 the
// header row rendered as "WEIGHTS KVTOTALTOK/S" and the numbers as
// "1.1G12.7G13.8G". A table that has stopped being a table.
{
  const setup = fs.readFileSync('web/setup.html', 'utf8');
  const css = setup.split('<style>')[1].split('</' + 'style>')[0];
  // Balanced braces, not a lazy match: the block has nested rules in it and
  // `[\s\S]*?\}` stops at the first one, which is how the first version of
  // this probe reported a rule that was sitting right there.
  const at = css.search(/@media\s*\(max-width:\s*\d+px\)\s*\{/);
  let m = '';
  if (at >= 0) {
    let depth = 0, i = css.indexOf('{', at);
    for (let j = i; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) { m = css.slice(at, j + 1); break; }
    }
  }
  // One space, not none: stripping all whitespace turns `.row button.go`
  // into `.rowbutton.go`, and the pattern for it then never matches.
  const flat = m.replace(/\s+/g, ' ');
  probe('B22 the model table keeps six columns on a phone',
    !m || !/#models[^{]*td[^{]*\{[^}]*display: ?block/.test(flat),
    'below 640 each row becomes a block');
  // And every number keeps its label, or "12.7G" is four characters of
  // mystery once the header row is gone.
  probe('B22a the numbers lose their labels with the header row',
    !/data-l="weights"/.test(setup) || !/td\[data-l\]::before/.test(css),
    'each cell carries the column name');
  // The step's primary action goes full width, where a thumb is.
  probe('B22b the primary action stays pinned to the right on a phone',
    !/\.row button\.go ?\{ ?width: ?100%/.test(flat),
    'it is full width below 640');
}

// B23 — the gutter, between 900 and 1080
// The wide layout used to zero the page's horizontal padding and rely on
// the wrap being narrower than the window. That holds at 1440 and not at
// 1024: the wrap fills the window, and the header and the queue sat flush
// against both edges of an iPad in landscape. The number the wrap stops at
// has changed once already (1080 when there was a status rail beside the
// queue, narrower now that there is not), so this checks the shape of the
// rule — measure plus gutter — rather than the number of the day.
{
  const css = h.split('<style>')[1].split('</' + 'style>')[0];
  // There are several `min-width:900px` blocks in this sheet, most of them
  // one line about something small. Take the one that carries the layout.
  let block = '';
  for (const m of css.matchAll(/@media\s*\(min-width:\s*900px\)\s*\{/g)) {
    let depth = 0, one = '';
    for (let j = m.index + m[0].length - 1; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) {
        one = css.slice(m.index, j + 1); break;
      }
    }
    if (/\.wrap\s*\{[^}]*max-width/.test(one)) { block = one; break; }
  }
  const flat = block.replace(/\s+/g, ' ');
  probe('B23 the page sits flush against the edge on a 1024 screen',
    !flat || /padding-left: ?0[;}]/.test(flat)
      || !/\.wrap ?\{ ?max-width: ?calc\([^}]*var\(--gutter\) ?\* ?2\)/.test(flat),
    'the wrap stops at the measure and the gutter is on top of it');
}

// B23a — one measure, not three
// The wide layout had a 1080 page, a 660 queue and a 760 chat panel: three
// different edges down the same Mac screen, none of them lining up with
// another. They are one token now, and this is the check that they stay
// one — a stray 720px here reintroduces the second edge invisibly.
{
  const css = h.split('<style>')[1].split('</' + 'style>')[0];
  const wide = css.slice(css.indexOf('@media (min-width:900px)'));
  // Widths that set where a column of content stops. Anything under 300 is
  // a control, an icon or a gap, not a measure.
  const stray = [];
  for (const m of wide.matchAll(/(max-width|100vw ?- ?)(?: ?: ?)?\s*(\d{3,})px/g)) {
    if (+m[2] >= 300) stray.push(m[0].trim());
  }
  probe('B23a the wide layout carries more than one measure',
    stray.length > 0,
    stray.length ? stray.join(', ') : 'every measure on a wide screen is --measure');
}

// B24 — one piece of glass in the bar
// iOS 26 groups the controls of a bar into a single glass container with
// the items inside it. Four separate lozenges, each with its own material
// and its own edge, read as four surfaces floating at different depths —
// which is what this had, and the four are one button now. Either shape is
// fine; two bare lozenges side by side is not.
{
  const head = h.slice(h.indexOf('<header>'), h.indexOf('</header>'));
  const lozenges = (head.match(/class="[^"]*\bglass\b/g) || []).length;
  probe('B24 the bar is made of several separate pieces of glass',
    lozenges > 1, `the bar carries ${lozenges} piece of glass`);
}

// B24a — and the piece of glass actually has a material
// .icobtn blanks its background (a button's UA style is a grey fill) and
// comes after .glass in the sheet, so for a while the bar button was a
// blur with an edge and no fill — glass in name only. Whatever carries
// .glass in the bar has to put a background back.
{
  const css = h.split('<style>')[1].split('</' + 'style>')[0];
  const head = h.slice(h.indexOf('<header>'), h.indexOf('</header>'));
  const cls = (head.match(/class="([^"]*\bglass\b[^"]*)"/) || [, ''])[1]
    .split(/\s+/).filter(c => c && c !== 'glass');
  // Which of the element's own classes blank the background after .glass?
  const blanks = cls.filter(c => {
    const r = css.match(new RegExp('\\n  \\.' + c + '\\{[^}]*\\}'));
    return r && /background:\s*(transparent|none)/.test(r[0])
             && css.indexOf(r[0]) > css.indexOf('.glass{');
  });
  const restored = blanks.filter(c =>
    new RegExp('\\.' + c + '\\.glass\\{[^}]*background:').test(css)
    || new RegExp('\\.glass\\.' + c + '\\{[^}]*background:').test(css));
  const bare = blanks.filter(c => !restored.includes(c));
  probe('B24a the bar button is glass in name only',
    bare.length > 0,
    bare.length ? `${bare.join(', ')} blanks the fill and never puts it back`
      : blanks.length ? `${blanks.join(', ')} blanks the fill and puts it back`
                      : 'nothing blanks the material after .glass');
}

// B33a — the page asks for a file that is not there
// With no <link rel="icon"> the browser goes and asks for /favicon.ico on
// its own. Nothing serves it, so every load of every page ended in a 404
// and a red line in the console — which is how a console stops being a
// place anybody looks. There is an /icon.svg and it is served; say so.
{
  for (const f of ['web/index.html', 'web/setup.html']) {
    const src = fs.readFileSync(f, 'utf8');
    const head = src.slice(0, src.indexOf('</head>'));
    probe(`B33a ${f} leaves the browser to guess at /favicon.ico`,
      !/<link[^>]*rel="icon"[^>]*href="\/icon\.svg"/.test(head),
      'the icon is declared, so nothing goes looking for favicon.ico');
  }
}

// B36 — the prose names a control that is there
// Six places told you to press "the ⚯ button" or "the ⚙ button", long after
// the glyphs had been replaced by drawn icons and then by nothing at all.
// A confidently wrong instruction is worse than none: it sends somebody
// hunting the screen for a thing that is not on it, and doctor.py's whole
// job is telling you what to do next. Everything points at the menu now, so
// this checks that what it points at is a row in the menu.
{
  const menu = h.slice(h.indexOf('<dialog id="menudlg">'),
                       h.indexOf('</dialog>', h.indexOf('<dialog id="menudlg">')));
  const rows = [...menu.matchAll(/<span class="k">([^<]+)<\/span>/g)].map(m => m[1].trim());
  const files = ['web/index.html', 'web/setup.html', 'core/doctor.py',
                 'core/sources.py', 'CONNECTING.md', 'README.md', 'MAC-SETUP.md'];
  const wrong = [], glyphs = [];
  for (const f of files) {
    let src; try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    // The retired glyphs, anywhere outside this file.
    for (const g of ['\u26AF', '\u2699', '\u21BB']) {
      if (src.includes(g)) glyphs.push(`${f} still says ${g}`);
    }
    // The name runs straight on into the sentence around it and wraps
    // across lines, so this asks whether a row's label is what comes next
    // rather than trying to find where the name stops.
    const flat = src.replace(/\s+/g, ' ');
    for (const m of flat.matchAll(/Menu \u203A /g)) {
      const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 60);
      if (!rows.some(r => after.startsWith(r))) {
        wrong.push(`${f}: "${after.slice(0, 30).trim()}…"`);
      }
    }
  }
  const bad = glyphs.concat(wrong);
  probe('B36 an instruction points at a control that is not there',
    bad.length > 0,
    bad.length ? bad.join(', ')
      : `every Menu \u203A … in ${files.length} files names one of the ${rows.length} rows`);
}

// B34 — the dashboard is decisions, and the settings are in the menu
// What used to be here: a four-icon toolbar at the top of every screen, a
// 320-point status rail down the side of every Mac window, and a health
// card of five numbers that were fine — all of it permanent, all of it
// competing with the one or two things that actually wanted a person. The
// rule now is that the page shows what needs a decision; everything that is
// settings, configuration or a number to glance at is one button away.
//
// Two halves, because either one alone is a hole: the named controls have
// to be *in* the menu, and nothing new may quietly appear back on the page.
{
  const menu = h.slice(h.indexOf('<dialog id="menudlg">'),
                       h.indexOf('</dialog>', h.indexOf('<dialog id="menudlg">')));
  const main = h.slice(h.indexOf('<main>'), h.indexOf('</main>'));
  const settings = ['sweep', 'nightrow', 'sources', 'setup', 'runs', 'health',
                    'phone', 'appearance', 'update', 'reset'];
  const strays = settings.filter(id => !menu.includes(`id="${id}"`))
    .map(id => main.includes(`id="${id}"`) ? `${id} is on the page` : `${id} is gone`);
  probe('B34 a settings control is not in the menu',
    strays.length > 0,
    strays.length ? strays.join(', ')
                  : `all ${settings.length} are behind the one button`);
}

// B34a — and nothing permanent creeps back onto the page
// The list is empty on purpose. A decision renders into #actions and a
// disclosure into #quiet, both from script; anything hard-coded into main
// is a control that will be there on every screen forever, which is the
// thing that was wrong with the toolbar. Adding one should be a decision
// somebody makes here, not a diff nobody reads.
{
  const main = h.slice(h.indexOf('<main>'), h.indexOf('</main>'));
  const ALLOWED = [];
  const found = [...main.matchAll(/<(button|a)\b[^>]*>/g)]
    .map(m => (m[0].match(/id="([^"]+)"/) || [, `<${m[1]}> with no id`])[1])
    .filter(k => !ALLOWED.includes(k));
  probe('B34a a permanent control sits on the dashboard',
    found.length > 0,
    found.length ? found.join(', ') : 'the page carries decisions, not controls');
}

// B35 — no dead row in the menu
// Every row moved into the sheet kept the id its old control had, so the
// handlers bound without being touched. That is exactly the change that
// looks right and does nothing if one id is mistyped: the row draws, the
// chevron says it opens, and the tap goes nowhere.
{
  const menu = h.slice(h.indexOf('<dialog id="menudlg">'),
                       h.indexOf('</dialog>', h.indexOf('<dialog id="menudlg">')));
  const js = h.slice(h.lastIndexOf('<scr' + 'ipt>'));
  const dead = [];
  for (const m of menu.matchAll(/<(button|a)\s+class="mrow[^"]*"([^>]*)>/g)) {
    const attrs = m[2];
    const id = (attrs.match(/id="([^"]+)"/) || [, ''])[1];
    if (/href="[^"]+"/.test(attrs)) continue;      // a link needs no handler
    if (!id) { dead.push('a row with no id'); continue; }
    if (!new RegExp(`\\$\\('#${id}'\\)\\s*\\.onclick`).test(js)) dead.push(id);
  }
  probe('B35 a menu row does nothing when you tap it',
    dead.length > 0,
    dead.length ? dead.join(', ') : 'every row is a link or has a handler');
}

// B25 — three files, one set of corners
// Same reason as B15 for the palette: the dashboard, the wizard and the
// demo are one product, and a radius scale that only two of them have is
// how they start looking like two products.
{
  const want = ['--r-card', '--r-pill'];
  const missing = [];
  for (const f of ['web/index.html', 'web/setup.html', 'demo/index.html']) {
    const css = fs.readFileSync(f, 'utf8').split('<style>')[1];
    want.forEach(t => { if (!css.includes(t + ':')) missing.push(`${f} ${t}`); });
  }
  probe('B25 the corner scale is not shared by all three pages',
    missing.length > 0, missing.length ? missing.join(', ')
                                       : 'all three define --r-card and --r-pill');
}

// B26 — one spacing grid, actually used
// The scale (--sp-1..6) existed with three users while twenty-two
// different hard-coded values did the real spacing, which is how a card
// came to inset its content 17px at the top and 11px at the side. Every
// margin, padding and gap is a multiple of 4 now (or a token, or a calc
// over one). Under 4px is optical — a hairline, a nudge — and left alone.
{
  const bad = [];
  for (const f of ['web/index.html', 'web/setup.html', 'demo/index.html']) {
    const css = fs.readFileSync(f, 'utf8').split('<style>')[1].split('</' + 'style>')[0];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].replace(/\s+/g, ' ').trim();
      // A slider thumb is centred on its track, not spaced from it: its
      // margin is (track - thumb) / 2 and lands wherever that lands.
      if (/::-(webkit|moz)-(range|slider)/.test(sel)) continue;
      for (const d of m[2].matchAll(
             /(?:^|;)\s*(margin|padding|gap|row-gap|column-gap)(?:-\w+)?\s*:\s*([^;]+)/g)) {
        for (const n of d[2].matchAll(/(-?\d+(?:\.\d+)?)px/g)) {
          const px = Math.abs(parseFloat(n[1]));
          if (px >= 4 && px % 4 !== 0)
            bad.push(`${f} ${sel.slice(0, 34)} ${d[1]}:${n[1]}px`);
        }
      }
    }
  }
  probe('B26 spacing is off the 4-point grid',
    bad.length > 0,
    bad.length ? `${bad.length}, e.g. ${bad[0]}` : 'every gap is a multiple of 4');
}

// B27 — the bubble, and the microphone that never worked
// The composer was a bar the width of the screen, which meant it spent the
// whole page sitting on top of the card underneath it, and it carried a
// microphone for a feature that does not exist — nothing in Blokk takes
// dictation. A control that does nothing is worse than a missing one: it
// is a promise.
{
  const css = h.split('<style>')[1].split('</' + 'style>')[0];
  for (const f of ['web/index.html', 'demo/index.html']) {
    const src = fs.readFileSync(f, 'utf8');
    // The glyph, not the word — a comment is free to explain why the
    // control went, and the first version of this probe failed on the
    // comment that did exactly that.
    probe(`B27 ${f} offers a microphone that takes no dictation`,
      /&#127908;|\u{1F399}/u.test(src),
      'no control for a feature that is not there');
  }
  // The panel opens from where the bubble is, not from a corner near it.
  // Both ends of the transition have to be centred on the button. Checking
  // that `--bx` appears somewhere passed happily with the closed state
  // pinned to the corner and only the open one following the bubble.
  const flatCss = css.replace(/\s/g, '');
  const ends = flatCss.match(/clip-path:circle\([^)]*\)/g) || [];
  probe('B27a the panel opens from a corner rather than from the bubble',
    ends.length < 2 || !ends.every(e => /var\(--bx/.test(e))
      || !/getBoundingClientRect/.test(js),
    'both ends of the circle are centred on the button, measured at press');
  // display:none halfway through a transition is a panel vanishing rather
  // than shrinking; never removing it is a panel covering the whole app.
  probe('B27b closing the panel hides it mid-animation, or never',
    !/transitionend/.test(js) || !/setTimeout\([\s\S]{0,80}?fired/.test(js),
    'it waits for the circle, with a timeout behind it');
  // A bubble that is 56 points is still a target.
  const bub = css.match(/\n  \.bubble\{[^}]*\}/);
  probe('B27c the bubble is smaller than a fingertip',
    !bub || parseFloat((bub[0].match(/width:(\d+)px/) || [0, 0])[1]) < 44,
    'it is 56');
  // B27d — the mark is Blokk's, and it is generated
  // The glyph is the block's top face from the logo, at the same 0.568
  // isometric scale, emitted by brand/chatmark.py. Hand-editing the
  // polygons in the markup is how a mark drifts away from the one in the
  // brand book while still looking roughly right.
  const gen = fs.readFileSync('brand/chatmark.py', 'utf8');
  const ratio = (gen.match(/RATIO\s*=\s*([\d.]+)/) || [])[1];
  const want = fs.readFileSync('brand/blokk-chat.svg', 'utf8')
                 .match(/points="[^"]+"/g);
  for (const f of ['web/index.html', 'demo/index.html']) {
    const src = fs.readFileSync(f, 'utf8');
    const inBubble = (src.match(
      /<button class="bubble[\s\S]{0,900}?<\/button>/) || [''])[0];
    probe(`B27d ${f} draws its own chat glyph by hand`,
      !ratio || !want || (inBubble.match(/<polygon /g) || []).length !== 2
        || /stroke=/.test(inBubble),
      'two polygons from brand/chatmark.py, filled, not stroked');
  }
}

// B28 — light and dark, and the third state between them
// There are three states, not two: an explicit choice stamps
// data-theme on <html>, and "system" stamps nothing at all. A colour whose
// only definition lives inside `@media (prefers-color-scheme)` or inside a
// `[data-theme]` block does not exist in that third state, and the page
// renders one theme's text on the other theme's ground. So: every token is
// defined on bare :root, and the themed blocks only *re*define tokens.
{
  const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const f of ['web/index.html', 'web/setup.html', 'demo/index.html']) {
    const css = strip(fs.readFileSync(f, 'utf8')
      .split('<style>')[1].split('</' + 'style>')[0]);
    // The bare :root block, which is the whole palette.
    const base = (css.match(/(^|\})\s*:root\s*\{([^}]*)\}/) || [0, 0, ''])[2];
    const declared = new Set((base.match(/--[\w-]+(?=\s*:)/g) || []));
    // Everything inside a themed block, at any nesting.
    const themed = new Set();
    for (const m of css.matchAll(
        /(@media[^{]*prefers-color-scheme[^{]*\{[\s\S]*?\n  \}|:root\[data-theme[^{]*\{[^}]*\})/g))
      for (const t of m[0].match(/--[\w-]+(?=\s*:)/g) || []) themed.add(t);
    const orphans = [...themed].filter(t => !declared.has(t));
    probe(`B28 ${f} defines a colour only inside a theme block`,
      orphans.length > 0,
      orphans.length ? orphans.join(', ')
                     : `${themed.size} tokens flip, all of them declared on :root`);
    // And a themed block must not carry rules — only token redefinitions.
    const rules = [];
    for (const m of css.matchAll(/:root\[data-theme[^{]*\{([^}]*)\}/g))
      if (/[a-z-]+\s*:/.test(m[1].replace(/--[\w-]+\s*:[^;]*;?/g, '')
                                  .replace(/color-scheme\s*:[^;]*;?/g, '')))
        rules.push('a [data-theme] block sets something that is not a token');
    probe(`B28a ${f} styles components inside a theme block`,
      rules.length > 0, rules[0] || 'themed blocks redefine tokens and nothing else');
  }
  // B28c — the material has to flip too
  // Liquid Glass is a *tint over what is behind it*. Pinned to the dark
  // tint it stays a dark lozenge on a light page — and the token can be
  // right while a second copy of the rule three lines up is not, which is
  // exactly what happened here: the bubble stayed charcoal in light mode
  // with --glass-tint resolving correctly the whole time.
  for (const f of ['web/index.html', 'web/setup.html', 'demo/index.html']) {
    const css = strip(fs.readFileSync(f, 'utf8')
      .split('<style>')[1].split('</' + 'style>')[0]);
    const pinned = (css.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(var\(--glass-fill\)|calc\([^)]*glass-fill[^)]*\))/g) || []);
    probe(`B28c ${f} pins the glass to one theme's tint`,
      pinned.length > 0,
      pinned.length ? `${pinned.length} rule(s) hard-code the tint`
                    : 'the material reads --glass-tint');
  }

  // The page must paint its own ground. A transparent body borrows the
  // host's, which is the other half of the same bug.
  for (const f of ['web/index.html', 'web/setup.html', 'demo/index.html']) {
    const css = strip(fs.readFileSync(f, 'utf8')
      .split('<style>')[1].split('</' + 'style>')[0]).replace(/\s+/g, ' ');
    probe(`B28b ${f} never paints its own background`,
      !/(html|body)[^{]*\{[^}]*background:\s*var\(--/.test(css),
      'body takes its ground from a token');
  }
}

// B29 — a turn that says nothing must not render as a blank space
// This is the one the photo showed: two questions, two empty answers, and no
// way to tell "it ignored you" from "it broke". Whatever goes quiet upstream,
// the panel has to put a sentence on the screen — so the guard is asserted
// here rather than left to whichever failure happens to be live that week.
{
  const send = js.slice(js.indexOf('async function send(q)'));
  const body = send.slice(0, send.indexOf('\ntick(true);'));
  probe('B29 an empty answer renders as a blank space',
    !/!text\.trim\(\)\s*&&\s*!proposed/.test(body),
    'a turn that says nothing says so, and names what did arrive');
  // …and it must not fire on a turn that only proposed, which legitimately
  // has no prose in the answer area at all.
  probe('B29a the empty-answer guard fires on a proposal-only turn',
    !/proposed=true/.test(body),
    'a proposal counts as an answer');
}

// B30 — the panel's ground must be a token, not a colour
// It was rgba(10,10,12,.86) written straight into .ask, so in light mode the
// header, the bubbles and the composer came up light over a near-black
// thread. A colour with one definition can only ever be right once.
{
  const css = h.split('<style>')[1].split('</' + 'style>')[0];
  const askRule = css.slice(css.indexOf('.ask{'), css.indexOf('.ask.on{'));
  probe('B30 the ask panel pins its ground to one theme',
    /background:\s*(#|rgba?\()/.test(askRule),
    'the panel takes its ground from --veil');
  const defs = (css.match(/--veil\s*:/g) || []).length;
  probe('B30a --veil is not defined in all three theme states',
    defs < 3, `${defs} definitions: bare, prefers-dark, and [data-theme]`);
}

// B31 — the chat header, and what survives a reload
// It used to carry a workspace picker: with four businesses you could not
// otherwise tell which one an answer was about, and "what needs me?" is a
// different answer for each. There is one space, so the picker is gone and
// what is left is the control that was always doing the other half of the
// work — starting a new conversation — plus the memory that makes it mean
// something after a reload.
{
  const head = h.slice(h.indexOf('<div class="ah glass">'));
  const ah = head.slice(0, head.indexOf('</div>'));
  probe('B31 the chat header still carries a workspace picker',
    /id="askws"/.test(h), 'there is one space, so there is nothing to pick');
  probe('B31a there is no way to start a new conversation',
    !/id="asknew"/.test(ah), 'a new-conversation control sits in the header');
  // What you were last looking at has to survive a reload, or "new
  // conversation" is a cleared screen rather than a new conversation.
  // Both directions: checking that the key merely appears passed on an
  // implementation that read it and never wrote it — the reader alone is
  // enough to satisfy a substring test and does nothing at all.
  probe('B31c where you were is forgotten on reload',
    !/blokk-thread/.test(js) || !/localStorage\.setItem\(SEEN/.test(js)
      || !/localStorage\.getItem\(SEEN/.test(js)
      || !/THREAD = d\.thread \|\| THREAD/.test(js)
      || !/recallThread\(\)/.test(js),
    'the thread is remembered, per browser, and read back on load');
}

// B32 — a row hidden with [hidden] has to actually go
// `display:flex` on a class beats the browser's own [hidden]{display:none},
// so hiding the Approve/Edit/Reject row left it sitting above the edit form
// it was making way for. Any rule that sets a display on a class whose
// element is hidden in JS needs the matching [hidden] rule.
{
  const css = h.split('<style>')[1].split('</' + 'style>')[0];
  const hidden = new Set();
  for (const m of js.matchAll(/querySelector\('\.([\w-]+)'\)\.hidden\s*=/g))
    hidden.add(m[1]);
  const missing = [];
  for (const cls of hidden) {
    // Doubled once, not twice: inside a template literal `\\.` is the
    // string `\.`, which is what RegExp wants. Four made it a literal
    // backslash, so this matched nothing and the probe could never fire.
    const sets = new RegExp(`\\.${cls}\\s*\\{[^}]*display\\s*:`).test(css);
    const guarded = new RegExp(`\\.${cls}\\[hidden\\]`).test(css);
    if (sets && !guarded) missing.push(`.${cls}`);
  }
  probe('B32 a class sets display and is then hidden in JS',
    missing.length > 0,
    missing.length ? `${missing[0]} sets display with no [hidden] rule`
                   : 'everything hidden in JS has a [hidden] rule to match');
}

// B33 — the quarantine rule exists twice, in two languages
// demo/engine.js is a port of core/harness.py, and the injection triage
// regex is the piece most easily left behind: it is one line in each file,
// they are never read side by side, and a demo that flags less than the
// real thing is a demo that lies about the guarantee it exists to show.
// Compared as a set of alternatives rather than character by character —
// Python and JS spell a regex differently, and the thing that must agree
// is what it catches.
{
  const py = fs.readFileSync('core/harness.py', 'utf8');
  const js = fs.readFileSync('demo/engine.js', 'utf8');
  const bits = (src, tag) => {
    const m = src.match(tag);
    if (!m) return null;
    let body = m[1]
      .replace(/\s*(#|\/\/)[^\n]*/g, '')       // comments in either language
      .replace(/["'\n\s]|r"|\/i|re\.I|,/g, '');  // quoting, flags, joins
    // Python's is re.compile("(...)"), JS's is /(...)/i, so one capture
    // carries the outer group and the other does not. Stripping it is the
    // difference between comparing the rules and comparing the brackets.
    while (body.startsWith('(') && body.endsWith(')')) body = body.slice(1, -1);
    return body.split('|').map(x => x.trim()).filter(Boolean).sort().join('|');
  };
  const a = bits(py, /INSTRUCTIONISH = re\.compile\(([\s\S]*?)\)\s*\n\n/);
  const b = bits(js, /const INSTRUCTIONISH =\s*\/\(([\s\S]*?)\)\/i;/);
  probe('B33 the demo flags different text from the real thing',
    !a || !b || a !== b,
    (!a || !b) ? 'could not read one of the two regexes'
      : a === b ? 'both files catch the same set of phrases'
      : `they differ: python has ${a.length} chars, js ${b.length}`);

  // B33b — and the numbers, not only the phrase list
  // "If you change a threshold or a rule in Python, change it there too and
  // re-run journey.js, or the two drift and the demo starts lying." Only
  // the phrase list was ever machine-checked. The numbers are the half that
  // drifts silently: a demo that graduates a category at fifteen while the
  // product needs twenty is a demo of a different product, and every suite
  // stays green while it says so.
  //
  // Each of these is one number that exists in both files and has to be one
  // number. Where the two express it differently — a schema default against
  // a literal in an object — the pair says where to look.
  const schema = fs.readFileSync('core/schema.sql', 'utf8');
  const harness = fs.readFileSync('core/harness.py', 'utf8');
  const num = (src, re) => { const m = src.match(re); return m ? m[1] : null; };
  const PAIRS = [
    ['clean approvals to graduate',
     num(schema, /threshold\s+INTEGER NOT NULL DEFAULT (\d+)/),
     num(js, /threshold\s*:\s*(\d+)/)],
    ['what a rejection resets clean to',
     num(harness, /UPDATE trust SET clean=(\d+), auto=0/),
     num(js, /t\.clean\s*=\s*(\d+)\s*;\s*t\.auto\s*=\s*0/)],
    ['what a rejection resets auto to',
     num(harness, /UPDATE trust SET clean=0, auto=(\d+)/),
     num(js, /t\.clean\s*=\s*0\s*;\s*t\.auto\s*=\s*(\d+)/)],
  ];
  const off = PAIRS.filter(([, x, y]) => x === null || y === null || x !== y);
  probe('B33b the demo and the engine disagree on a number',
    off.length > 0,
    off.length
      ? off.map(([what, x, y]) =>
          `${what}: python ${x === null ? 'unreadable' : x}, `
          + `js ${y === null ? 'unreadable' : y}`).join('; ')
      : `${PAIRS.length} shared number(s), the same on both sides`);
}

// B39 — a failing sheet action dies with no word on the screen
// post() throws on a 4xx, a 500 and a timeout — the server answers a
// refused add or peek as a 400 on purpose — so every mutating handler in
// the sources sheet has to catch, or the button just stops working and
// the person reports "unable to remove sources", which is exactly what
// happened. Checked as source: each handler's block, from its arrow to
// the next handler, must contain a catch.
{
  const page = fs.readFileSync('web/index.html', 'utf8');
  const naked = [];
  for (const mark of ["[data-rm]", "[data-deny]", "[data-peek]",
                      "'#s-add'", "'#s-test'"]) {
    const at = page.indexOf(mark, page.indexOf('function paintSources'));
    if (at < 0) { naked.push(`${mark} missing entirely`); continue; }
    // This handler's block only — up to the next handler attachment. A
    // fixed window read the neighbour's catch as this one's, which is a
    // probe green for the wrong reason.
    let end = Infinity;
    for (const stop of ['.onclick =', '.forEach(']) {
      const n = page.indexOf(stop, at + mark.length + 30);
      if (n > -1 && n < end) end = n;
    }
    const slice = page.slice(at, end === Infinity ? at + 900 : end);
    if (!/catch\s*[({]/.test(slice))
      naked.push(mark);
  }
  probe('B39 a failing sheet action dies with no word on the screen',
    naked.length > 0,
    naked.length ? `no catch near: ${naked.join(', ')}`
                 : 'every sheet action reports its failure as a sentence');
}

console.log(`\n  ${BUGS.length} issues found`);
// Non-zero exit, for the same reason as hunt.py: a suite that cannot fail
// is a suite nobody is running.
process.exit(BUGS.length ? 1 : 0);
