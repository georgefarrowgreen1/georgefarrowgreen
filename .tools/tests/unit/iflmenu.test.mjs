// InFlite's menu is one template (.tools/inflite/menu.js and menu.css, copied into each app by .tools/iflmenu.mjs):
// every copy the same as it, and each app opening it and saying its version.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { JS_START, JS_END, CSS_START, CSS_END, SCRIPTS, STYLES, jsBlock, cssBlock } from "../../iflmenu.mjs";
const ROOT = new URL("../../../", import.meta.url).pathname;
const copy = (f, start, end) => { const t = readFileSync(ROOT + f, "utf8"), i = t.indexOf(start), j = t.indexOf(end); return i >= 0 && j > i ? t.slice(i, j + end.length) : null; };

test("every app's copy of InFlite's menu is the template's", () => {
  const js = jsBlock(), css = cssBlock();
  for (const f of SCRIPTS) assert.equal(copy(f, JS_START, JS_END), js, `${f}'s copy is missing or out of date: run node .tools/iflmenu.mjs`);
  for (const f of STYLES) assert.equal(copy(f, CSS_START, CSS_END), css, `${f}'s copy is missing or out of date: run node .tools/iflmenu.mjs`);
});

// (Mail's copies, in the inflite repo, where it's checked out beside this one)
test("Mail's copy, where the inflite repo is beside this one, is the template's too", { skip: !existsSync(ROOT + "../inflite/email/public/app.js") }, () => {
  const M = "../inflite/email/public/";
  assert.equal(copy(M + "app.js", JS_START, JS_END), jsBlock(), "Mail's app.js copy is out of date: run node .tools/iflmenu.mjs ../inflite/email/public");
  assert.equal(copy(M + "app.css", CSS_START, CSS_END), cssBlock(), "Mail's app.css copy is out of date: run node .tools/iflmenu.mjs ../inflite/email/public");
});

test("each app opens it, and says its version", () => {
  for (const [f, app] of [["pigeon/app.js", "chat"], ["weather/app.js", "weather"], ["fitness/app.js", "fitness"]]) {
    const js = readFileSync(ROOT + f, "utf8");
    assert.ok(js.includes(`IFL.built("${app}"`), `${f} doesn't say its version (IFL.built)`);
    assert.match(js, /IFL\.menu\(/, `${f} doesn't open InFlite's menu`);
  }
});

test("the template's apps' icons are each app's own", () => {
  const icons = { chat: "pigeon", weather: "weather", fitness: "fitness", account: "account" };
  for (const [a, d] of Object.entries(icons)) assert.equal(readFileSync(`${ROOT}.tools/inflite/icons/${a}.svg`, "utf8"), readFileSync(`${ROOT}${d}/icon.svg`, "utf8"), `.tools/inflite/icons/${a}.svg isn't ${d}/icon.svg`);
});

test("each app's top is InFlite's header", () => {
  const uses = { "pigeon/app.js": /IFL\.headerHtml\(/, "fitness/app.js": /IFL\.header\(/, "account/app.js": /IFL\.header\(/, "weather/index.html": /class="me-btn ifh-me[^"]*"[\s\S]*class="top-actions ifh-acts"/ };
  for (const [f, re] of Object.entries(uses)) assert.match(readFileSync(ROOT + f, "utf8"), re, `${f} doesn't use InFlite's header`);
  for (const f of ["pigeon/app.js", "fitness/app.js", "account/app.js", "weather/app.js"]) assert.match(readFileSync(ROOT + f, "utf8"), /IFL\.watch\(|style\.setProperty\("--p"/, `${f}'s header isn't made compact as it's scrolled`);
});
