import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdentityBackend } from "../fixtures/identity-backend.mjs";
import { IFL, roofSkip } from "./fixtures/roof.mjs";
import { listMessages } from "../../../functions/_messages.js";

test("public contact delivers only to the local admin inbox and reports unsuccessful submissions", { skip: roofSkip }, async () => {
  const { default: shell } = await import(new URL("today/src/index.js", IFL));
  const backend = await createIdentityBackend();
  const input = { name: "Fixture Sender", email: "sender@example.test", message: "Support fixture", website: "" };
  const url = "https://inflite.ai/api/contact";
  const submit = (data = input, override = {}, env = bindings) => shell.fetch(new Request(url, {
    method: "POST", body: JSON.stringify(data), headers: { Origin: "https://inflite.ai", "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.8", "X-Hub-IP": "203.0.113.18", Cookie: "fixture=private", Authorization: "fixture", "X-Inflite-Owner": "ignored", ...override },
  }), env, {});
  const bindings = { HUB_KEY: backend.env.HUB_KEY, APPS: { async fetch(request) {
    assert.equal(request.url, "https://account.inflite.ai/api/inflite-contact");
    assert.equal(request.headers.get("X-Hub-IP"), "192.0.2.8");
    for (const name of ["Cookie", "Authorization", "X-Inflite-Owner"]) assert.equal(request.headers.get(name), null);
    return backend.dispatch(request);
  } } };
  try {
    const accepted = await submit();
    assert.equal(accepted.status, 201);
    assert.deepEqual(await accepted.json(), { ok: true });
    const messages = await listMessages(backend.env);
    assert.equal(messages.length, 1);
    assert.deepEqual([messages[0].name, messages[0].email, messages[0].body, messages[0].read_at], [input.name, input.email, input.message, null]);
    assert.equal(typeof messages[0].created_at, "number");

    assert.equal((await submit({ ...input, message: "" })).status, 400);
    assert.equal((await submit({ ...input, website: "filled" })).status, 400);
    assert.equal((await submit({ ...input, message: "m".repeat(26000) })).status, 413);
    assert.equal((await submit(input, { Origin: "https://elsewhere.example" })).status, 403);
    assert.equal((await submit(input, { "Content-Type": "text/plain" })).status, 415);
    const counters = backend.env.DB.sql.prepare("SELECT key FROM pg_limits WHERE key LIKE 'ifl-contact:%'").all();
    assert.equal(counters.length, 3);
    assert.ok(counters.every(row => !row.key.includes("192.0.2.8")));
    backend.env.DB.sql.exec("UPDATE pg_limits SET count=5 WHERE key LIKE 'ifl-contact:hour:%'");
    assert.equal((await submit()).status, 429);
    assert.equal((await listMessages(backend.env)).length, 1);

    backend.env.DB.sql.exec("UPDATE pg_limits SET count=0 WHERE key LIKE 'ifl-contact:%'");
    backend.env.DB.sql.exec("CREATE TRIGGER contact_unavailable BEFORE INSERT ON messages BEGIN SELECT RAISE(FAIL, 'fixture details'); END;");
    const failedWrite = await submit();
    assert.equal(failedWrite.status, 503);
    assert.doesNotMatch(await failedWrite.text(), /fixture details/);
    assert.equal((await listMessages(backend.env)).length, 1);
    const offline = { HUB_KEY: bindings.HUB_KEY, APPS: { fetch: async () => { throw Error("unavailable"); } } };
    assert.equal((await submit(input, {}, offline)).status, 503);
    const noReceipt = { HUB_KEY: bindings.HUB_KEY, APPS: { fetch: async () => Response.json({ saved: false }, { status: 201 }) } };
    assert.equal((await submit(input, {}, noReceipt)).status, 503);
    assert.equal((await submit(input, {}, {})).status, 503);
    const unauthorised = await backend.dispatch(new Request("https://account.inflite.ai/api/inflite-contact", { method: "POST" }));
    assert.equal(unauthorised.status, 404);
  } finally { await backend.close(); }
});
