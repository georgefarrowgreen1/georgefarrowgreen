import test from "node:test";
import assert from "node:assert/strict";
import { prepareAtlasVerifier } from "../../workers/prepare-atlas-verifier.mjs";

const accountId = "a".repeat(32);
function fixture({ build = "2.0.1", runsReady = true, ready = false, accountStatus, existing = [] } = {}) {
  const writes = [], proofs = [], bindings = new Map(existing.map(worker => [worker, "fixture-existing"]));
  const send = async (value, options) => {
    const url = new URL(value), headers = new Headers(options.headers);
    if (url.hostname === "inflite.ai") {
      assert.equal(headers.has("Authorization"), false);
      return Response.json({ build, runsReady });
    }
    if (url.hostname === "account.inflite.ai") {
      assert.equal(url.pathname, "/api/atlas-admin");
      const authorization = headers.get("Authorization"), key = bindings.get("inflite-apps");
      if (authorization) {
        assert.equal(authorization, "Bearer " + key);
        assert.equal(JSON.parse(options.body).owner, "atlas-production-release-probe");
        proofs.push(authorization);
        return Response.json({ allowed: false });
      }
      return Response.json({ allowed: false }, { status: accountStatus ?? (ready ? 403 : 503) });
    }
    assert.equal(url.hostname, "api.cloudflare.com");
    assert.equal(headers.get("Authorization"), "Bearer fixture-token");
    const match = new RegExp("^/client/v4/accounts/" + accountId + "/workers/scripts/(inflite(?:-apps)?)/secrets$").exec(url.pathname);
    assert.ok(match);
    const worker = match[1];
    if (options.method === "PUT") {
      const secret = JSON.parse(options.body);
      assert.equal(secret.name, "ATLAS_VERIFY_KEY");
      assert.equal(secret.type, "secret_text");
      assert.match(secret.text, /^[A-Za-z0-9_-]{43}$/);
      writes.push(worker);
      bindings.set(worker, secret.text);
      return Response.json({ success: true, result: {} });
    }
    assert.equal(options.method, "GET");
    return Response.json({ success: true, result: bindings.has(worker) ? [{ name: "ATLAS_VERIFY_KEY", type: "secret_text" }] : [] });
  };
  return { writes, proofs, bindings, run: () => prepareAtlasVerifier({ release: "2.0.1", token: "fixture-token", accountId, send, wait: async () => {} }) };
}

test("there are no production secret writes while the release is missing or its database is pending", async () => {
  for (const options of [{ build: "1.0.4" }, { runsReady: false }]) {
    const f = fixture(options);
    await assert.rejects(f.run, /release and its run database/);
    assert.deepEqual(f.writes, []);
  }
});

test("the unconfigured verifier receives the same freshly generated key on both production Workers", async () => {
  const f = fixture({ existing: ["inflite"] });
  assert.deepEqual(await f.run(), { created: true });
  assert.deepEqual(f.writes, ["inflite", "inflite-apps"]);
  assert.equal(f.bindings.get("inflite"), f.bindings.get("inflite-apps"));
  assert.equal(f.proofs.length, 1);
});

test("a configured verifier is preserved and an unrelated response cannot authorize provisioning", async () => {
  const f = fixture({ ready: true, existing: ["inflite", "inflite-apps"] });
  assert.deepEqual(await f.run(), { created: false });
  assert.deepEqual(f.writes, []);
  const unsafe = fixture({ accountStatus: 502 });
  await assert.rejects(unsafe.run, /unexpected state/);
  assert.deepEqual(unsafe.writes, []);
});
