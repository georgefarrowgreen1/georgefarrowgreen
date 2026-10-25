// An open chat asked for again (functions/_pigeon.js chatJson): told only "the same" when the copy the phone has is
// still what the server would send
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatJson } from "../../../functions/_pigeon.js";

const ask = async (out, tag, t = 1000) => (await chatJson(new Request("https://chat.example/api/pigeon/messages?with=x" + (tag ? "&tag=" + tag : "")), t, out)).json();
const chat = { messages: [{ id: "a", readAt: null }], reacts: [], turn: { free: true, state: "sill" } };

test("an answer carries a tag for what it says, the same whenever it's asked", async () => {
  const a = await ask(chat), b = await ask(chat, null, 2000);
  assert.match(a.tag, /^[0-9a-f]{16}$/); assert.equal(a.tag, b.tag);
  assert.deepEqual(a.messages, chat.messages); assert.equal(a.now, 1000); assert.equal(a.same, undefined);
});
test("asked with that tag: just the same, not the chat again", async () => {
  const { tag } = await ask(chat), again = await ask(chat, tag, 3000);
  assert.deepEqual(again, { now: 3000, tag, same: true });
});
test("anything in it changed (a read receipt, say): the whole chat, with a new tag", async () => {
  const { tag } = await ask(chat), read = { ...chat, messages: [{ id: "a", readAt: 5 }] }, again = await ask(read, tag);
  assert.notEqual(again.tag, tag); assert.equal(again.same, undefined); assert.deepEqual(again.messages, read.messages);
});
test("a tag that isn't this chat's: the whole chat", async () => {
  const again = await ask(chat, "0123456789abcdef");
  assert.equal(again.same, undefined); assert.deepEqual(again.messages, chat.messages);
});
