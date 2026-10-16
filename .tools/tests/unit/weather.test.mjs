// The weather a flight names fits what it did: never "delayed 10h · a tailwind" (functions/_pigeon.js wxOf)
import { test } from "node:test";
import assert from "node:assert/strict";
import { wxOf } from "../../../functions/_pigeon.js";

const H = 3600e3, tail = { f: 1.6, wx: { k: "tailwind", lat: -20, lon: 80, at: 0.5 } }, storm = { f: 0.8, wx: { k: "storms", lat: 10, lon: 60, at: 0.5 } };
test("late overall: it names what slowed it, even when a tailwind was stronger", () => {
  const x = wxOf([tail, storm], 10 * H, 12 * H, [[0, 6 * H], [6 * H, 6 * H]]);
  assert.equal(JSON.parse(x.wx).k, "storms"); assert.equal(x.ms, 2 * H);
});
test("early overall: it names the tailwind", () => {
  const x = wxOf([storm, tail], 10 * H, 8 * H, [[0, 4 * H], [4 * H, 4 * H]]);
  assert.equal(JSON.parse(x.wx).k, "tailwind"); assert.equal(x.ms, -2 * H);
});
test("late, and only a tailwind on the way: no weather named (the app says what it can)", () => {
  assert.equal(wxOf([tail], 10 * H, 11 * H).wx, null);
});
