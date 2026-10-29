// The apps' scripts and styles are sent minified (functions/_min.js), each copy only while it's still of its file as
// it is. Every one has its copy, made from it as it is now: if this fails, run node .tools/minify.mjs (then
// node .tools/wxshell.mjs). An out-of-date copy would never be sent, but the file would go unminified.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { sources, sha } from "../../minify.mjs";
import { MINIFIED } from "../../../functions/_min.js";
const ROOT = new URL("../../../", import.meta.url).pathname;

test("every app script and stylesheet has a minified copy of it as it is now", () => {
  const made = JSON.parse(readFileSync(ROOT + "min/manifest.json", "utf8"));
  const stale = sources().filter((f) => made[f] !== sha(readFileSync(ROOT + f)) || !existsSync(ROOT + "min/" + f));
  assert.deepEqual(stale, [], `out of date: run node .tools/minify.mjs (${stale.slice(0, 5).join(", ")})`);
});

test("the server sends the minified copy for exactly those files", () => {
  for (const f of sources()) assert.ok(MINIFIED.test("/" + f), `${f} isn't one the server would send minified`);
  for (const f of ["/pigeon/sw.js", "/weather/vendor/maplibre-gl.mjs", "/weather/index.html", "/min/manifest.json"])
    assert.ok(!MINIFIED.test(f) || f.endsWith("/sw.js"), `${f} would be sent minified`);
});
