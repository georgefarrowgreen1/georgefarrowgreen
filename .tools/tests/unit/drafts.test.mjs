// Chat's drafts, kept on the phone sealed to yourself (pigeon/app.js draftsSave, with pigeon/crypto.js): they open again
// with your own key, are never kept as words, and can't pass for anything else that's sealed (nor anything for them)
import { test } from "node:test";
import assert from "node:assert/strict";
import { E2E } from "../../../pigeon/crypto.js";

const me = async () => {
  const k = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return E2E.pair(k.privateKey, await crypto.subtle.exportKey("jwk", k.publicKey));
};
const meta = { type: "draft", id: "drafts", from: "u1", to: "u1" };

test("a phone's drafts open again with its own key, and aren't kept as words", async () => {
  const base = await me(), d = [["f1", "Half a thought about Sunday"], ["g1", "See you there"]];
  const ct = await E2E.seal(base, meta, { d });
  assert.ok(!/Sunday|See you/.test(ct), "sealed");
  assert.deepEqual((await E2E.open(base, meta, ct)).d, d);
});

test("drafts can't pass for the keys you've trusted, nor theirs for drafts, nor open with another key", async () => {
  const base = await me(), ct = await E2E.seal(base, meta, { d: [["f1", "Hello"]] });
  await assert.rejects(E2E.open(base, { ...meta, type: "pins", id: "pins" }, ct));
  await assert.rejects(E2E.open(base, meta, await E2E.seal(base, { ...meta, type: "pins", id: "pins" }, { pins: {} })));
  await assert.rejects(E2E.open(await me(), meta, ct));
});
