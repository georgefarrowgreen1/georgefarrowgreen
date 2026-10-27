// The service worker keeps the app's files (fitness/sw.js): every one of them, so it opens offline with nothing missing
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../../../fitness/", import.meta.url);
const listIn = (file, name) => JSON.parse(`[${new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(readFileSync(new URL(file, dir), "utf8"))[1].replace(/\s+/g, " ")}]`);
test("every module, the styles, the page and its icons are kept for offline", () => {
  const kept = new Set(listIn("sw.js", "FILES"));
  const modules = readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "sw.js");
  for (const f of [...modules, "styles.css", "./", "manifest.webmanifest", "icon.svg"]) assert.ok(kept.has(f), `${f} isn't kept by sw.js`);
  for (const f of listIn("app.js", "FILES")) assert.ok(kept.has(f), `${f} (app.js's version check) isn't kept by sw.js`);
});
