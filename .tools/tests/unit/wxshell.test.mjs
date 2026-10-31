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

// The page asks at once for what its first screen needs, and only that (index.html's modulepreloads: app.js's imports,
// followed through), not the radar card's own code, which waits for the card (app.js radarLater); and every script the
// app can load, as it opens or as it's wanted (a card's, a sheet's, a worker's), is in the offline copy, so the radar
// still works offline once it's come near
test("the page preloads what it opens with, not the radar card's code, and keeps offline every script it can load", () => {
  const dir = new URL("../../../weather/", import.meta.url), read = (f) => readFileSync(new URL(f, dir), "utf8");
  const statics = (f) => [...read(f).matchAll(/^(?:import|export)\s[^;]*?from\s*"\.\/([^"]+)"/gm)].map((m) => m[1]);
  const later = (f) => [...read(f).matchAll(/import\("\.\/([^"]+)"\)|new URL\("\.\/([^"]+)", import\.meta\.url\)/g)].map((m) => m[1] || m[2]);
  const reach = (from, how) => { const seen = new Set(), go = (f) => { if (seen.has(f) || f.startsWith("vendor/")) return; seen.add(f); for (const g of how(f)) go(g); }; from.forEach(go); return seen; };
  const start = reach(["app.js"], statics), all = reach(["app.js", "boot.js", "early.js"], (f) => [...statics(f), ...later(f)]);
  const html = read("index.html"), preloads = [...html.matchAll(/rel="modulepreload" href="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...preloads].sort(), [...start].filter((f) => f !== "app.js").sort(), "index.html's modulepreloads aren't app.js's imports");
  assert.ok(!start.has("radar.js") && !start.has("radarmix.js") && start.has("radarrain.js"), "the radar card's code is fetched as the page opens");
  const { list } = shell(), missing = [...all].filter((f) => !list.includes(`./${f}`));
  assert.deepEqual(missing, [], "a script the app can load isn't in the offline copy (weather/sw.js SHELL)");
  assert.ok(all.has("radar.js") && all.has("mapgl.js") && all.has("radarwork.js") && all.has("detail.js"));
});
