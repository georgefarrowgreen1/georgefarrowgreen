// status.inflite.ai's checks ask each app at an address that answers anyone (functions/_statuslist.js): never one behind
// a sign-in, which answers the checker 401 and reads as an outage (Mail's /api/version did, 5 November). Each probe is
// the app's public /version (the home page: its page), and each app answers /version before it asks who you are: this
// site's apps (functions/_version.js), and, where the inflite repo's beside this one, Today's and Mail's Workers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { STATUS_SERVICES } from "../../../functions/_statuslist.js";

const ROOT = new URL("../../../", import.meta.url).pathname, IFL = new URL("../../../../inflite/", import.meta.url).pathname;
const read = (f) => readFileSync(f, "utf8");

test("every probe is the app's public /version, or the home page itself", () => {
  for (const s of STATUS_SERVICES) {
    const u = new URL(s.probe);
    assert.equal(u.protocol, "https:", s.id);
    assert.equal(u.hostname, s.address, `${s.id}: its own address`);
    assert.ok(s.id === "home" ? u.pathname === "/" : u.pathname === "/version", `${s.id}: ${u.pathname} (never /api/…, which may want a sign-in)`);
  }
});

test("this site's apps answer /version to anyone (each host's own route, before anything else)", () => {
  for (const [f, app] of [["functions/_wxapp.js", "weather"], ["functions/_fitapp.js", "fitness"], ["functions/_mktapp.js", "markets"], ["functions/_acctapp.js", "account"], ["functions/_middleware.js", "chat"]])
    assert.match(read(ROOT + f), new RegExp(`pathname === "/version"\\) return versionResponse\\(ctx, url, "${app}"\\)`), f);
  assert.doesNotMatch(read(ROOT + "functions/_version.js"), /cookieUser|requireUser|signedIn/, "nothing in it asks who you are");
});

test("Today's and Mail's Workers answer /version before their sign-in", { skip: !existsSync(IFL + "email/src/index.js") && "no inflite repo beside" }, () => {
  const mail = read(IFL + "email/src/index.js"), today = read(IFL + "today/src/index.js");
  const m = mail.indexOf('url.pathname === "/version"'), auth = mail.indexOf("accountView(env, request)");
  assert.ok(m > 0 && m < auth, "Mail: /version first");
  assert.ok(today.includes('url.pathname === "/version"'), "Today: /version");
});
