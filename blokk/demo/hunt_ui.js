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

console.log(`\n  ${BUGS.length} issues found`);
// Non-zero exit, for the same reason as hunt.py: a suite that cannot fail
// is a suite nobody is running.
process.exit(BUGS.length ? 1 : 0);
