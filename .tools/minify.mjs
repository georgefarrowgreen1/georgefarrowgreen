// The apps' scripts and styles, minified for sending (functions/_min.js): each one's comments and spacing taken out,
// nothing renamed, into min/ at the same path (min/weather/app.js for weather/app.js), with each original's fingerprint
// (min/manifest.json). A copy is only sent while its original is still the same, so one not made again after a change
// is never sent: the original is, unminified. Run after changing any app's files, before node .tools/wxshell.mjs
// (Weather's offline copy fingerprints what's sent):  node .tools/minify.mjs
// (.tools/tests/unit/min.test.mjs says which are out of date)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const ROOT = new URL("../", import.meta.url).pathname;
// (every app's own scripts and styles, and the home page's: not the service workers, nor the libraries kept as they came)
export function sources() {
  return execSync("git ls-files -co --exclude-standard 'pigeon/*.js' 'pigeon/*.css' 'weather/*.js' 'weather/*.css' 'fitness/*.js' 'fitness/*.css' 'account/*.js' 'account/*.css' app.js styles.css", { cwd: ROOT })
    .toString().split("\n").filter((f) => f && !/\/sw\.js$|\/vendor\/|\.min\./.test(f) && existsSync(ROOT + f));
}
export const sha = (buf) => createHash("sha256").update(buf).digest("hex");

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const { transformSync } = createRequire(ROOT + ".tools/tests/package.json")("esbuild");
  const list = sources(), manifest = {};
  let before = 0, after = 0;
  rmSync(ROOT + "min", { recursive: true, force: true });
  for (const f of list) {
    const src = readFileSync(ROOT + f);
    const out = transformSync(src.toString(), { loader: f.endsWith(".css") ? "css" : "js", minifyWhitespace: true, minifySyntax: true, legalComments: "none", charset: "utf8" }).code;
    mkdirSync(ROOT + "min/" + f.slice(0, f.lastIndexOf("/") + 1), { recursive: true });
    writeFileSync(ROOT + "min/" + f, out);
    manifest[f] = sha(src);
    before += src.length; after += Buffer.byteLength(out);
  }
  writeFileSync(ROOT + "min/manifest.json", JSON.stringify(manifest, null, 1) + "\n");
  console.log(`${list.length} files minified: ${Math.round(before / 1024)} KB → ${Math.round(after / 1024)} KB`);
}
