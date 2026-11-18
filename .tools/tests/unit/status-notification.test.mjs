import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("a status push opens its own incident and preserves other InFlite windows", async () => {
  const handlers = {}, actions = [];
  let windows = [];
  const worker = {
    registration: { scope: "https://inflite.ai/status/" },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    clients: {
      matchAll: async () => windows,
      openWindow: async href => actions.push(["open", href]),
    },
  };
  const client = url => ({
    url, frameType: "top-level",
    focus: async () => actions.push(["focus",url]),
    navigate: async href => actions.push(["navigate",href]),
  });
  runInNewContext(readFileSync(new URL("../../../status/sw.js", import.meta.url), "utf8"), {self:worker, URL});
  const click = url => new Promise((resolve,reject) => handlers.notificationclick({
    notification: { close() {}, data:{url} }, waitUntil: work => work.then(resolve,reject),
  }));
  windows = [client("https://inflite.ai/mail/")];
  await click("https://inflite.ai/status/#incident");
  assert.deepEqual(actions.splice(0), [["open","https://inflite.ai/status/#incident"]]);
  windows.push(client("https://inflite.ai/status/"));
  await click("https://inflite.ai/status/#incident");
  assert.deepEqual(actions.splice(0), [["focus","https://inflite.ai/status/"],["navigate","https://inflite.ai/status/#incident"]]);
  worker.registration.scope = "https://status.inflite.ai/";
  await click("https://inflite.ai/status/#incident");
  assert.deepEqual(actions,[["open","https://status.inflite.ai/#incident"]]);
});
