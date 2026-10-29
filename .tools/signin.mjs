// InFlite's way in, shared: .tools/inflite/signin.css copied into each app's stylesheet (between the marks below, so
// each app still sends one stylesheet, as its service worker and version check expect), and InFlite's mark,
// .tools/inflite/inflite.svg, into each app's folder. Change them there, then run: node .tools/signin.mjs
// (Mail, in the inflite repo, takes the same copy: pass its folder, node .tools/signin.mjs ../inflite/email/public,
// and it's done there too.) A unit test checks this repository's copies (unit/iflsignin.test.mjs).
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
const ROOT = new URL("../", import.meta.url).pathname;
export const START = "/* ==== InFlite's way in, shared: from .tools/inflite/signin.css by node .tools/signin.mjs (change it there) ==== */";
export const END = "/* ==== end of InFlite's way in ==== */";
export const STYLES = ["pigeon/styles.css", "fitness/styles.css", "markets/styles.css"];
export const MARKS = ["pigeon", "fitness", "weather", "markets", "account"];
export const block = () => `${START}\n${readFileSync(`${ROOT}.tools/inflite/signin.css`, "utf8").trim()}\n${END}`;

function into(file) {
  const css = readFileSync(file, "utf8"), b = block();
  const i = css.indexOf(START), j = css.indexOf(END);
  const out = i >= 0 && j > i ? css.slice(0, i) + b + css.slice(j + END.length) : `${css.trimEnd()}\n\n${b}\n`;
  if (out !== css) writeFileSync(file, out);
  return out !== css;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const said = [];
  for (const f of STYLES) if (into(ROOT + f)) said.push(f);
  for (const d of MARKS) copyFileSync(`${ROOT}.tools/inflite/inflite.svg`, `${ROOT}${d}/inflite.svg`);
  const mail = process.argv[2];
  if (mail) {
    if (!existsSync(`${mail}/app.css`)) throw new Error(`No app.css in ${mail}`);
    if (into(`${mail}/app.css`)) said.push(`${mail}/app.css`);
    copyFileSync(`${ROOT}.tools/inflite/inflite.svg`, `${mail}/inflite.svg`);
  }
  console.log(said.length ? `InFlite's way in, copied into: ${said.join(", ")}` : "InFlite's way in: every copy already the same");
}
