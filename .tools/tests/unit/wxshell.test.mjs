// The weather app's offline copy keeps only whole versions (weather/sw.js): every file it keeps fingerprinted as it is
// here, and the page marked with the version. If this fails, run: node .tools/wxshell.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shell } from "../../wxshell.mjs";

test("the service worker's fingerprints and the page's version are this version's", () => {
  const { sw, cache, list, sums } = shell();
  const kept = JSON.parse(/const SUMS = (\{[^}]*\});/.exec(sw)[1]);
  assert.deepEqual(kept, sums, "the fingerprints are stale: run node .tools/wxshell.mjs");
  assert.ok(list.includes("./") && list.includes("./radar.js") && Object.keys(sums).length === list.length - 1);
  const html = readFileSync(new URL("../../../weather/index.html", import.meta.url), "utf8");
  assert.match(html, new RegExp(`name="app-version" content="${cache}"`), "the page isn't marked with this version: run node .tools/wxshell.mjs");
  assert.ok(sw.includes(`const CACHE = "${cache}"`) && /^wx-\d+\.\d+$/.test(cache), "the offline copy isn't named for Weather's version: run node .tools/wxshell.mjs");
});
