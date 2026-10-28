// InFlite's menu, shared: .tools/inflite/menu.js (with the apps' icons, .tools/inflite/icons/, drawn into it) copied
// into each app's script, and .tools/inflite/menu.css into its stylesheet, each between the marks below (so each app
// still sends the files it did, as its service worker and version check expect). Change them there, then run:
// node .tools/iflmenu.mjs   (and for Mail, in the inflite repo: node .tools/iflmenu.mjs ../inflite/email/public)
// A unit test checks this repository's copies (unit/iflmenu.test.mjs).
import { readFileSync, writeFileSync, existsSync } from "fs";
const ROOT = new URL("../", import.meta.url).pathname;
export const JS_START = "// ==== InFlite's menu, shared: from .tools/inflite/menu.js by node .tools/iflmenu.mjs (change it there) ====";
export const JS_END = "// ==== end of InFlite's menu ====";
export const CSS_START = "/* ==== InFlite's menu, shared: from .tools/inflite/menu.css by node .tools/iflmenu.mjs (change it there) ==== */";
export const CSS_END = "/* ==== end of InFlite's menu ==== */";
export const SCRIPTS = ["pigeon/app.js", "weather/app.js", "fitness/app.js", "account/app.js"];
export const STYLES = ["pigeon/styles.css", "weather/styles.css", "fitness/styles.css", "account/styles.css"];
const APPS = ["chat", "weather", "fitness", "mail", "account"];

// an app's icon, small: no notes, no spaces between its parts
const mini = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?xml[^>]*>/, "").replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
export const jsBlock = () => {
  const icons = Object.fromEntries(APPS.map((a) => [a, mini(readFileSync(`${ROOT}.tools/inflite/icons/${a}.svg`, "utf8"))]));
  const js = readFileSync(`${ROOT}.tools/inflite/menu.js`, "utf8").trim().replace("/*ICONS*/{}", JSON.stringify(icons));
  return `${JS_START}\n${js}\n${JS_END}`;
};
export const cssBlock = () => `${CSS_START}\n${readFileSync(`${ROOT}.tools/inflite/menu.css`, "utf8").trim()}\n${CSS_END}`;

function into(file, start, end, b) {
  const text = readFileSync(file, "utf8");
  const i = text.indexOf(start), j = text.indexOf(end);
  // (the script's copy goes where its marks are put, before anything that runs uses it; the stylesheet's at its foot)
  if (!(i >= 0 && j > i) && start === JS_START) throw new Error(`${file} has no marks for InFlite's menu: put them in, where it's to go`);
  const out = i >= 0 && j > i ? text.slice(0, i) + b + text.slice(j + end.length) : `${text.trimEnd()}\n\n${b}\n`;
  if (out !== text) writeFileSync(file, out);
  return out !== text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const said = [], js = jsBlock(), css = cssBlock();
  for (const f of SCRIPTS) if (into(ROOT + f, JS_START, JS_END, js)) said.push(f);
  for (const f of STYLES) if (into(ROOT + f, CSS_START, CSS_END, css)) said.push(f);
  const mail = process.argv[2];
  if (mail) {
    if (!existsSync(`${mail}/app.css`)) throw new Error(`No app.css in ${mail}`);
    if (into(`${mail}/app.js`, JS_START, JS_END, js)) said.push(`${mail}/app.js`);
    if (into(`${mail}/app.css`, CSS_START, CSS_END, css)) said.push(`${mail}/app.css`);
  }
  console.log(said.length ? `InFlite's menu, copied into: ${said.join(", ")}` : "InFlite's menu: every copy already the same");
}
