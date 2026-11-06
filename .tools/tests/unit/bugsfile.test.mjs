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

// (review: the issue's words are anyone's, and the repository's public: a report could close the code it's in and write
// its own Markdown there, a link, a picture, a mention that notifies someone, a reference to another issue; and a code
// of the sender's choosing could reopen and comment on any issue)
async function run(bugs, issues = []) {
  const gh = [];
  const site = await serve((req) => (req.headers.authorization !== "Bearer k" ? [401, {}] : req.url === "/api/bugs/pending" ? [200, { bugs }] : [200, { ok: true }]));
  const api = await serve((req, b) => {
    gh.push({ m: req.method, u: req.url, b: b ? JSON.parse(b) : null });
    if (req.method === "GET" && req.url.startsWith("/repos/o/r/issues?")) return [200, issues];
    if (req.method === "POST" && req.url === "/repos/o/r/issues") return [201, { number: 30 + gh.length }];
    return [201, {}];
  });
  const port = (s) => s.address().port;
  await new Promise((ok, no) => execFile(process.execPath, [new URL("../../bugs/file.mjs", import.meta.url).pathname], { env: { ...process.env, SITE: `http://127.0.0.1:${port(site)}`, TICK_SECRET: "k", GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "o/r", GITHUB_API: `http://127.0.0.1:${port(api)}` } }, (e, out, err) => (e ? no(new Error(err || out)) : ok(out))));
  site.close(); api.close();
  return gh;
}

test("a report's words can't write the issue: no link, picture, heading, mention or reference, nor out of their code, table or fence", async () => {
  const evil = "@octocat #1 other/repo#2 GH-3 x` [click](https://evil.example) ![p](https://evil.example/p.png) <img src=x onerror=alert(1)> **bold** ``";
  const bugs = [
    { id: "E1", code: "IF-C-EEEEE", app: "chat", kind: "crash", at: 1793860000000, version: "1.79 | <b>hi</b> @admin", words: evil, at_where: "/x.js:1` @octocat [a](https://evil.example)", path: "/p`)](https://evil.example) | x", device: "@octocat #4 | ![i](https://evil.example/i)", stack: "at a\n```\n# Heading @octocat [a](https://evil.example)\n````\n</details><img src=x>" },
    // (reported by hand, under the code of one filed before: a new issue, never a comment on that one or it reopened)
    { id: "M1", code: "IF-C-R1234", app: "chat", kind: "manual", at: 1793860100000, version: "1.79", path: "/chats/", device: "Mac" },
  ];
  const gh = await run(bugs, [{ number: 7, state: "closed", title: "[IF-C-R1234] Chat: a problem reported by hand" }]);
  const made = gh.filter((x) => x.m === "POST" && x.u === "/repos/o/r/issues");
  assert.equal(made.length, 2, "two new issues");
  assert.ok(!gh.some((x) => x.u.startsWith("/repos/o/r/issues/7")), "the one filed before: neither reopened nor commented on");
  const crash = made.find((x) => x.b.title.startsWith("[IF-C-EEEEE]")), body = crash.b.body;
  // (no mention or reference left whole, in the title or the body)
  // (outside code, where GitHub reads neither: in the title, the table)
  const outside = [crash.b.title, body.split("\n").filter((l) => !/^\*\*(What|Where):\*\* /.test(l)).join("\n").replace(/<summary>Stack[\s\S]*$/, "")];
  for (const t of outside) assert.ok(!/@[A-Za-z]/.test(t) && !/#\d/.test(t) && !/GH-\d/i.test(t), `never @name, #N, repo#N or GH-N whole: ${t}`);
  assert.match(crash.b.title, /@\u200boctocat #\u200b1 other\/repo#\u200b2 GH\u200b-3/, "the words still there to read");
  // (the What and Where lines: each one code span, its fence longer than any run of backticks inside)
  for (const label of ["What", "Where"]) {
    const l = body.split("\n").find((x) => x.startsWith(`**${label}:** `)).slice(label.length + 6);
    const f = /^`+/.exec(l)[0];
    assert.ok(l.endsWith(" " + f) && !l.slice(f.length, -f.length).includes(f) && f.length > Math.max(...(l.slice(f.length, -f.length).match(/`+/g) || [""]).map((m) => m.length)), `${label}: one code span it can't close (${l})`);
  }
  // (the table: each row its six cells, whatever was in them; nothing in a cell Markdown would read as a link or a tag)
  const rows = body.split("\n").filter((l) => l.startsWith("| 20"));
  for (const r of rows) {
    assert.equal(r.split(/(?<!\\)\|/).length, 8, `six cells: ${r}`);
    assert.ok(!/(?<!\\)[[<`!]/.test(r), `nothing unescaped that opens a link, a picture, a tag or code: ${r}`);
  }
  // (the stack: in a fence longer than any run of backticks in it, which closes only after it)
  const st = /<summary>Stack<\/summary>\n\n(`{3,})\n([\s\S]*?)\n\1\n<\/details>/.exec(body);
  assert.ok(st, "the stack in its fence"); assert.ok(st[1].length > 4, "longer than the ```` inside");
  assert.ok(st[2].includes("# Heading") && !st[2].includes(st[1]), "all of it inside, as it was");
});
