// InFlite's menu is one template (.tools/inflite/menu.js and menu.css, copied into each app by .tools/iflmenu.mjs):
// every copy the same as it, and each app opening it and saying its version.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { JS_START, JS_END, CSS_START, CSS_END, SCRIPTS, STYLES, jsBlock, cssBlock } from "../../iflmenu.mjs";
const ROOT = new URL("../../../", import.meta.url).pathname;
const copy = (f, start, end) => { const t = readFileSync(ROOT + f, "utf8"), i = t.indexOf(start), j = t.indexOf(end); return i >= 0 && j > i ? t.slice(i, j + end.length) : null; };

test("every app's copy of InFlite's menu is the template's", () => {
  const js = jsBlock(), css = cssBlock();
  for (const f of SCRIPTS) assert.equal(copy(f, JS_START, JS_END), js, `${f}'s copy is missing or out of date: run node .tools/iflmenu.mjs`);
  for (const f of STYLES) assert.equal(copy(f, CSS_START, CSS_END), css, `${f}'s copy is missing or out of date: run node .tools/iflmenu.mjs`);
});

test("each app opens it, and says its version", () => {
  for (const [f, app] of [["pigeon/app.js", "chat"], ["weather/app.js", "weather"], ["fitness/app.js", "fitness"]]) {
    const js = readFileSync(ROOT + f, "utf8");
    assert.ok(js.includes(`IFL.built("${app}"`), `${f} doesn't say its version (IFL.built)`);
    assert.match(js, /IFL\.menu\(/, `${f} doesn't open InFlite's menu`);
  }
  assert.match(readFileSync(ROOT + "account/app.js", "utf8"), /IFL\.appsRow\(/);
});

test("the template's apps' icons are each app's own", () => {
  const icons = { chat: "pigeon", weather: "weather", fitness: "fitness", account: "account" };
  for (const [a, d] of Object.entries(icons)) assert.equal(readFileSync(`${ROOT}.tools/inflite/icons/${a}.svg`, "utf8"), readFileSync(`${ROOT}${d}/icon.svg`, "utf8"), `.tools/inflite/icons/${a}.svg isn't ${d}/icon.svg`);
});
