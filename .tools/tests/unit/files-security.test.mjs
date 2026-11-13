// Actual D1 transactions and R2 streams in workerd. The test-only facade seeds
// accounts and controls interleavings; production domain/API code is bundled as-is.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const { build } = require('esbuild');
const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url))), HOST = 'https://account.inflite.ai';
let mf, sequence = 0;

const worker = `
import * as files from './functions/_files.js';
import {FILES_ROUTES} from './functions/_filesapp.js';
import {db,issueSession,hex,sha256} from './functions/_pigeon.js';
import {withSession} from './functions/_account.js';
import {removeAccount} from './functions/_accounts.js';
const json=(value,status=200)=>Response.json(value??null,{status});
const pause=()=>new Promise(r=>setTimeout(r,5));
async function uploading(env,owner,id){for(let n=0;n<100;n++){const row=await env.DB.prepare('SELECT state FROM ifl_files_nodes WHERE user_id=? AND id=?').bind(owner,id).first();if(row?.state==='uploading')return;await pause()}throw Error('upload claim never appeared')}
export default {async fetch(request,env,ctx){try{
const url=new URL(request.url),path=url.pathname;
if(path==='/_seed'){
 const {owner}=await request.json(),D=await db(env),now=Date.now();
 await D.prepare('INSERT INTO pg_users (id,handle,name,email,pub,salt,proof_hash,vault,swift,swift_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(owner,owner,owner,owner+'@example.test','test','test','test','test',1,now,now).run();
 const token=await issueSession(env,owner,new Request(HOST+'/api/account/today/files/list',{headers:{Origin:'https://inflite.ai'}}));
 return withSession(json({owner}),new Request(HOST+'/api/account/today/files/list'),env,hex(await sha256(token)),true);
}
if(path==='/_sql'){const {sql,params=[]}=await request.json();return json(await (await files.filesdb(env)).prepare(sql).bind(...params).all())}
if(path==='/_domain'){const {op,owner,args=[]}=await request.json();if(!['listFiles','getFile','createFolder','reserveUpload','renameFile','moveFile','deleteFile','dropFiles','sweepFileUploads','exportFiles'].includes(op))return json({error:'unknown test operation'},400);return json(await files[op](env,...(op==='sweepFileUploads'?args:[owner,...args])))}
if(path==='/_objects'){const {prefix='',put,binding='files'}=await request.json(),bucket=binding==='native'?env.BIO_R2:env.FILES_R2;if(put)await bucket.put(put.key,put.body);return json((await bucket.list({prefix})).objects.map(o=>({key:o.key,size:o.size})))}
if(path==='/_lost-ack'){
 const {owner,id,content}=await request.json(),queries=new WeakMap();let failedAfterCommit=false;
 // Preserve every real statement and transaction. Only its client acknowledgement
 // is lost, after workerd has already committed the actual ready-state batch.
 const wrap=D=>new Proxy(D,{get(target,key){
  if(key==='prepare')return sql=>{const statement=target.prepare(sql);queries.set(statement,sql);return new Proxy(statement,{get(s,k){if(k==='bind')return(...args)=>{const bound=s.bind(...args);queries.set(bound,sql);return bound};const value=s[k];return typeof value==='function'?value.bind(s):value}})};
  if(key==='withSession')return(...args)=>wrap(target.withSession(...args));
  if(key==='batch')return async statements=>{const finalizing=statements.some(s=>/SET\\s+state\\s*=\\s*'ready'/.test(queries.get(s)||'')),result=await target.batch(statements);if(finalizing&&!failedAfterCommit){failedAfterCommit=true;throw Error('test: committed D1 acknowledgement was lost')}return result};
  const value=target[key];return typeof value==='function'?value.bind(target):value;
 }});
 const result=await files.uploadFile({...env,DB:wrap(env.DB)},owner,id,new Request(HOST+'/api/account/today/files/content?id='+id,{method:'PUT',body:content}));
 return json({failedAfterCommit,result});
}
if(path==='/_stream'){
 const {owner,id,chunks,markDeleting=false,remove=false,cancel=false}=await request.json();let release;
 const gate=new Promise(r=>release=r),controller=new AbortController();
 const stream=new ReadableStream({async start(s){for(let i=0;i<chunks.length;i++){if(i===1)await gate;if(controller.signal.aborted)return;s.enqueue(Uint8Array.from(chunks[i]))}s.close()}});
 const next=new Request(HOST+'/api/account/today/files/content?id='+id,{method:'PUT',body:stream,signal:controller.signal});
 const result=files.uploadFile(env,owner,id,next).then(value=>({ok:true,value}),error=>({ok:false,status:error.status||500,error:error.message}));
 if(markDeleting||remove||cancel){await uploading(env,owner,id);if(markDeleting)await env.DB.prepare('UPDATE pg_users SET delete_at=? WHERE id=?').bind(Date.now(),owner).run();if(remove)await removeAccount(env,owner);if(cancel)controller.abort()}
 release();return json(await result);
}
const key=request.method+' '+path.replace(/^\\/api\\/account\\//,'');
const route=FILES_ROUTES[key];return route?await route({request,env,waitUntil:ctx.waitUntil.bind(ctx)}):json({error:'unknown test route'},404);
}catch(error){return json({error:error.message,status:error.status||500,field:error.field},error.status||500)}}};
`.replaceAll('HOST', JSON.stringify(HOST));

before(async () => {
  const bundled = await build({ stdin: { contents: worker, resolveDir: ROOT, sourcefile: 'files-security-worker.js' }, bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser', legalComments: 'none', logLevel: 'silent' });
  const options = { modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-10-01', d1Databases: ['DB'], r2Buckets: { FILES_R2: 'private-files-test', BIO_R2: 'native-media-test' }, kvNamespaces: ['BIO_KV'] };
  mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
  await mf.ready;
});
after(async () => mf?.dispose());

async function fixture() {
  const owner = 'files_test_' + (++sequence), res = await mf.dispatchFetch(HOST + '/_seed', { method: 'POST', body: JSON.stringify({ owner }) });
  assert.equal(res.status, 200, await res.clone().text());
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return { owner, cookie };
}
async function api(f, method, name, data, { headers = {}, query = '' } = {}) {
  const init = { method, headers: { Origin: 'https://inflite.ai', Cookie: f?.cookie || '', ...(f?.owner ? { 'X-Inflite-Files-Owner': f.owner } : {}), 'Sec-Fetch-Site': 'same-origin', ...headers } };
  if (data !== undefined) { init.body = typeof data === 'string' || data instanceof Uint8Array ? data : JSON.stringify(data); init.headers['Content-Type'] ||= 'application/json'; }
  const res = await mf.dispatchFetch(HOST + '/api/account/today/files/' + name + query, init);
  const text = await res.text(); let value; try { value = JSON.parse(text); } catch { value = text; }
  return { res, status: res.status, value };
}
async function internal(path, body) { const res = await mf.dispatchFetch(HOST + '/_' + path, { method: 'POST', body: JSON.stringify(body) }); return { status: res.status, value: await res.json() }; }
async function sql(statement, params = []) { const r = await internal('sql', { sql: statement, params }); assert.equal(r.status, 200, JSON.stringify(r.value)); return r.value.results; }
const operation = () => 'operation_' + (++sequence).toString(36).padStart(12, '0');
async function folder(f, name, parentId = null, op = operation()) { const r = await api(f, 'POST', 'folders', { name, parentId, operationId: op }); assert.equal(r.status, 201, JSON.stringify(r.value)); return r.value.item; }
async function reserve(f, name, size, { parentId = null, mime = 'text/plain', operationId = operation() } = {}) { const r = await api(f, 'POST', 'uploads', { name, size, mime, parentId, operationId }); assert.equal(r.status, 201, JSON.stringify(r.value)); return r.value.item; }
async function uploaded(f, name = 'file.txt', content = 'hello', options = {}) { const item = await reserve(f, name, new TextEncoder().encode(content).length, options), r = await api(f, 'PUT', 'content', content, { query: '?id=' + item.id, headers: { 'Content-Type': 'application/octet-stream' } }); assert.equal(r.status, 200, JSON.stringify(r.value)); return r.value.item; }
const metadata = value => assert.doesNotMatch(JSON.stringify(value), /storage_key|storageKey|upload_nonce|uploadNonce|operation_id|user_id|files\/files_test_/);

test('real cookie sessions and exact canonical Today origin protect private Files routes', async () => {
  const a = await fixture();
  assert.equal((await api(null, 'GET', 'list')).status, 401);
  for (const Origin of ['https://evil.test', 'https://os.inflite.ai', 'https://inflite.ai.evil.test', '']) assert.equal((await api(a, 'GET', 'list', undefined, { headers: { Origin } })).status, 403);
  assert.equal((await api(a, 'GET', 'list', undefined, { headers: { 'Sec-Fetch-Site': 'same-site' } })).status, 403);
  const good = await api(a, 'GET', 'list'); assert.equal(good.status, 200); assert.deepEqual(good.value.items, []); metadata(good.value);
});

test('a cookie-only account swap rejects the captured owner before reads, writes, input parsing or pace', async () => {
  const a = await fixture(), b = await fixture(), dir = await folder(a, 'Private'), file = await uploaded(a, 'private.txt', 'A-only'), pending = await reserve(a, 'pending.txt', 1);
  const stale = { owner: a.owner, cookie: b.cookie };
  const before = await sql('SELECT * FROM pg_limits WHERE key LIKE ?', ['files:%:' + b.owner]);
  const attempts = [
    ['GET', 'list'], ['GET', 'limits'], ['GET', 'item', undefined, { query: '?id=' + file.id }],
    ['GET', 'content', undefined, { query: '?id=' + file.id }],
    ['POST', 'search', { view: 'search', q: 'private' }],
    ['POST', 'folders', { name: 'A folder must not enter B', operationId: operation() }],
    ['POST', 'uploads', { name: 'A file must not enter B', size: 1, operationId: operation() }],
    ['PUT', 'content', 'A', { query: '?id=' + pending.id, headers: { 'Content-Type': 'application/octet-stream' } }],
    ['PATCH', 'item', { id: file.id, version: file.version, name: 'changed' }],
    ['POST', 'move', { id: file.id, version: file.version, parentId: dir.id }],
    ['DELETE', 'item', undefined, { query: '?id=' + file.id + '&version=' + file.version }],
    ['POST', 'folders', '{invalid JSON'],
  ];
  for (const args of attempts) {
    const denied = await api(stale, ...args); assert.equal(denied.status, 401, args[0] + ' ' + args[1]);
    assert.equal(denied.value.field, 'session'); assert.match(denied.value.error, /account changed/i);
  }
  assert.deepEqual(await sql('SELECT * FROM pg_limits WHERE key LIKE ?', ['files:%:' + b.owner]), before);
  assert.deepEqual(await sql('SELECT id FROM ifl_files_nodes WHERE user_id=?', [b.owner]), []);
  assert.deepEqual(await sql('SELECT user_id FROM ifl_files_accounts WHERE user_id=?', [b.owner]), []);
  for (const expected of [null, '', 'wrong_owner', 'a'.repeat(81), 'bad.owner']) {
    const input = expected === null ? { cookie: b.cookie } : { ...b, owner: expected };
    assert.equal((await api(input, 'GET', 'list')).status, 401);
  }
  const own = await api(b, 'GET', 'list'); assert.equal(own.status, 200); assert.deepEqual(own.value.items, []);
  assert.equal((await folder(b, 'B folder')).name, 'B folder');
  assert.equal((await api(a, 'GET', 'item', undefined, { query: '?id=' + file.id })).value.item.name, 'private.txt');
});

test('native content downloads may omit the owner predicate but remain cookie-owned', async () => {
  const a = await fixture(), b = await fixture(), privateFile = await uploaded(a, 'private.txt', 'A-only'), ownFile = await uploaded(b, 'own.txt', 'B-only');
  const native = { cookie: b.cookie };
  const own = await api(native, 'GET', 'content', undefined, { query: '?id=' + ownFile.id });
  assert.equal(own.status, 200); assert.equal(own.value, 'B-only');
  assert.equal((await api(native, 'GET', 'content', undefined, { query: '?id=' + privateFile.id })).status, 404);
  assert.equal((await api({ ...native, owner: a.owner }, 'GET', 'content', undefined, { query: '?id=' + ownFile.id })).status, 401);
  assert.equal((await api(native, 'GET', 'content', undefined, { query: '?id=' + ownFile.id, headers: { 'X-Inflite-Files-Owner': 'bad.owner' } })).status, 401);
});

test('owner boundaries cover foreign folders, metadata, contents, rename, move and delete', async () => {
  const a = await fixture(), b = await fixture(), mine = await folder(a, 'Private'), other = await folder(b, 'Other'), file = await uploaded(a, 'secret.txt', 'private', { parentId: mine.id });
  for (const name of ['item', 'content']) assert.equal((await api(b, 'GET', name, undefined, { query: '?id=' + file.id })).status, 404);
  assert.equal((await api(b, 'GET', 'list', undefined, { query: '?parentId=' + mine.id })).status, 404);
  assert.equal((await api(b, 'PATCH', 'item', { id: file.id, version: file.version, name: 'stolen' })).status, 404);
  assert.equal((await api(b, 'POST', 'move', { id: file.id, version: file.version, parentId: other.id })).status, 404);
  assert.equal((await api(a, 'POST', 'move', { id: file.id, version: file.version, parentId: other.id })).status, 404);
  assert.equal((await api(b, 'DELETE', 'item', undefined, { query: '?id=' + file.id + '&version=' + file.version })).status, 404);
  assert.equal((await api(b, 'POST', 'uploads', { name: 'bad', size: 1, parentId: mine.id, operationId: operation() })).status, 404);
  const own = await api(a, 'GET', 'list', undefined, { query: '?parentId=' + mine.id }); assert.equal(own.value.items[0].name, 'secret.txt'); metadata(own.value);
});

test('idempotent reservations do not duplicate bytes or nodes and reused actions cannot change payload', async () => {
  const f = await fixture(), op = operation(), body = { name: 'same.txt', size: 7, mime: 'text/plain', operationId: op };
  const pair = await Promise.all([api(f, 'POST', 'uploads', body), api(f, 'POST', 'uploads', body)]);
  assert.deepEqual(pair.map(x => x.status), [201, 201]); assert.equal(pair[0].value.item.id, pair[1].value.item.id);
  const [usage] = await sql('SELECT * FROM ifl_files_accounts WHERE user_id=?', [f.owner]); assert.equal(usage.reserved, 7); assert.equal(usage.nodes, 1);
  assert.equal((await api(f, 'POST', 'uploads', { ...body, size: 8 })).status, 409);
  const list = await api(f, 'GET', 'list'); assert.equal(list.value.items.length, 1); metadata(pair); metadata(list.value);
});

test('operation replay survives rename but cannot resurrect a deleted item or create another reservation', async () => {
  const f = await fixture(), op = operation(), input = { name: 'once.txt', size: 1, mime: 'text/plain', operationId: op };
  const item = (await api(f, 'POST', 'uploads', input)).value.item;
  const kept = await api(f, 'PUT', 'content', 'x', { query: '?id=' + item.id }); assert.equal(kept.status, 200);
  const renamed = await api(f, 'PATCH', 'item', { id: item.id, version: kept.value.item.version, name: 'renamed.txt' }); assert.equal(renamed.status, 200);
  const replay = await api(f, 'POST', 'uploads', input); assert.equal(replay.status, 201); assert.equal(replay.value.item.id, item.id); assert.equal(replay.value.item.name, 'renamed.txt');
  assert.equal((await api(f, 'DELETE', 'item', undefined, { query: '?id=' + item.id + '&version=' + renamed.value.item.version })).status, 200);
  assert.equal((await api(f, 'POST', 'uploads', input)).status, 410);
  const list = await api(f, 'GET', 'list'); assert.equal(list.value.usage.nodes, 0); assert.equal(list.value.usage.used, 0); assert.equal(list.value.usage.reserved, 0);
});

test('a lost D1 acknowledgement after real finalization preserves committed R2 bytes and idempotent upload replay', async () => {
  const f = await fixture(), content = 'Bytes retained after a real commit.', item = await reserve(f, 'committed.txt', new TextEncoder().encode(content).length);
  const uploaded = await internal('lost-ack', { owner: f.owner, id: item.id, content });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.value)); assert.equal(uploaded.value.failedAfterCommit, true, 'the injected failure follows an actual ready-state transaction');
  assert.equal(uploaded.value.result.item.status, 'ready'); assert.equal(uploaded.value.result.item.id, item.id);
  const first = await api(f, 'GET', 'content', undefined, { query: '?id=' + item.id }); assert.equal(first.status, 200); assert.equal(first.value, content);
  const retry = await api(f, 'PUT', 'content', 'a retry must not replace the object', { query: '?id=' + item.id }); assert.equal(retry.status, 200); assert.equal(retry.value.alreadyUploaded, true);
  const repeated = await api(f, 'GET', 'content', undefined, { query: '?id=' + item.id }); assert.equal(repeated.status, 200); assert.equal(repeated.value, content);
  const [usage] = await sql('SELECT * FROM ifl_files_accounts WHERE user_id=?', [f.owner]); assert.equal(usage.used, new TextEncoder().encode(content).length); assert.equal(usage.reserved, 0); assert.equal(usage.nodes, 1);
  assert.equal((await internal('objects', { prefix: 'files/' + f.owner + '/' })).value.length, 1);
});

test('D1 serialization enforces aggregate byte and node quotas under simultaneous reservations', async () => {
  const f = await fixture(); await api(f, 'GET', 'list');
  await sql('UPDATE ifl_files_accounts SET used=?,reserved=0 WHERE user_id=?', [1024 * 1024 * 1024 - 10, f.owner]);
  const pair = await Promise.all(['one', 'two'].map(name => api(f, 'POST', 'uploads', { name, size: 8, operationId: operation() })));
  assert.deepEqual(pair.map(x => x.status).sort(), [201, 413]);
  let [row] = await sql('SELECT * FROM ifl_files_accounts WHERE user_id=?', [f.owner]); assert.equal(row.reserved, 8); assert.equal(row.nodes, 1);
  const g = await fixture(); await api(g, 'GET', 'list'); await sql('UPDATE ifl_files_accounts SET nodes=4999 WHERE user_id=?', [g.owner]);
  const nodes = await Promise.all(['a', 'b'].map(name => api(g, 'POST', 'folders', { name, operationId: operation() })));
  assert.deepEqual(nodes.map(x => x.status).sort(), [201, 413]); [row] = await sql('SELECT * FROM ifl_files_accounts WHERE user_id=?', [g.owner]); assert.equal(row.nodes, 5000);
});

test('concurrent folder moves cannot form a cycle and nested subtrees respect the depth limit', async () => {
  const f = await fixture(), a = await folder(f, 'A'), b = await folder(f, 'B');
  const moves = await Promise.all([api(f, 'POST', 'move', { id: a.id, version: a.version, parentId: b.id }), api(f, 'POST', 'move', { id: b.id, version: b.version, parentId: a.id })]);
  assert.deepEqual(moves.map(x => x.status).sort(), [200, 409]);
  const g = await fixture(); let parent = null;
  for (let n = 1; n <= 16; n++) parent = await folder(g, 'Depth ' + n, parent?.id);
  assert.equal((await api(g, 'POST', 'folders', { name: 'Too deep', parentId: parent.id, operationId: operation() })).status, 409);
  const tree = await folder(g, 'Tree'), branch = await folder(g, 'Branch', tree.id); await folder(g, 'Leaf', branch.id);
  assert.equal((await api(g, 'POST', 'move', { id: tree.id, version: tree.version, parentId: parent.id })).status, 409);
});

test('streams reject oversized, short and cancelled uploads without leaving quota or bytes', async () => {
  for (const [name, size, chunks, cancel, status] of [['large', 2, [[1, 2, 3]], false, 413], ['short', 4, [[1, 2]], false, 400], ['zero-smuggled', 0, [[], [1]], false, 400], ['cancel', 4, [[1], [2, 3, 4]], true, null]]) {
    const f = await fixture(), item = await reserve(f, name, size), r = await internal('stream', { owner: f.owner, id: item.id, chunks, cancel });
    assert.equal(r.status, 200); assert.equal(r.value.ok, false); if (status) assert.equal(r.value.status, status);
    const [usage] = await sql('SELECT * FROM ifl_files_accounts WHERE user_id=?', [f.owner]); assert.equal(usage.reserved, 0, name); assert.equal(usage.used, 0, name); assert.equal(usage.nodes, 0, name);
    assert.deepEqual((await internal('objects', { prefix: 'files/' + f.owner + '/' })).value, []);
  }
});

test('an account marked for deletion during a real upload cannot finalize and releases its reservation', async () => {
  const f = await fixture(), item = await reserve(f, 'late.txt', 4);
  const result = await internal('stream', { owner: f.owner, id: item.id, chunks: [[1], [2, 3, 4]], markDeleting: true });
  assert.equal(result.value.ok, false); assert.equal((await api(f, 'GET', 'list')).status, 401);
  const [usage] = await sql('SELECT * FROM ifl_files_accounts WHERE user_id=?', [f.owner]); assert.equal(usage.used, 0); assert.equal(usage.reserved, 0); assert.equal(usage.nodes, 0);
  assert.deepEqual((await internal('objects', { prefix: 'files/' + f.owner + '/' })).value, []);
});

test('the actual account-removal lifecycle prevents an in-flight object from reappearing after deletion', async () => {
  const f = await fixture(), existing = await uploaded(f, 'existing.txt'), item = await reserve(f, 'in-flight.txt', 4);
  assert.ok(existing.id);
  const result = await internal('stream', { owner: f.owner, id: item.id, chunks: [[1], [2, 3, 4]], remove: true });
  assert.equal(result.status, 200, JSON.stringify(result.value)); assert.equal(result.value.ok, false);
  assert.deepEqual(await sql('SELECT id FROM pg_users WHERE id=?', [f.owner]), []);
  assert.deepEqual(await sql('SELECT id FROM ifl_files_nodes WHERE user_id=?', [f.owner]), []);
  assert.deepEqual(await sql('SELECT user_id FROM ifl_files_accounts WHERE user_id=?', [f.owner]), []);
  assert.deepEqual((await internal('objects', { prefix: 'files/' + f.owner + '/' })).value, []);
  assert.equal((await api(f, 'GET', 'list')).status, 401);
});

test('the deletion hook fences new uploads before the rest of account removal finishes', async () => {
  const f = await fixture(); await uploaded(f, 'before.txt');
  // removeAccount calls this hook before removing sessions/pg_users and performs
  // more awaited work afterward. A concurrent request may already be authenticated.
  const dropped = await internal('domain', { op: 'dropFiles', owner: f.owner }); assert.equal(dropped.status, 200);
  const recreated = await api(f, 'POST', 'uploads', { name: 'after.txt', size: 1, operationId: operation() });
  assert.equal(recreated.status, 401, 'a deletion hook must fence new reservations until pg_users is removed');
  assert.deepEqual((await internal('objects', { prefix: 'files/' + f.owner + '/' })).value, []);
});

test('only empty folders delete, versions fence stale edits, and active content always downloads safely', async () => {
  const f = await fixture(), dir = await folder(f, 'Documents'), item = await uploaded(f, 'résumé.html', '<script>bad()</script>', { mime: 'text/html', parentId: dir.id });
  assert.equal((await api(f, 'DELETE', 'item', undefined, { query: '?id=' + dir.id + '&version=' + dir.version })).status, 409);
  const renamed = await api(f, 'PATCH', 'item', { id: item.id, version: item.version, name: 'renamed.html' }); assert.equal(renamed.status, 200);
  assert.equal((await api(f, 'PATCH', 'item', { id: item.id, version: item.version, name: 'stale.html' })).status, 409);
  const content = await api(f, 'GET', 'content', undefined, { query: '?id=' + item.id }); assert.equal(content.status, 200); assert.equal(content.res.headers.get('Content-Type'), 'application/octet-stream');
  assert.match(content.res.headers.get('Content-Disposition'), /^attachment;/); assert.match(content.res.headers.get('Content-Security-Policy'), /sandbox; default-src 'none'/); assert.equal(content.res.headers.get('X-Content-Type-Options'), 'nosniff'); assert.match(content.res.headers.get('Cache-Control'), /no-store/);
  const range = await api(f, 'GET', 'content', undefined, { query: '?id=' + item.id, headers: { Range: 'bytes=0-2' } }); assert.equal(range.status, 206); assert.equal(range.value, '<sc');
  assert.equal((await api(f, 'DELETE', 'item', undefined, { query: '?id=' + item.id + '&version=' + renamed.value.item.version })).status, 200);
  assert.equal((await api(f, 'DELETE', 'item', undefined, { query: '?id=' + dir.id + '&version=' + dir.version })).status, 200);
  assert.deepEqual((await internal('objects', { prefix: 'files/' + f.owner + '/' })).value, []);
});

test('stale pending uploads and orphan bytes clean up without touching live files or other app prefixes', async () => {
  const f = await fixture(), good = await uploaded(f), stale = await reserve(f, 'stale', 3);
  await sql('UPDATE ifl_files_nodes SET expires=1 WHERE user_id=? AND id=?', [f.owner, stale.id]);
  const orphan = 'files/' + f.owner + '/orphan/object', foreign = 'pigeon/test-other-app';
  await internal('objects', { put: { key: orphan, body: 'orphan' } });
  await internal('objects', { binding: 'native', put: { key: foreign, body: 'keep native media' } });
  await internal('objects', { binding: 'native', put: { key: orphan, body: 'same key in another bucket stays private to that bucket' } });
  const sweep = await internal('domain', { op: 'sweepFileUploads', args: [Date.now() + 2 * 86400e3, 100] }); assert.equal(sweep.status, 200); assert.equal(sweep.value, 1);
  const list = await api(f, 'GET', 'list'); assert.deepEqual(list.value.items.map(x => x.id), [good.id]); assert.equal(list.value.usage.reserved, 0);
  const own = (await internal('objects', { prefix: 'files/' + f.owner + '/' })).value; assert.equal(own.length, 1); assert.notEqual(own[0].key, orphan);
  assert.equal((await internal('objects', { binding: 'native', prefix: foreign })).value.length, 1);
  assert.equal((await internal('objects', { binding: 'native', prefix: orphan })).value.length, 1, 'Drive cleanup cannot touch the native media bucket even for an identical object key');
  const exported = await internal('domain', { op: 'exportFiles', owner: f.owner }); metadata(exported.value); assert.equal(exported.value[0].name, 'file.txt');
});

test('real server sorting traverses more than two pages without gaps or duplicates and fences stale cursors', async () => {
  const f = await fixture(); assert.equal((await api(f, 'GET', 'list')).status, 200);
  // Seed a large metadata fixture with real SQL, including many equal size/time
  // values. Listing, sorting, pagination and mutation use the actual API/queries.
  await sql(`WITH RECURSIVE numbers(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM numbers WHERE n<224)
    INSERT INTO ifl_files_nodes (user_id,id,parent_id,kind,name,name_key,mime,size,state,created,modified,version,operation_id)
    SELECT ?1,printf('%032d',n+1),'',CASE WHEN n%7=0 THEN 'folder' ELSE 'file' END,
      printf('Item %03d',224-n),printf('item %03d',224-n),CASE WHEN n%7=0 THEN 'inode/directory' ELSE 'text/plain' END,
      CASE WHEN n%7=0 THEN 0 ELSE (n%5)*10 END,'ready',100,1000+n%4,1,printf('seed_operation_%032d',n+1) FROM numbers`, [f.owner]);
  await sql('UPDATE ifl_files_accounts SET nodes=225,used=(SELECT SUM(size) FROM ifl_files_nodes WHERE user_id=?1),reserved=0 WHERE user_id=?1', [f.owner]);
  const rows = Array.from({ length: 225 }, (_, n) => ({ id: String(n + 1).padStart(32, '0'), kind: n % 7 === 0 ? 'folder' : 'file', name: 'item ' + String(224 - n).padStart(3, '0'), modified: 1000 + n % 4, size: n % 7 === 0 ? 0 : (n % 5) * 10 }));
  const byText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  let oldCursor;
  for (const sort of ['name', 'modified', 'size']) {
    const actual = [], pages = []; let cursor;
    do {
      const q = new URLSearchParams({ sort }); if (cursor) q.set('cursor', cursor);
      const page = await api(f, 'GET', 'list', undefined, { query: '?' + q }); assert.equal(page.status, 200, JSON.stringify(page.value));
      actual.push(...page.value.items.map(item => item.id)); pages.push(page.value.items.length); metadata(page.value);
      cursor = page.value.cursor; if (!oldCursor && cursor) oldCursor = cursor;
    } while (cursor);
    const expected = [...rows].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1) || (sort === 'name' ? byText(a.name, b.name) : b[sort] - a[sort]) || byText(a.id, b.id)).map(row => row.id);
    assert.deepEqual(pages, [100, 100, 25]); assert.equal(new Set(actual).size, 225); assert.deepEqual(actual, expected, sort + ' must be server-wide with a stable ID tiebreaker');
  }
  const recent = await api(f, 'GET', 'list', undefined, { query: '?view=recent' }); assert.equal(recent.status, 200);
  assert.deepEqual(recent.value.items.map(item => item.id), rows.filter(row => row.kind === 'file').sort((a, b) => b.modified - a.modified || byText(a.id, b.id)).slice(0, 100).map(row => row.id));
  const rename = await api(f, 'PATCH', 'item', { id: rows[0].id, version: 1, name: 'Changed after pagination' }); assert.equal(rename.status, 200);
  assert.equal((await api(f, 'GET', 'list', undefined, { query: '?sort=name&cursor=' + encodeURIComponent(oldCursor) })).status, 409);
  for (const sort of ['descending', 'name DESC; DROP TABLE ifl_files_nodes', '']) {
    const result = await api(f, 'POST', 'search', { view: 'folder', sort }); assert.equal(result.status, 400, sort);
  }
  assert.equal((await sql('SELECT COUNT(*) AS n FROM ifl_files_nodes WHERE user_id=?', [f.owner]))[0].n, 225);
});

test('folder-only destination pages filter before pagination and finish at an exact page boundary', async () => {
  const f = await fixture(); assert.equal((await api(f, 'GET', 'list')).status, 200);
  // Two hundred folders mixed with one hundred files exposes post-pagination
  // filtering: that would incorrectly offer a third, empty destination page.
  await sql(`WITH RECURSIVE numbers(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM numbers WHERE n<299)
    INSERT INTO ifl_files_nodes (user_id,id,parent_id,kind,name,name_key,mime,size,state,created,modified,version,operation_id)
    SELECT ?1,printf('%032d',n+1),'',CASE WHEN n%3=0 THEN 'file' ELSE 'folder' END,
      printf('Destination %03d',299-n),printf('destination %03d',299-n),CASE WHEN n%3=0 THEN 'text/plain' ELSE 'inode/directory' END,
      CASE WHEN n%3=0 THEN 1 ELSE 0 END,'ready',100,100,1,printf('destination_operation_%032d',n+1) FROM numbers`, [f.owner]);
  await sql('UPDATE ifl_files_accounts SET nodes=300,used=100,reserved=0 WHERE user_id=?', [f.owner]);
  const actual = [], lengths = []; let cursor;
  do {
    const q = new URLSearchParams({ kind: 'folder', sort: 'name' }); if (cursor) q.set('cursor', cursor);
    const page = await api(f, 'GET', 'list', undefined, { query: '?' + q }); assert.equal(page.status, 200, JSON.stringify(page.value));
    assert.ok(page.value.items.every(item => item.kind === 'folder')); actual.push(...page.value.items.map(item => item.id)); lengths.push(page.value.items.length); cursor = page.value.cursor;
  } while (cursor);
  const expected = Array.from({ length: 300 }, (_, n) => n).filter(n => n % 3 !== 0).reverse().map(n => String(n + 1).padStart(32, '0'));
  assert.deepEqual(lengths, [100, 100]); assert.equal(new Set(actual).size, 200); assert.deepEqual(actual, expected);
  for (const kind of ['file', 'folder OR 1=1', "folder'; DROP TABLE ifl_files_nodes;--"]) {
    assert.equal((await api(f, 'GET', 'list', undefined, { query: '?kind=' + encodeURIComponent(kind) })).status, 400);
    assert.equal((await api(f, 'POST', 'search', { view: 'search', kind })).status, 400);
  }
  assert.equal((await sql('SELECT COUNT(*) AS n FROM ifl_files_nodes WHERE user_id=?', [f.owner]))[0].n, 300);
});

test('folder search stays local while full-drive search includes ready nested folders/files and stable name ties', async () => {
  const f = await fixture(), foreign = await fixture(), projects = await folder(f, 'Projects'), archive = await folder(f, 'Needle Archive'), nested = await folder(f, 'Needle Nested', projects.id);
  const rootFile = await uploaded(f, 'Needle.txt'), first = await uploaded(f, 'Shared needle.txt', 'a', { parentId: archive.id }), second = await uploaded(f, 'Shared needle.txt', 'b', { parentId: nested.id });
  await reserve(f, 'Needle pending.txt', 1, { parentId: projects.id });
  await folder(foreign, 'Needle foreign'); await uploaded(foreign, 'Needle foreign.txt');
  const local = await api(f, 'POST', 'search', { view: 'folder', q: 'needle', sort: 'name' }); assert.equal(local.status, 200);
  assert.deepEqual(local.value.items.map(item => item.id), [archive.id, rootFile.id]);
  const all = await api(f, 'POST', 'search', { view: 'search', q: 'NeEdLe', sort: 'name' }); assert.equal(all.status, 200);
  assert.deepEqual(all.value.items.map(item => item.id), [archive.id, nested.id, rootFile.id, ...[first.id, second.id].sort()]);
  assert.ok(all.value.items.every(item => item.status === 'ready')); metadata(all.value);
  const recent = await api(f, 'POST', 'search', { view: 'recent', q: 'needle', sort: 'name' }); assert.equal(recent.status, 200);
  assert.deepEqual(recent.value.items.map(item => item.id), [rootFile.id, ...[first.id, second.id].sort()]);
  const nestedOnly = await api(f, 'POST', 'search', { view: 'folder', parentId: projects.id, q: 'needle', sort: 'name' }); assert.equal(nestedOnly.status, 200);
  assert.deepEqual(nestedOnly.value.items.map(item => item.name), ['Needle Nested', 'Needle pending.txt']);
});

test('download rejects mismatched R2 object lengths for full and ranged responses without destroying metadata', async () => {
  const f = await fixture(), item = await uploaded(f, 'sized.txt', 'abcd');
  const [row] = await sql('SELECT storage_key FROM ifl_files_nodes WHERE user_id=? AND id=?', [f.owner, item.id]);
  await internal('objects', { put: { key: row.storage_key, body: 'wrong length' } });
  assert.equal((await api(f, 'GET', 'content', undefined, { query: '?id=' + item.id })).status, 503);
  assert.equal((await api(f, 'GET', 'content', undefined, { query: '?id=' + item.id, headers: { Range: 'bytes=0-1' } })).status, 503);
  assert.equal((await api(f, 'GET', 'item', undefined, { query: '?id=' + item.id })).value.item.size, 4);
  await internal('objects', { put: { key: row.storage_key, body: 'abcd' } });
  const restored = await api(f, 'GET', 'content', undefined, { query: '?id=' + item.id, headers: { Range: 'bytes=1-2' } }); assert.equal(restored.status, 206); assert.equal(restored.value, 'bc');
});

test('malformed names, oversized reservations and foreign references never become storage paths', async () => {
  const f = await fixture();
  for (const name of ['', '.', '..', 'a/b', 'a\\b', 'bad\r\nname', 'bad\u202ename', 'a'.repeat(256)]) assert.equal((await api(f, 'POST', 'folders', { name, operationId: operation() })).status, 400);
  assert.equal((await api(f, 'POST', 'uploads', { name: 'large', size: 25 * 1024 * 1024 + 1, operationId: operation() })).status, 413);
  assert.equal((await api(f, 'GET', 'item', undefined, { query: '?id=../secret' })).status, 400);
  assert.deepEqual((await api(f, 'GET', 'list')).value.items, []);
});
