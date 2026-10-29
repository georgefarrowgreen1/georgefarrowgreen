// InFlite's way in is one template (.tools/inflite/signin.css, copied into each app's stylesheet by .tools/signin.mjs):
// every copy the same as it, InFlite's mark the same in every app, and each app's way in made of its parts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { START, END, STYLES, MARKS, block } from "../../signin.mjs";
const ROOT = new URL("../../../", import.meta.url).pathname;

test("every app's copy of InFlite's way in is the template's", () => {
  for (const f of STYLES) {
    const css = readFileSync(ROOT + f, "utf8"), i = css.indexOf(START), j = css.indexOf(END);
    assert.ok(i >= 0 && j > i, `${f} has no copy: run node .tools/signin.mjs`);
    assert.equal(css.slice(i, j + END.length), block(), `${f}'s copy is out of date: run node .tools/signin.mjs`);
  }
});

test("InFlite's mark is the same in every app", () => {
  const mark = readFileSync(`${ROOT}.tools/inflite/inflite.svg`, "utf8");
  for (const d of MARKS) assert.equal(readFileSync(`${ROOT}${d}/inflite.svg`, "utf8"), mark, `${d}/inflite.svg differs: run node .tools/signin.mjs`);
});

test("each app's way in is made of the template's parts", () => {
  for (const f of ["pigeon/app.js", "fitness/app.js"]) {
    const js = readFileSync(ROOT + f, "utf8");
    for (const part of ["ifl-in", "ifl-top", "ifl-logo", "ifl-cta", "ifl-brand", "ifl-go", "ifl-new", "Powered by InFlite"]) assert.ok(js.includes(part), `${f} has no ${part}`);
  }
});
