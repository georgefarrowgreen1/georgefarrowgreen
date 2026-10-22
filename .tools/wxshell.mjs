// The weather app's offline copy (weather/sw.js): each file it keeps fingerprinted (SUMS, SHA-256 in base64), and the
// page marked with the version (index.html app-version, the service worker's CACHE), so a phone only ever keeps a whole
// version. Run after changing any of the files it keeps, and after bumping CACHE:  node .tools/wxshell.mjs
// (.tools/tests/unit/wxshell.test.mjs fails until it has been)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dir = new URL("../weather/", import.meta.url);
export function shell() {
  const sw = readFileSync(new URL("sw.js", dir), "utf8");
  const cache = /const CACHE = "([^"]+)"/.exec(sw)[1], list = JSON.parse(/const SHELL = (\[[^\]]*\]);/.exec(sw)[1]);
  const sums = Object.fromEntries(list.filter((u) => u !== "./").map((u) => [u, createHash("sha256").update(readFileSync(new URL(u, dir))).digest("base64")]));
  return { sw, cache, list, sums };
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { sw, cache, sums } = shell();
  writeFileSync(new URL("sw.js", dir), sw.replace(/const SUMS = \{[^}]*\};/, `const SUMS = ${JSON.stringify(sums)};`));
  const page = new URL("index.html", dir), html = readFileSync(page, "utf8");
  writeFileSync(page, html.replace(/name="app-version" content="[^"]*"/, `name="app-version" content="${cache}"`));
  console.log(`${cache}: ${Object.keys(sums).length} files fingerprinted, the page marked`);
}
