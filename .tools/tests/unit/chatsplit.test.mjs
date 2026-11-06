// Chat's first screen loads less: what's only needed after it (every sheet, the maps, Look Up, the passport, Send to a
// Friend…) is pigeon/later.js, which app.js loads with import() the first time it's wanted and at its first quiet moment
// (app.js later()). These keep it so: app.js, minified and gzipped, no bigger than it was made (it was 235 KB before the
// split, 128 KB after: the limit is that with a little room), the first screen's own files without later.js or what only
// it uses, the page naming those (unfetched) so Chat's worker keeps only the newest copy of each, and the seam between the
// two files whole: what later.js is given (laterKit) and what it gives back. (.tools/tests/chatsplit.mjs is the same in a
// browser: what the first screen asks for, a sheet bringing later.js, and opening with no signal.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const ROOT = new URL("../../../", import.meta.url).pathname;
const read = (f) => readFileSync(ROOT + f, "utf8");
const APP = read("pigeon/app.js"), LATER = read("pigeon/later.js"), PAGE = read("pigeon/index.html");
// (as sent: the minified copy, which min.test.mjs checks is current; gzipped as hard as gzip goes)
const gz = (f) => gzipSync(readFileSync(ROOT + "min/pigeon/" + f), { level: 9 }).length;
const LIMIT = 133_000;
// a file's own imports, not those loaded later with import()
const importsOf = (f) => [...read("pigeon/" + f).matchAll(/^import\s[^;]*?from\s*"\.\/([\w.-]+\.js)";/gm)].map((m) => m[1]);
const closure = (f, seen = new Set()) => { for (const x of importsOf(f)) if (!seen.has(x)) { seen.add(x); closure(x, seen); } return seen; };

test("app.js, minified and gzipped, stays as small as the split made it", () => {
  const n = gz("app.js");
  assert.ok(n <= LIMIT, `min/pigeon/app.js is ${n} bytes gzipped, over ${LIMIT}: move what the first screen doesn't need to later.js`);
});

test("the first screen's files: none of later.js, nor what only it uses", () => {
  const first = closure("app.js");
  for (const f of ["later.js", "moon.js", "land.js", "rank.js", "jsqr.js", "shapes.js"]) assert.ok(!first.has(f), `app.js brings in ${f} at once`);
  assert.match(APP, /import\("\.\/later\.js"\)/, "app.js loads later.js later");
  assert.equal([...APP.matchAll(/["']\.\/later\.js["']/g)].length, 1, "and only that way");
  assert.ok(!/from\s*"\.\/app\.js"|import\("\.\/app\.js"\)/.test(LATER), "later.js imports nothing of app.js (no import going round in a circle)");
  for (const f of first) assert.ok(!/later\.js/.test(read("pigeon/" + f)), `${f} (on the first screen) names later.js`);
});

test("the page preloads only the first screen's files, and names later.js's (unfetched) for the worker to keep", () => {
  const first = closure("app.js"), later = [...closure("later.js"), "later.js"].filter((f) => !first.has(f) && f !== "app.js");
  const pre = [...PAGE.matchAll(/<link rel="modulepreload" href="\/pigeon\/([\w.-]+)"/g)].map((m) => m[1]);
  for (const f of pre) assert.ok(first.has(f), `index.html preloads ${f}, which the first screen doesn't use`);
  const named = [...PAGE.matchAll(/<link rel="inflight-later" href="\/pigeon\/([\w.-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(named.sort(), later.sort(), "index.html names each of later.js's own files, and only those");
});

test("the seam: what later.js takes of app.js is in laterKit, and what app.js calls of it, load hands back", () => {
  const kit = /\nfunction laterKit\(\) \{\n  return \{\n([\s\S]*?)\n  \};\n\}/.exec(APP)?.[1];
  assert.ok(kit, "app.js has laterKit");
  const getters = new Set([...kit.matchAll(/\bget (\w+)\(\)/g)].map((m) => m[1]));
  const plain = new Set(kit.replace(/\s*get \w+\(\)[^\n]*/g, "").split(",").map((s) => s.trim()).filter(Boolean));
  const takes = /\n  const \{\n([\s\S]*?)\n  \} = APP;/.exec(LATER)?.[1].split(",").map((s) => s.trim()).filter(Boolean);
  assert.ok(takes?.length > 50, "later.js's load takes app.js's own from APP");
  for (const n of takes) assert.ok(plain.has(n), `later.js takes ${n}, which laterKit doesn't give`);
  for (const n of plain) assert.ok(takes.includes(n), `laterKit gives ${n}, which later.js doesn't take`);
  for (const [, n] of LATER.matchAll(/\bAPP\.(\w+)/g)) if (n !== "x") assert.ok(getters.has(n), `later.js reads APP.${n}, which laterKit has no getter for`);
  const gives = /^\n  return \{\n([\s\S]*?)\n  \};\n\}\s*$/.exec(LATER.slice(LATER.lastIndexOf("\n  return {\n")))?.[1].split(",").map((s) => s.trim()).filter(Boolean);
  assert.ok(gives?.length, "load hands back what app.js calls");
  const called = new Set([...APP.matchAll(/\bLATER\??\.(\w+)/g), ...APP.matchAll(/\bviaLater\("(\w+)"\)/g)].map((m) => m[1]));
  for (const n of called) assert.ok(gives.includes(n), `app.js calls later.js's ${n}, which load doesn't hand back`);
  for (const n of gives) assert.ok(new RegExp(`(?:^|\\n)(?:async )?function ${n}\\(`).test(LATER), `later.js hands back ${n}, which it doesn't have`);
});
