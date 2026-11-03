// Every column that ties a row to a sign-in is in one list (functions/_sessions.js SESSION_COLUMNS), so Chat's
// hand-back moves them all when it moves a sign-in into its own (spec §11.3): each CREATE TABLE and ALTER TABLE … ADD
// COLUMN written in the server's code (functions/, the minified copies left out) that makes a column named session or
// sess is checked against the list, and every table the list names is one the code makes with that column. Then, on a
// real database (node:sqlite, made to look like D1), repointSession hands back statements without running any; run in
// the caller's batch, they move exactly the rows that pointed at the old sign-in, in every listed table that's there,
// and leave out the tables not made yet and those made before their column was added.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SESSION_COLUMNS, repointSession } from "../../../functions/_sessions.js";

const FUNCTIONS = new URL("../../../functions/", import.meta.url);
const SESSIONISH = /^(session|sess)$/i;

// every .js under functions/ (not the minified copies)
function filesUnder(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = new URL(f, dir);
    if (statSync(p).isDirectory()) out.push(...filesUnder(new URL(f + "/", dir)));
    else if (f.endsWith(".js") && !f.startsWith("_min")) out.push(p);
  }
  return out;
}
// a CREATE TABLE's columns, from the text between its brackets (comments out, split at the top level's commas)
function columnsOf(body) {
  const parts = [];
  let depth = 0, cur = "";
  for (const c of body.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim().split(/\s+/)[0].replace(/^["`[]|["`\]]$/g, "")).filter((c) => c && !/^(PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)$/i.test(c));
}
// [{ file, table, column }] for every column each file's statements make (a table named by a ${…} is null: unknown)
function columnsMade() {
  const found = [];
  for (const url of filesUnder(FUNCTIONS)) {
    const file = url.pathname.slice(FUNCTIONS.pathname.length), s = readFileSync(url, "utf8");
    const create = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?([A-Za-z_]\w*)["`]?|\$\{[^}]*\})\s*\(/gi;
    for (let m; (m = create.exec(s));) {
      let i = m.index + m[0].length, depth = 1;
      while (i < s.length && depth) { if (s[i] === "(") depth++; else if (s[i] === ")") depth--; i++; }
      for (const column of columnsOf(s.slice(m.index + m[0].length, i - 1))) found.push({ file, table: m[1] || null, column });
    }
    const alter = /ALTER\s+TABLE\s+(?:["`]?([A-Za-z_]\w*)["`]?|\$\{[^}]*\})\s+ADD\s+(?:COLUMN\s+)?["`]?([A-Za-z_]\w*)/gi;
    for (let m; (m = alter.exec(s));) found.push({ file, table: m[1] || null, column: m[2] });
  }
  return found;
}

test("every session or sess column the server's code makes is in SESSION_COLUMNS, and every one listed is made", () => {
  const made = columnsMade();
  assert.ok(made.length > 100, `the scan found the schema (${made.length} columns)`);
  const sessionish = made.filter((x) => SESSIONISH.test(x.column));
  const missing = sessionish.filter((x) => x.table === null || SESSION_COLUMNS[x.table] !== x.column)
    .map((x) => `${x.file}: ${x.table ?? "a table named by ${…}"}.${x.column}`);
  assert.deepEqual(missing, [], "a column tying rows to a sign-in that Chat's hand-back wouldn't move (add it to SESSION_COLUMNS)");
  for (const [table, column] of Object.entries(SESSION_COLUMNS))
    assert.ok(sessionish.some((x) => x.table === table && x.column === column), `${table}.${column} is made somewhere in functions/`);
});

test("the scan reads a CREATE TABLE across lines, with comments, and an ALTER TABLE, as the server writes them", () => {
  assert.deepEqual(columnsOf(`a TEXT NOT NULL /* x, y */, session TEXT,
    b INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (a, b), UNIQUE (a, session)`), ["a", "session", "b"]);
  assert.ok(columnsMade().some((x) => x.table === "td_push" && x.column === "session"), "td_push's, over two lines");
  assert.ok(columnsMade().some((x) => x.table === "wx_devs" && x.column === "sess"), "wx_devs', added later");
});

// ---- on a real database ----
const sql = new DatabaseSync(":memory:");
const val = (a) => a.map((x) => (typeof x === "boolean" ? +x : x === undefined ? null : x));
const ran = [];
const st = (q, a = []) => ({ sql: q, bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)), meta: {} }),
  run: async () => { ran.push(q); return { meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }; } });
// (D1's batch: one transaction, each statement answered with its rows and its changes)
const D = { prepare: (q) => st(q),
  batch: async (list) => { sql.exec("BEGIN"); try { const out = []; for (const s of list) out.push(/^\s*(INSERT|UPDATE|DELETE)/i.test(s.sql) ? await s.run() : await s.all()); sql.exec("COMMIT"); return out; } catch (e) { sql.exec("ROLLBACK"); throw e; } } };

test("repointSession: statements for the tables there with their column, none run until the caller's batch, then exactly those rows moved", async () => {
  sql.exec(`CREATE TABLE pg_sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE pg_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, session TEXT NOT NULL);
    CREATE TABLE td_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, session TEXT);
    CREATE TABLE pg_handback (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, session TEXT NOT NULL);
    CREATE TABLE wx_devs (dev TEXT PRIMARY KEY, user_id TEXT, sess TEXT);
    CREATE TABLE mk_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE fx_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    INSERT INTO pg_sessions VALUES ('old', 'ann'), ('new', 'ann'), ('bos', 'bo');
    INSERT INTO pg_push VALUES ('p1', 'ann', 'old'), ('p2', 'ann', 'other'), ('p3', 'bo', 'bos');
    INSERT INTO td_push VALUES ('t1', 'ann', 'old'), ('t2', 'ann', 'old'), ('t3', 'ann', NULL);
    INSERT INTO pg_handback VALUES ('h1', 'ann', 'old');
    INSERT INTO wx_devs VALUES ('w1', 'ann', 'old'), ('w2', NULL, 'bos');
    INSERT INTO mk_push VALUES ('m1', 'ann');`);
  const before = ran.length, snapshot = () => sql.prepare("SELECT 'pg' AS t, endpoint AS k, session AS s FROM pg_push UNION ALL SELECT 'td', endpoint, session FROM td_push UNION ALL SELECT 'hb', hash, session FROM pg_handback UNION ALL SELECT 'wx', dev, sess FROM wx_devs ORDER BY 1, 2").all();
  const was = snapshot();
  const qs = await repointSession(D, "old", "new");
  assert.equal(ran.length, before, "nothing run by repointSession itself");
  assert.deepEqual(snapshot(), was, "and nothing changed yet");
  assert.deepEqual(qs.map((q) => q.sql.match(/^UPDATE (\w+)/)[1]).sort(), ["pg_handback", "pg_push", "td_push", "wx_devs"],
    "every listed table that's there with its column; mk_push and fx_push (made before their column) and the tables not made yet left out");
  for (const q of qs) assert.match(q.sql, /^UPDATE \w+ SET (session|sess) = \? WHERE \1 = \?$/);
  // (in the caller's own batch, with the old sign-in's DELETE: one transaction)
  await D.batch([...qs, D.prepare("DELETE FROM pg_sessions WHERE hash = ?").bind("old")]);
  assert.deepEqual(snapshot().map((r) => `${r.t}:${r.k}:${r.s}`), ["hb:h1:new", "pg:p1:new", "pg:p2:other", "pg:p3:bos", "td:t1:new", "td:t2:new", "td:t3:null", "wx:w1:new", "wx:w2:bos"]);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM pg_sessions WHERE hash = 'old'").get().n, 0);
  // (a column added later is found once it's there)
  sql.exec("ALTER TABLE mk_push ADD COLUMN session TEXT; UPDATE mk_push SET session = 'new'");
  assert.ok((await repointSession(D, "new", "newer")).some((q) => /^UPDATE mk_push SET session/.test(q.sql)), "mk_push, once it has the column");
});

test("repointSession: nothing to move without an old sign-in, or to the same one", async () => {
  for (const [from, to] of [[null, "new"], ["", "new"], ["old", ""], ["old", undefined], ["same", "same"], [1, 2]])
    assert.deepEqual(await repointSession(D, from, to), [], `${from} → ${to}`);
});
