// "Remove the app chat ability" (Today First, spec §8.6, §14.2): Chats is people and groups only, as live Chat already
// is. A guard that passes on the code as it is and keeps it so: no route anywhere asks an app a question (no "ask" in
// any router's table in functions/, nor in the inflite Worker's ROUTES), Chat's list is built from friends and groups
// alone (no app kind of chat, no app rows), and Today's page has nowhere to type a question to an app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const IFL = join(ROOT, "../inflite");
const APP = readFileSync(join(ROOT, "pigeon/app.js"), "utf8");
const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = join(dir, f), st = statSync(p);
    if (st.isDirectory()) walk(p, out); else if (/\.(m?js)$/.test(f)) out.push(p);
  }
  return out;
};
// (every route key, as the routers write them: "GET sync", "POST time-offer", "GET /api/today")
const routeKeys = (src) => [...src.matchAll(/["'`]((?:GET|POST|PUT|PATCH|DELETE|HEAD) [^"'`\s]+)["'`]\s*:/g)].map((m) => m[1]);
const asks = (key) => /(^|[\s/_-])ask(s|ed|-?app)?($|[/_?-])/i.test(key.split(" ")[1]) || /\bask[-_]?(weather|fitness|markets|app|today)\b/i.test(key);

test("no router in functions/ has a route that asks an app a question", () => {
  const files = walk(join(ROOT, "functions")).filter((f) => !/[/\\]_min/.test(f));
  assert.ok(files.length > 20, "functions/ read");
  let keys = 0;
  for (const f of files) {
    const k = routeKeys(readFileSync(f, "utf8"));
    keys += k.length;
    const bad = k.filter(asks);
    assert.deepEqual(bad, [], `${f.slice(ROOT.length)}: ${bad.join(", ")}`);
  }
  assert.ok(keys > 100, `the routers' tables were found (${keys} keys)`);
  // (and the guard itself would see one)
  assert.ok(asks("POST ask") && asks("POST weather/ask") && asks("GET ask-app") && asks("POST today/ask"), "the guard sees an ask route");
  assert.ok(!asks("GET my-card") && !asks("POST time-offer") && !asks("POST fit-offer") && !asks("GET tasks"), "and not the others");
});

test("the inflite Worker's ROUTES ask no app a question", { skip: !existsSync(join(IFL, "today/src/index.js")) && "no inflite repo beside" }, () => {
  const src = readFileSync(join(IFL, "today/src/index.js"), "utf8");
  const table = src.slice(src.indexOf("const ROUTES = {"), src.indexOf("};", src.indexOf("const ROUTES = {")));
  const keys = routeKeys(table);
  assert.ok(keys.length >= 10, "ROUTES read");
  assert.deepEqual(keys.filter(asks), []);
  for (const f of ["today/src/hub.js", "email/src/index.js"]) {
    if (!existsSync(join(IFL, f))) continue;
    assert.deepEqual(routeKeys(readFileSync(join(IFL, f), "utf8")).filter(asks), [], f);
  }
});

test("Chat's list is friends and groups, and nothing else: no app kind of chat, no app rows", () => {
  const v = APP.slice(APP.indexOf("function vMessages() {"), APP.indexOf("/* ---------- friends' news"));
  assert.ok(v.length > 1000, "vMessages read");
  assert.match(v, /\.\.\.S\.friends\.map\(/);
  assert.match(v, /\.\.\.S\.groups\.map\(/);
  // (its rows' list is those two, spread, and nothing else is put in it)
  const list = /const fr = \[([\s\S]*?)\]\.sort/.exec(v)?.[1] || "";
  assert.deepEqual((list.match(/\.\.\.S\.\w+/g) || []), ["...S.friends", "...S.groups"], "two kinds of row: a friend, a group");
  assert.doesNotMatch(list.replace(/\.\.\.S\.(friends|groups)/g, ""), /\.\.\.(?!preview|gpreview)\w/, "and nothing else spread in");
  assert.doesNotMatch(APP, /kind === ["']app["']|\.kind == ["']app["']|kind: ["']app["']/, "no app kind of chat");
  assert.doesNotMatch(APP, /\bASK_APPS?\b|\bfunction answer\(|data-act="askapp"|Ask (Weather|Fitness|Markets|Today)/, "no asking an app, and no field for it");
  // (the send sheet: friends and groups as targets, nothing else)
  const rows = APP.slice(APP.indexOf("function sendRows(s) {"), APP.indexOf("function wordsFor("));
  assert.ok(rows.length > 500, "sendRows read");
  assert.doesNotMatch(rows, /\bAPPS\b|kind: ["']app|IFL\.APPS/);
});

test("Today's page has nowhere to ask an app a question", { skip: !existsSync(join(IFL, "today/public")) && "no inflite repo beside" }, () => {
  const dir = join(IFL, "today/public");
  for (const f of readdirSync(dir).filter((x) => /\.(js|html)$/.test(x))) {
    const src = readFileSync(join(dir, f), "utf8");
    assert.doesNotMatch(src, /Ask (Weather|Fitness|Markets|Chat|an app)|placeholder="Ask|data-act="ask(app|weather)"|\/api\/[a-z]+\/ask\b|\/ask["'?]/i, `${f}: an ask field or route`);
  }
});
