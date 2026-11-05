// The GitHub Action's filer (.tools/bugs/file.mjs), against stand-ins for the site and GitHub's API: the new reports, one
// issue for each code, a comment (and reopened) for one already filed, never a sender's note in the public issue, and
// each report marked filed with its issue's number.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";

const serve = (fn) => new Promise((ok) => { const s = createServer(async (req, res) => { let b = ""; for await (const c of req) b += c; const [st, out] = await fn(req, b); res.writeHead(st, { "Content-Type": "application/json" }); res.end(JSON.stringify(out)); }); s.listen(0, "127.0.0.1", () => ok(s)); });

test("files each code once, comments on one filed before, keeps the notes out", async () => {
  const bugs = [
    { id: "A1", code: "IF-C-AAAAA", app: "chat", kind: "crash", at: 1793860000000, version: "1.79", words: "TypeError: x", at_where: "/pigeon/app.js:3", path: "/chats/", device: "iPhone · Safari 18", note: "my private words", stack: "/pigeon/app.js:3" },
    { id: "A2", code: "IF-C-AAAAA", app: "chat", kind: "crash", at: 1793860060000, version: "1.79", words: "TypeError: x", at_where: "/pigeon/app.js:3", path: "/chats/", device: "Mac · Chrome 130" },
    { id: "B1", code: "IF-S-BBBBB", app: "server", kind: "pigeon api", at: 1793860100000, words: "D1_ERROR: boom", at_where: "pigeon api" },
  ];
  const filed = [], gh = [];
  const site = await serve((req, b) => {
    if (req.headers.authorization !== "Bearer k") return [401, {}];
    if (req.url === "/api/bugs/pending") return [200, { bugs }];
    if (req.url === "/api/bugs/filed") { filed.push(JSON.parse(b)); return [200, { ok: true }]; }
    return [404, {}];
  });
  const api = await serve((req, b) => {
    gh.push({ m: req.method, u: req.url, b: b ? JSON.parse(b) : null });
    if (req.method === "GET" && req.url.startsWith("/repos/o/r/issues?")) return [200, [{ number: 7, state: "closed", title: "[IF-S-BBBBB] Server: D1_ERROR: boom" }]];
    if (req.method === "POST" && req.url === "/repos/o/r/issues") return [201, { number: 12 }];
    return [201, {}];
  });
  const port = (s) => s.address().port;
  await new Promise((ok, no) => execFile(process.execPath, [new URL("../../bugs/file.mjs", import.meta.url).pathname], { env: { ...process.env, SITE: `http://127.0.0.1:${port(site)}`, TICK_SECRET: "k", GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r", GITHUB_API: `http://127.0.0.1:${port(api)}` } }, (e, out, err) => (e ? no(new Error(err || out)) : ok(out))));
  site.close(); api.close();
  const made = gh.filter((x) => x.m === "POST" && x.u === "/repos/o/r/issues");
  assert.equal(made.length, 1, "one new issue, for the new code");
  assert.match(made[0].b.title, /^\[IF-C-AAAAA\] Chat: TypeError: x/);
  assert.match(made[0].b.body, /seen 2 times/); assert.match(made[0].b.body, /1 with a note/);
  assert.ok(!JSON.stringify(gh).includes("my private words"), "the note never in the public issue");
  assert.ok(gh.some((x) => x.m === "PATCH" && x.u === "/repos/o/r/issues/7" && x.b.state === "open"), "the closed one reopened");
  assert.ok(gh.some((x) => x.m === "POST" && x.u === "/repos/o/r/issues/7/comments" && /Seen again after it was closed/.test(x.b.body)), "and commented on");
  assert.deepEqual(filed.map((f) => [f.ids.sort().join(","), f.issue]).sort(), [["A1,A2", 12], ["B1", 7]]);
});
