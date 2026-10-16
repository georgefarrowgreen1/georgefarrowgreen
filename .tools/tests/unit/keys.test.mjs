// Public keys: a real point on P-256, not just the right shape (functions/_pigeon.js cleanPub)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPub } from "../../../functions/_pigeon.js";

test("a real key is kept, as just its four parts", async () => {
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const j = await crypto.subtle.exportKey("jwk", k.publicKey);
  assert.deepEqual(JSON.parse(await cleanPub({ ...j, extra: "dropped" })), { kty: "EC", crv: "P-256", x: j.x, y: j.y });
});
test("a made-up point of the right shape is refused", async () => {
  await assert.rejects(cleanPub({ kty: "EC", crv: "P-256", x: "A".repeat(43), y: "B".repeat(43) }), /isn’t valid/);
});
test("the wrong shape is refused", async () => {
  for (const p of [null, {}, { kty: "EC", crv: "P-384", x: "A".repeat(43), y: "B".repeat(43) }, { kty: "EC", crv: "P-256", x: "short", y: "B".repeat(43) }])
    await assert.rejects(cleanPub(p), /isn’t valid/);
});
