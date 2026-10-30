// The weather app's offline copy (weather/sw.js): each file it keeps fingerprinted (SUMS, SHA-256 in base64), and the
// page marked with the version (index.html app-version, the service worker's CACHE, named for Weather's own BUILD: no
// bumping of its own), so a phone only ever keeps a whole version. Run after changing any of the files it keeps (after
// node .tools/minify.mjs: it fingerprints what's sent):  node .tools/wxshell.mjs
// (.tools/tests/unit/wxshell.test.mjs fails until it has been)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const dir = new URL("../weather/", import.meta.url);
export function shell() {
  const sw = readFileSync(new URL("sw.js", dir), "utf8"), build = /\bconst BUILD = "([0-9.]+)"/.exec(readFileSync(new URL("app.js", dir), "utf8"))[1];
  const cache = `wx-${build}`, list = JSON.parse(/const SHELL = (\[[^\]]*\]);/.exec(sw)[1]);
  // (each as it's sent: its minified copy, where there's one still of the file as it is: functions/_min.js)
  let made = {}; try { made = JSON.parse(readFileSync(new URL("../min/manifest.json", dir), "utf8")); } catch (_) {}
  const sent = (u) => {
    const f = "weather/" + u.slice(2), src = readFileSync(new URL(u, dir));
    const min = new URL("../min/" + f, dir);
    return made[f] && made[f] === createHash("sha256").update(src).digest("hex") && existsSync(min) ? readFileSync(min) : src;
  };
  const sums = Object.fromEntries(list.filter((u) => u !== "./").map((u) => [u, createHash("sha256").update(sent(u)).digest("base64")]));
  return { sw, cache, list, sums };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { sw, cache, sums } = shell();
  writeFileSync(new URL("sw.js", dir), sw.replace(/const SUMS = \{[^}]*\};/, `const SUMS = ${JSON.stringify(sums)};`).replace(/const CACHE = "[^"]+"/, `const CACHE = "${cache}"`));
  const page = new URL("index.html", dir), html = readFileSync(page, "utf8");
  writeFileSync(page, html.replace(/name="app-version" content="[^"]*"/, `name="app-version" content="${cache}"`));
  console.log(`${cache}: ${Object.keys(sums).length} files fingerprinted, the page marked`);
}
