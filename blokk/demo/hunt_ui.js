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
  // iOS 27 added these two. Without them a glass bar dissolves into whatever
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
{
  const rows = js.match(/const wsrows = SRC\.workspaces\.map[\s\S]*?\.join\(''\);/);
  const r = rows ? rows[0] : '';
  const box = js.match(/const egressbox = `[\s\S]*?\n    \$\{\(SRC\.egress_log[\s\S]*?\n\s*\}\).join\(''\)\}<\/div>` : ''\}`;/);
  const g = box ? box[0] : '';
  probe('B17 the workspace row does not say what it can reach',
    !/w\.egress/.test(r) || !/may reach/.test(r),
    'the row says it, and the group below revokes it');
  // A workspace that reaches nothing must say so. A blank space reads the
  // same as a feature that has not shipped, and this is the one claim in the
  // product people check.
  probe('B17a a workspace that reaches nothing renders as silence',
    !/reaches nothing/.test(r),
    'the empty case is a sentence');
  // Hosts come out of the database and go into markup and an attribute.
  probe('B17b a host is interpolated into an attribute unescaped',
    /data-deny="\$\{(?!esc\()/.test(g) || !/esc\(h\)/.test(g)
      || !/\.map\(esc\)/.test(r),
    'escaped in the row, the label and the attribute');
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

console.log(`\n  ${BUGS.length} issues found`);
// Non-zero exit, for the same reason as hunt.py: a suite that cannot fail
// is a suite nobody is running.
process.exit(BUGS.length ? 1 : 0);
