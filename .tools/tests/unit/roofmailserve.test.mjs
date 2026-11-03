// Mail under the roof, the root Worker's side (One roof stage 4, s4/spec §6.2, §2.3; the inflite repo's
// today/src/mailroof.js, asked first by mailhost.js's mailPage, where it's checked out beside this one): /mail/ is the
// framework's page only with Mail's switch on (ROOF_MAIL "1"; not absent, not "0", not with ROOF_OFF "1"), and the framed
// page as before otherwise; /mail/index.html the framework, or not found; Mail's module files passed through from Mail's
// Worker, code only (a script or a stylesheet by its name, nothing else), with no cookie and no header of the browser's
// but Accept and If-None-Match, from the service binding where there is one, else MAIL_VIA, else Mail's address; not
// found while the switch is off; and /mail/version, { build } alone, never kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const SRC = new URL("../../../../inflite/today/src/", import.meta.url);
const missing = !existsSync(new URL("mailroof.js", SRC)) && "the inflite repo beside has no Mail roof (today/src/mailroof.js)";
const roof = missing ? {} : await import(new URL("roof.js", SRC));
const skip = missing || (typeof roof.appsOn !== "function" && "the inflite repo beside predates the per-app switch (today/src/roof.js appsOn)");
const { mailPage } = skip ? {} : await import(new URL("mailhost.js", SRC));

const SITE = "https://inflite.ai", MAIL = "https://email.inflite.ai", VIA = "http://127.0.0.1:8807";
const FRAMEWORK = "<!doctype html><title>InFlite Today</title>";
// (the assets: the framework's page at /, as the Worker's assets binding answers it)
const assets = [];
const ASSETS = { fetch: async (r) => { assets.push(new URL(r.url).pathname); return new Response(FRAMEWORK, { headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"a1"' } }); } };
const env = (x = {}) => ({ ROOF_MAIL: "1", MAIL_ORIGIN: MAIL, AUTH_ORIGIN: "https://auth.inflite.ai", ASSETS, ...x });
// (Mail's Worker, stood in for: every request it's asked, and its answer as say(path) gives it)
let asked = [], say = () => new Response("export const x = 1;", { headers: { "Content-Type": "text/javascript; charset=utf-8", ETag: '"m1"', "Set-Cookie": "account=x; Path=/" } });
const realFetch = globalThis.fetch;
const stand = async (u, o = {}) => { const h = new Headers(o.headers); asked.push({ url: String(u?.url || u), method: o.method || u?.method, headers: Object.fromEntries((u?.headers || h).entries()) }); return say(new URL(String(u?.url || u)).pathname); };
globalThis.fetch = stand;
test.after(() => { globalThis.fetch = realFetch; });
const get = (path, { headers = {}, ...init } = {}, e = env()) => mailPage(new Request(SITE + path, { ...init,
  headers: { "Sec-Fetch-Site": "same-origin", Cookie: "account=secret-token", Accept: "*/*", "Accept-Language": "en-GB", "X-Other": "1", ...headers } }), e);

test("/mail/: the framework's page only with Mail's switch on; the framed page with it absent, \"0\", or everything off", { skip }, async () => {
  assets.length = 0;
  let r = await get("/mail/");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), FRAMEWORK);
  assert.equal(r.headers.get("content-security-policy"), roof.PAGE_HEADERS["Content-Security-Policy"]);
  assert.equal(r.headers.get("etag"), null);
  assert.deepEqual(assets, ["/"]);
  assert.equal((await get("/mail/index.html")).status, 200);
  assert.equal(await (await get("/mail/?demo")).text(), FRAMEWORK, "any query");
  for (const x of [{ ROOF_MAIL: undefined }, { ROOF_MAIL: "0" }, { ROOF_MAIL: "true" }, { ROOF_MAIL: "1", ROOF_OFF: "1" }]) {
    assets.length = 0;
    r = await get("/mail/", {}, env(x));
    assert.equal(r.status, 200, JSON.stringify(x));
    assert.match(r.headers.get("content-security-policy"), new RegExp(`frame-src ${MAIL};`), `${JSON.stringify(x)}: the framed page`);
    assert.match(await r.text(), /<iframe class="mh-frame" name="ifl-mail"/);
    assert.deepEqual(assets, [], "never the framework");
    assert.equal((await get("/mail/index.html", {}, env(x))).status, 404, `${JSON.stringify(x)}: /mail/index.html not found, as before`);
  }
  // (and the rest of /mail/ as it was, either way)
  for (const e of [env(), env({ ROOF_MAIL: undefined })]) {
    assert.equal((await get("/mail?x=1", {}, e)).headers.get("location"), "/mail/?x=1");
    assert.equal((await get("/mail/host.css", {}, e)).status, 200);
    assert.equal((await get("/mail/x", {}, e)).status, 404);
  }
  // (Weather's switch has nothing to do with Mail's)
  assert.equal(await (await get("/mail/", {}, env({ ROOF_OFF_WEATHER: "1" }))).text(), FRAMEWORK);
  assert.equal(roof.roofOn(env(), "weather"), true);
});

test("/mail/roof/<file>: Mail's own file, code only, with nothing of the browser's but Accept and If-None-Match", { skip }, async () => {
  asked = [];
  const r = await get("/mail/roof/mail.js", { headers: { Accept: "*/*", "If-None-Match": '"m0"', Authorization: "Bearer x" } });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "export const x = 1;");
  assert.equal(r.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(r.headers.get("cache-control"), "no-cache");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("etag"), '"m1"');
  assert.equal(r.headers.get("set-cookie"), null, "nothing of Mail's set here");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, `${MAIL}/roof/mail.js`);
  assert.deepEqual(Object.keys(asked[0].headers).sort(), ["accept", "if-none-match"], "no cookie, no other header");
  // (a stylesheet as a stylesheet)
  say = () => new Response("a{}", { headers: { "Content-Type": "text/css" } });
  const css = await get("/mail/roof/reader.css");
  assert.equal(css.status, 200);
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
  // (MAIL_VIA where the tests set one; the service binding, where wrangler.toml has one, before either)
  asked = [];
  await get("/mail/roof/mail.css", {}, env({ MAIL_VIA: VIA }));
  assert.equal(asked[0].url, `${VIA}/roof/mail.css`);
  asked = [];
  const bound = [];
  await get("/mail/roof/mail.css", {}, env({ MAIL_VIA: VIA, MAIL: { fetch: (req) => { bound.push(req.url); assert.equal(req.headers.get("cookie"), null); return say(); } } }));
  assert.deepEqual(bound, [`${MAIL}/roof/mail.css`]);
  assert.deepEqual(asked, [], "the binding, not the network");
  // (HEAD: no body)
  say = () => new Response("export {}", { headers: { "Content-Type": "text/javascript" } });
  const head = await get("/mail/roof/mail.js", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("only code comes back: anything but a 200 script or stylesheet (by its name) is refused, a 304 kept a 304, a 404 a 404", { skip }, async () => {
  const cases = [
    [() => new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }), "/mail/roof/mail.js", 502],
    [() => new Response("a{}", { headers: { "Content-Type": "text/css" } }), "/mail/roof/mail.js", 502],
    [() => new Response("x", { headers: { "Content-Type": "text/javascript" } }), "/mail/roof/mail.css", 502],
    [() => new Response("x", { headers: { "Content-Type": "application/octet-stream" } }), "/mail/roof/mail.js", 502],
    [() => new Response("x", { status: 500, headers: { "Content-Type": "text/javascript" } }), "/mail/roof/mail.js", 502],
    [() => new Response(null, { status: 302, headers: { Location: "https://evil.test/x.js" } }), "/mail/roof/mail.js", 502],
    [() => new Response("no", { status: 404 }), "/mail/roof/gone.js", 404],
    [() => { throw new Error("down"); }, "/mail/roof/mail.js", 502],
  ];
  for (const [s, path, want] of cases) {
    say = s;
    const r = await get(path);
    assert.equal(r.status, want, `${path}: ${String(s)}`);
    if (want !== 200) assert.doesNotMatch(await r.text(), /doctype|javascript|a\{\}/);
  }
  say = () => new Response(null, { status: 304, headers: { ETag: '"m1"' } });
  const r = await get("/mail/roof/mail.js", { headers: { "If-None-Match": '"m1"' } });
  assert.equal(r.status, 304);
  assert.equal(r.headers.get("etag"), '"m1"');
  // (names that aren't one file's: not found, and Mail never asked)
  asked = [];
  for (const p of ["/mail/roof/", "/mail/roof/a/b.js", "/mail/roof/x.json", "/mail/roof/.hidden.js", "/mail/roof/x.js/", "/mail/roof/%2e%2e%2fapp.js", "/mail/roof/x%00.js", `/mail/roof/${"a".repeat(90)}.js`])
    assert.equal((await get(p)).status, 404, p);
  assert.deepEqual(asked, []);
  for (const method of ["POST", "PUT", "DELETE"]) assert.equal((await get("/mail/roof/mail.js", { method, body: method === "DELETE" ? undefined : "x" })).status, 405, method);
  // (no Mail address set: not ready)
  assert.equal((await get("/mail/roof/mail.js", {}, env({ MAIL_ORIGIN: undefined }))).status, 503);
});

test("with the switch off, /mail/roof/* and /mail/version are not found, never kept, and Mail never asked", { skip }, async () => {
  asked = [];
  for (const x of [{ ROOF_MAIL: undefined }, { ROOF_MAIL: "0" }, { ROOF_OFF: "1" }]) for (const p of ["/mail/roof/mail.js", "/mail/roof/x/y", "/mail/version"]) {
    const r = await get(p, {}, env(x));
    assert.equal(r.status, 404, `${JSON.stringify(x)} ${p}`);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(asked, []);
});

test("/mail/version: Mail's { build } through the root Worker, alone and never kept; anything else refused", { skip }, async () => {
  asked = [];
  say = () => Response.json({ build: "1.49", extra: "x" });
  const r = await get("/mail/version");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { build: "1.49" });
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(asked[0].url, `${MAIL}/roof/version`);
  assert.deepEqual(Object.keys(asked[0].headers).sort(), ["accept"]);
  for (const s of [() => Response.json({ build: "<script>" }), () => Response.json({}), () => new Response("1.49"), () => Response.json({ build: "1.49" }, { status: 500 })]) {
    say = s;
    assert.equal((await get("/mail/version")).status, 502, String(s));
  }
  say = () => Response.json({ build: 1.5 });
  assert.deepEqual(await (await get("/mail/version")).json(), { build: 1.5 });
});
