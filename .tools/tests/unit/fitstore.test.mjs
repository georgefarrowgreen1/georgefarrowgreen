// Precision Fit Studio's store (functions/_fitstore.js, at fitting.georgefarrowgreen.com/api/fits and api/photos),
// against a real database (node:sqlite, as D1 runs it) and a stand-in for R2: only for someone signed in, a change only
// from the app's own pages; the newer copy of a fit wins; a fit deleted is deleted everywhere, its photos with it, and a
// photo taken out of a fit goes too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const { onRequest } = await import('../../../functions/_middleware.js');
const HOST = 'https://fitting.georgefarrowgreen.com';
const sql = new DatabaseSync(':memory:'), val = (a) => a.map((x) => (x === undefined ? null : x));
const st = (q, a = []) => ({ bind: (...b) => st(q, b), first: async () => sql.prepare(q).get(...val(a)) ?? null,
  all: async () => ({ results: sql.prepare(q).all(...val(a)) }), run: async () => ({ meta: { changes: Number(sql.prepare(q).run(...val(a)).changes) } }) });
const objs = new Map();
const R2 = { async put(k, v, o) { objs.set(k, { body: new Uint8Array(v), type: o?.httpMetadata?.contentType }); },
  async get(k) { const o = objs.get(k); return o ? { body: o.body, httpMetadata: { contentType: o.type } } : null; },
  async delete(ks) { for (const k of [].concat(ks)) objs.delete(k); } };
const m = new Map(), kv = { async get(k) { return m.get(k) ?? null; }, async put(k, v) { m.set(k, v); } };
const env = { ASSETS: { fetch: async () => new Response('x', { status: 404 }) }, FITTING_USERS: 'Kate:kate-pass-1,Matt:matt-pass-2', BIO_KV: kv, DB: { prepare: (q) => st(q) }, BIO_R2: R2 };

const ask = (path, { method = 'GET', cookie, origin = HOST, body, type } = {}) => {
  const headers = {}; if (cookie) headers.Cookie = cookie; if (origin && method !== 'GET') headers.Origin = origin;
  if (body !== undefined) headers['Content-Type'] = type || 'application/json';
  const request = new Request(HOST + path, { method, headers, body: body === undefined ? undefined : type ? body : JSON.stringify(body) });
  return onRequest({ request, env, next: async () => new Response('x', { status: 404 }), waitUntil() {}, params: {}, data: {} });
};
const signIn = async (name, password) => (await ask('/api/login', { method: 'POST', body: { name, password } })).headers.get('set-cookie').split(';')[0];
const kate = await signIn('Kate', 'kate-pass-1'), matt = await signIn('Matt', 'matt-pass-2');
const fit = (id, updated, o = {}) => ({ id, updated, fit: 'full', v: { first: 'Jordan', last: 'Hale', email: 'j@example.com', sadH_post: 734 }, photos: [], ...o });
const put = (f, cookie = kate, origin) => ask('/api/fits/' + f.id, { method: 'PUT', cookie, origin, body: { fit: f } });

test('signed out: nothing is given or kept', async () => {
  assert.equal((await ask('/api/fits')).status, 401);
  assert.equal((await ask('/api/fits/abc')).status, 401);
  assert.equal((await put(fit('abc', 1), '')).status, 401);
  assert.equal((await ask('/api/photos/abc/p1')).status, 401);
});

test('a change only from the app’s own pages', async () => {
  assert.equal((await put(fit('xsite', 1), kate, 'https://elsewhere.example')).status, 403);
  assert.equal((await ask('/api/fits/xsite', { method: 'DELETE', cookie: kate, origin: 'https://elsewhere.example' })).status, 403);
  assert.equal((await ask('/api/fits/xsite', { cookie: kate })).status, 404);
});

test('a fit kept by one fitter is there for the other; the newer copy wins', async () => {
  const f = fit('f1', 1000, { photos: [{ id: 'p1', tag: 'Before · side', src: 'data:image/jpeg;base64,AAAA', up: true, marks: [] }] });
  assert.equal((await put(f)).status, 200);
  const list = await (await ask('/api/fits', { cookie: matt })).json();
  assert.deepEqual(list.fits.find((x) => x.id === 'f1'), { id: 'f1', updated: 1000, deleted: false });
  const got = await (await ask('/api/fits/f1', { cookie: matt })).json();
  assert.equal(got.fit.v.sadH_post, 734);
  // (the store keeps no picture in the fit itself, nor what's only this device's)
  assert.deepEqual(got.fit.photos, [{ id: 'p1', tag: 'Before · side', marks: [] }]);
  // an older copy from an iPad that was offline: turned away, the store's own time given back
  const old = await put(fit('f1', 900, { v: { first: 'Old' } }), matt);
  assert.equal(old.status, 409); assert.equal((await old.json()).updated, 1000);
  assert.equal((await put(fit('f1', 1100, { v: { first: 'Jordan', sadH_post: 740 } }), matt)).status, 200);
  assert.equal((await (await ask('/api/fits/f1', { cookie: kate })).json()).fit.v.sadH_post, 740);
  assert.equal(sql.prepare("SELECT by FROM pf_fits WHERE id = 'f1'").get().by, 'Matt');
  // (not a fit, or not this one: turned away)
  assert.equal((await ask('/api/fits/f1', { method: 'PUT', cookie: kate, body: { fit: { id: 'other', updated: 2000 } } })).status, 400);
  assert.equal((await ask('/api/fits/bad id!', { cookie: kate })).status, 404);
});

test('photos: kept and given back, pictures only; one taken out of its fit goes', async () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  assert.equal((await ask('/api/photos/f2/p1', { method: 'PUT', cookie: kate, body: jpg, type: 'image/jpeg' })).status, 200);
  assert.equal((await ask('/api/photos/f2/p2', { method: 'PUT', cookie: kate, body: jpg, type: 'image/jpeg' })).status, 200);
  assert.equal((await ask('/api/photos/f2/p3', { method: 'PUT', cookie: kate, body: '<script>', type: 'text/html' })).status, 415);
  const g = await ask('/api/photos/f2/p1', { cookie: matt });
  assert.equal(g.status, 200); assert.equal(g.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(new Uint8Array(await g.arrayBuffer()), jpg);
  await put(fit('f2', 10, { photos: [{ id: 'p1' }, { id: 'p2' }] }));
  await put(fit('f2', 20, { photos: [{ id: 'p1' }] }));
  assert.ok(objs.has('fitting/photos/f2/p1')); assert.ok(!objs.has('fitting/photos/f2/p2'));
});

test('a fit deleted: gone everywhere, photos and all, and an older copy can’t bring it back', async () => {
  await put(fit('f3', 10, { photos: [{ id: 'p1' }] }));
  await ask('/api/photos/f3/p1', { method: 'PUT', cookie: kate, body: new Uint8Array([1]), type: 'image/jpeg' });
  assert.equal((await ask('/api/fits/f3', { method: 'DELETE', cookie: matt })).status, 200);
  assert.ok(!objs.has('fitting/photos/f3/p1'));
  const list = await (await ask('/api/fits', { cookie: kate })).json();
  assert.equal(list.fits.find((x) => x.id === 'f3').deleted, true);
  assert.equal((await ask('/api/fits/f3', { cookie: kate })).status, 404);
  assert.equal(sql.prepare("SELECT data, name, email FROM pf_fits WHERE id = 'f3'").get().data, null);
  const back = await put(fit('f3', 11));
  assert.equal(back.status, 409); assert.equal((await back.json()).deleted, true);
  assert.equal((await ask('/api/photos/f3/p2', { method: 'PUT', cookie: kate, body: new Uint8Array([1]), type: 'image/jpeg' })).status, 409);
  // (changed after it was deleted, as when a client says yes after all: kept again)
  assert.equal((await put(fit('f3', Date.now() + 1000))).status, 200);
  assert.equal((await (await ask('/api/fits', { cookie: kate })).json()).fits.find((x) => x.id === 'f3').deleted, false);
});
