// The sign-in page's own script (auth.<site>): the account's script made with SIGNIN_PAGE true and what that leaves
// unused taken out (.tools/minify.mjs signinPage, into min/account/signin.js), so the sign-in page has about half as
// much to fetch and read. It must be made from account/app.js as it is now (else run node .tools/minify.mjs), hold
// every way in and nothing only the account's page draws, and be what the sign-in page asks for; the account's page
// still runs app.js; and should the copy be out of date, the sign-in page gets app.js itself, never an old copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { sha } from "../../minify.mjs";
import { assets as minAssets, MADE_FROM } from "../../../functions/_min.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const page = readFileSync(ROOT + "min/account/signin.js", "utf8"), full = readFileSync(ROOT + "min/account/app.js", "utf8");
const has = (name) => new RegExp(`function ${name}\\(`).test(page);

test("made from account/app.js as it is now (else: node .tools/minify.mjs)", () => {
  const made = JSON.parse(readFileSync(ROOT + "min/manifest.json", "utf8"));
  assert.equal(made["account/signin.js"], sha(readFileSync(ROOT + "account/app.js")), "out of date: run node .tools/minify.mjs");
  assert.equal(MADE_FROM["account/signin.js"], "account/app.js");
});

test("a module that loads, about half the account's script or less", () => {
  const dir = mkdtempSync(tmpdir() + "/signin-");
  writeFileSync(dir + "/signin.mjs", page);
  execFileSync(process.execPath, ["--check", dir + "/signin.mjs"]);
  assert.ok(page.length < full.length * 0.55, `${page.length} of ${full.length}`);
  assert.ok(gzipSync(page).length < gzipSync(full).length * 0.55);
  assert.match(page, /from"\.\/crypto\.js"|from "\.\/crypto\.js"/, "crypto.js still brought in by name, for the server to stamp");
});

test("every way in kept; nothing only the account's page draws", () => {
  for (const f of ["signedOut", "signinCard", "rememberedCard", "joinCard", "forgotCard", "resetPage", "qrCard", "qrView", "continuePage", "unlockCard",
    "handBack", "authHome", "outPage", "keepPage", "withPassword", "signInWithPasskey", "startAutofill", "confirmView", "render", "load"])
    assert.ok(has(f), `${f} kept`);
  for (const f of ["signedIn", "profileView", "devicesView", "passkeysView", "notifyView", "weatherSetView", "fitnessSetView", "exportView", "deleteView", "activityView"])
    assert.ok(!has(f), `${f} left out`);
  assert.ok(!/\bIFL\b/.test(page), "InFlite's menu left out (the account's page alone shows it)");
  assert.match(page, /SIGNIN_PAGE\?\?=!1/, "the flag kept as written, false, for a reload of app.js");
});

// the static asset store of the site's files (as acctstamp.test.mjs has it), with min/ beside them
const store = (changed = {}) => ({ async fetch(req) {
  let path = new URL(req.url).pathname; if (path.endsWith("/")) path += "index.html";
  const text = changed[path] ?? (() => { try { return readFileSync(ROOT + path.slice(1)); } catch (_) { return null; } })();
  if (text == null) return new Response("not here", { status: 404 });
  return new Response(text, { headers: { "content-type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".json") ? "application/json" : "text/html; charset=utf-8" } });
} });
async function at(host, changed) {
  const { accountHost } = await import(`../../../functions/_acctapp.js?${Math.random()}`);
  const env = { ASSETS: store(changed), AUTH_HOST: "auth.inflite.ai" };
  return async (path) => {
    const request = new Request(`https://${host}${path}`);
    const res = await accountHost({ request, env, next: () => new Response("api") }, new URL(request.url));
    return { res, text: await res.text() };
  };
}

test("the sign-in page asks for signin.js; the account's page for app.js", async () => {
  const auth = await (await at("auth.inflite.ai"))("/"), acct = await (await at("account.inflite.ai"))("/");
  assert.match(auth.text, /src="signin\.js\?v=\w{12}"/);
  assert.doesNotMatch(auth.text, /src="app\.js/);
  assert.match(acct.text, /src="app\.js\?v=\w{12}"/);
  assert.doesNotMatch(acct.text, /signin\.js/);
  const js = await (await at("auth.inflite.ai"))(`/signin.js?v=${/signin\.js\?v=(\w{12})/.exec(auth.text)[1]}`);
  assert.equal(js.res.status, 200);
  assert.ok(js.text.length < full.length * 0.6, "the small copy, sent");
  assert.match(js.res.headers.get("cache-control"), /immutable/, "kept for good under its stamp");
  assert.match(js.text, /\.\/crypto\.js\?v=\w{12}/, "its crypto.js stamped");
});

test("auth starts in the shared frame and fingerprints its presentation module", async () => {
  const auth = await (await at("auth.inflite.ai"))("/");
  assert.match(auth.text, /data-auth-loading/);
  assert.match(auth.text, /<main id="main" class="signin-main" aria-busy="true"/);
  assert.doesNotMatch(auth.text, /class="sk sk-hero"/);
  const file = await (await at("auth.inflite.ai"))("/signin.js");
  assert.match(file.text, /\.\/auth-frame\.js\?v=\w{12}/);
  assert.match(auth.res.headers.get("content-security-policy"), /style-src 'self'/);
  assert.doesNotMatch(auth.res.headers.get("content-security-policy"), /unsafe-inline/);
  const account = await (await at("account.inflite.ai"))("/");
  assert.doesNotMatch(account.text, /data-auth-loading/);
  assert.match(account.text, /class="sk sk-hero"/);
});

test("out of date (account/app.js changed since): app.js itself, never an old copy", async () => {
  const app = readFileSync(ROOT + "account/app.js", "utf8") + "\n// changed\n";
  const r = await minAssets({ ASSETS: store({ "/account/app.js": app }) }).fetch(new Request("https://auth.inflite.ai/account/signin.js"));
  assert.equal(r.status, 200);
  assert.ok((await r.text()).endsWith("// changed\n"), "the account's script as it is");
  const fresh = await minAssets({ ASSETS: store() }).fetch(new Request("https://auth.inflite.ai/account/signin.js"));
  assert.equal(await fresh.text(), page, "current: the small copy");
});
