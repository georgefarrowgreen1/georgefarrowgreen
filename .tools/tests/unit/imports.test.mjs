// The server's modules load, InFlite Today's and every one they're tied in with: each entry point in a fresh copy of
// Node, so each import loop is met from that end (functions/_accounts.js and _retention.js import each other already,
// and Today's modules add loops through _wxpush.js, _fitpush.js and _accounts.js). A name imported that isn't exported,
// or an imported name used at a module's top level before its module has run, stops the whole server (the Pages build
// is one bundle of functions/), so it fails here first. And every name Today's parts share is exported, a function
// taking at least the arguments it's listed with (as JavaScript counts them: those before the first with a default).
// Run it before leaving any work on the server: node .tools/tests/unit/imports.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFile } from "node:child_process";

const ROOT = new URL("../../../", import.meta.url);
const ENTRIES = [
  "functions/api/account/[[path]].js", "functions/api/today/[[path]].js", "functions/api/fitness/[[path]].js",
  "functions/api/markets/[[path]].js", "functions/api/weather/[[path]].js", "functions/_accounts.js",
  ...readdirSync(new URL("functions/", ROOT)).filter((f) => /^_today.*\.js$/.test(f)).sort().map((f) => `functions/${f}`),
  // (and the modules whose names Today's share, or which import Today's, each from its own end of its loops)
  "functions/_fittoday.js", "functions/_wxpush.js", "functions/_fitpush.js", "functions/_markets.js", "functions/_sites.js", "functions/_handback.js",
];

// each loaded in its own Node, all at once → null, or what went wrong
const { NODE_TEST_CONTEXT, ...env } = process.env;
const loadFresh = (file) => new Promise((done) => {
  execFile(process.execPath, ["--input-type=module", "-e", "await import(process.argv[1]);", new URL(file, ROOT).href], { env, timeout: 60e3 },
    (e, stdout, stderr) => done(e ? (String(stderr).split("\n").find((l) => /Error\b/.test(l)) || String(stderr).trim().split("\n").slice(-3).join(" ") || String(e.message)) : null));
});
const loads = new Map(ENTRIES.map((f) => [f, loadFresh(f)]));
for (const [file, loaded] of loads) {
  test(`${file} loads in a fresh copy of Node (every import exported, nothing imported used before it's run)`, async () => {
    assert.equal(await loaded, null);
  });
}

// The names Today's parts share, and how each is called (as listed for its builders); a value's own check, else a
// function's parameters
const isList = (want) => (v, at) => assert.deepEqual(v, want, at);
const SHARED = {
  "functions/_sites.js": { todayOrigin: "env, request", todayLinks: "env, request" },
  "functions/_handback.js": { takeHandback: "env, request, app, b, { limitKey, max = 30 } = {}" },
  "functions/_today.js": {
    tddb: "env", CARDS: isList(["weather", "chat", "fitness", "markets"]),
    todayPrefs: "env, userId", savePrefs: "env, userId, { order, hidden }", saveMorning: "env, userId, { on, at, lines, tz }", morningTz: "u, row",
    deviceHash: "endpoint", todayDevices: "env, userId", addDevice: "env, u, sub", moveDevice: "env, u, { sub, was }", removeDevice: "env, userId, endpoint",
    deviceOk: "env, endpoint", deviceGone: "env, endpoint", deviceFailed: "env, endpoint", tidyDevices: "env",
    morningCandidates: "env", claimMorning: "env, userId, day, was", releaseMorning: "env, userId, day, was", keepLast: "env, userId, { title, lines, out, at }",
    morningUsers: "env", dropToday: "env, userId", todayExport: "env, userId",
  },
  "functions/_todayapp.js": {
    // (every Today route under today/, so each has Today's appKey and Origin check)
    TODAY_ROUTES: (v, at) => {
      assert.ok(v && typeof v === "object" && !Array.isArray(v), `${at}: an object`);
      for (const [k, f] of Object.entries(v)) { assert.match(k, /^(GET|POST|PUT|PATCH|DELETE) today\/[a-z/-]+$/, `${at}: ${k}`); assert.equal(typeof f, "function", `${at}: ${k}`); }
    },
    todayBuild: "env", firstMorningAt: "env, u",
  },
  "functions/_todaycards.js": {
    CARD_KEYS: isList(["weather", "chat", "fitness", "markets"]),
    cardsFor: 'env, u, { only = CARD_KEYS, t = Date.now(), request = null, purpose = "page", tz = "Europe/London", links, memo = null } = {}',
    cardsMemo: (v, at) => { assert.equal(typeof v?.get, "function", `${at}.get`); assert.equal(typeof v?.set, "function", `${at}.set`); assert.ok(v.get.length >= 1 && v.set.length >= 2, `${at}: get(userId), set(userId, answer)`); },
    avatarFor: "env, viewerId, id", localDay: "tz, t",
  },
  "functions/_todaywx.js": { weatherCard: "env, u, ctx", skyFor: "wx, now" },
  "functions/_todaychat.js": {
    chatCard: "env, u, ctx",
    CHAT_COLUMNS: (v, at) => assert.ok(Array.isArray(v) && v.length && v.every((c) => typeof c === "string"), `${at}: a list of columns`),
  },
  "functions/_todayfit.js": { fitnessCard: "env, u, ctx" },
  "functions/_todaymkt.js": { marketsCard: "env, u, ctx" },
  "functions/_todaymorning.js": {
    morningLines: "cards, { names, tz, t, lines }", composeMorning: "env, u, row, t, { memo, cards } = {}", previewMorning: "env, u, row, t, { cards } = {}",
    sendMorningNow: "env, u, { endpoint }", morningTick: "env, t = Date.now()", nextAt: "tz, mins, t",
  },
  "functions/_wxpush.js": { COST_FULL: (v, at) => assert.equal(v, 7, at), OM_KEEP: (v, at) => assert.equal(v, 500, at) },
  "functions/_fittoday.js": { cleanSnapshot: "b", setSnapshot: "env, userId, b", snapshotOf: "env, userId" },
  "functions/_markets.js": {
    dayIn: "tz, t", dividends: "env, symbol, opt", yearOf: "env, symbol, opt", nextDividend: "items, t = Date.now()", marketState: "q, t = Date.now()",
    shutToday: "held, t = Date.now()", moneySaid: "v, cur", andSaid: "list",
  },
  // (Pages calls one of these for the scheduler's turn)
  "functions/api/today/[[path]].js": { "onRequest*": (m, at) => assert.ok(Object.keys(m).some((k) => /^onRequest(Post)?$/.test(k) && typeof m[k] === "function"), `${at}: an onRequest or onRequestPost`) },
};
const takes = (params) => new Function(params, "").length;

for (const [file, names] of Object.entries(SHARED)) {
  test(`${file}: every name Today's parts share is exported, each function taking at least the arguments it's listed with`, async () => {
    const m = await import(new URL(file, ROOT).href), wrong = [];
    for (const [name, want] of Object.entries(names)) {
      const at = `${file} ${name}`;
      try {
        if (name.endsWith("*")) { want(m, at); continue; }
        assert.ok(name in m, `${at}: not exported`);
        if (typeof want === "function") { want(m[name], at); continue; }
        assert.equal(typeof m[name], "function", `${at}: not a function`);
        assert.ok(m[name].length >= takes(want), `${at}(${want}): takes ${m[name].length} argument(s), not ${takes(want)}`);
      } catch (e) { wrong.push(e.message.split("\n")[0]); }
    }
    assert.deepEqual(wrong, []);
  });
}
