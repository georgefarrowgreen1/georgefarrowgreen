// Real identity middleware/API and SQLite session store behind the canonical proxy.
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { onRequest as middleware } from '../../../functions/_middleware.js';
import { onRequest as accountAPI } from '../../../functions/api/account/[[path]].js';
import { IFL, MAIN } from '../unit/fixtures/roof.mjs';
function d1() {
  const s = new DatabaseSync(":memory:");
  const val = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  const exec = (sql, args) => {
    const p = s.prepare(sql);
    if (p.columns().length) return { results: p.all(...val(args)), success: true, meta: { changes: 0 } };
    const r = p.run(...val(args));
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const st = (sql, args = []) => ({
    sql, args, bind: (...a) => st(sql, a),
    first: async (col) => { const row = s.prepare(sql).get(...val(args)) ?? null; return col && row ? row[col] ?? null : row; },
    all: async () => exec(sql, args), run: async () => exec(sql, args),
    raw: async () => s.prepare(sql).all(...val(args)).map((r) => Object.values(r)),
    now: () => exec(sql, args),
  });
  return { sql: s, prepare: (q) => st(q),
    async batch(list) { s.exec("BEGIN"); try { const r = list.map((x) => x.now()); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; } } };
}
let sharedDB;
export async function createIdentityBackend() {
  if (!IFL) throw new Error('Companion InFlite repository is required.');
  const { identity } = await import(new URL('today/src/identity.js', IFL));
  const DB = sharedDB ||= d1(), pending = [];
  const env = { DB, HUB_KEY: 'identity-test-secret', PIGEON_OPEN_SIGNUP: '1',
    ASSETS: { async fetch(request) {
      let path = new URL(request.url).pathname;
      if (path.endsWith('/')) path += 'index.html';
      if (path.includes('..')) return new Response('Missing', { status:404 });
      try {
        const bytes = await readFile(new URL('.' + path, MAIN));
        const ext = path.split('.').at(-1), type = ({js:'application/javascript',css:'text/css',html:'text/html',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',webmanifest:'application/manifest+json'})[ext] || 'application/octet-stream';
        return new Response(bytes, { headers: { 'Content-Type':type } });
      } catch { return new Response('Missing', {status:404}); }
    }} };
  const dispatch = request => middleware({ request, env, waitUntil(promise) { pending.push(Promise.resolve(promise).catch(()=>{})); }, next(input) {
    const req = input || request, u = new URL(req.url), path = u.pathname.slice('/api/account/'.length).split('/');
    return accountAPI({ request:req, env, params:{path}, waitUntil(promise){pending.push(Promise.resolve(promise).catch(()=>{}));} });
  } });
  const proxyEnv = { HUB_KEY:env.HUB_KEY, APPS:{ fetch:dispatch } };
  return { env, dispatch, request: request => identity(request, proxyEnv), async close(){await Promise.allSettled(pending);} };
}
