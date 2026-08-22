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

console.log(`\n  ${BUGS.length} issues found`);
// Non-zero exit, for the same reason as hunt.py: a suite that cannot fail
// is a suite nobody is running.
process.exit(BUGS.length ? 1 : 0);
