// What a sync costs: someone with 8 friends and 5 groups, pigeons each way. How many trips to the
// database it makes (the server counts them in tests: X-DB-Trips) and how long it takes, and that
// what it returns is the same as last time it was saved (SAVE=1 ./run.sh syncperf saves it).
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
const [,, S] = process.argv;
const BASE = 'http://localhost:8788';
let fails = 0; const ok = (c, l, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  — ' + x : ''}`); if (!c) fails++; };
const api = async (t, path, body, method) => { const r = await fetch(BASE + '/api/pigeon/' + path, { method: method || (body ? 'POST' : 'GET'), headers: { ...(t ? { Authorization: 'Bearer ' + t } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return [r.status, await r.json().catch(() => ({})), r.headers]; };
const rnd = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
const realPub = async () => { const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']); const j = await crypto.subtle.exportKey('jwk', k.publicKey); return { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; };
const user = async (h, name, lat, lon, place) => { const [, u] = await api(null, 'signup', { name, handle: h, email: h + '@example.com', salt: rnd().slice(0, 22), proof: rnd(), vault: 'v'.repeat(40), pub: await realPub() });
  await api(u.token, 'me', { lat, lon, place }, 'PATCH'); return u; };
const CITIES = [['Paris', 48.86, 2.35], ['Rome', 41.9, 12.5], ['Madrid', 40.4, -3.7], ['Berlin', 52.5, 13.4], ['Dublin', 53.35, -6.26], ['Oslo', 59.9, 10.75], ['Lisbon', 38.7, -9.14], ['Vienna', 48.2, 16.37]];
const H = await user('hub', 'Hana Hub', 51.5, -0.12, 'London');
const F = [];
for (const [i, [place, lat, lon]] of CITIES.entries()) {
  const f = await user('pal' + i, 'Pal ' + i, lat, lon, place); F.push(f);
  await api(H.token, 'friends', { handle: 'pal' + i }); await api(f.token, 'friends-respond', { id: H.me.id, accept: true });
  if (i) { await api(F[0].token, 'friends', { handle: 'pal' + i }); await api(f.token, 'friends-respond', { id: F[0].me.id, accept: true }); }
}
const ct = 'c'.repeat(60);
for (const f of F) { await api(H.token, 'messages', { id: randomUUID(), to: f.me.id, ct, pigeon: 'standard' }); await api(f.token, 'messages', { id: randomUUID(), to: H.me.id, ct, pigeon: 'swift' }); }
for (let g = 0; g < 5; g++) {
  const who = [F[g], F[(g + 1) % 8], F[(g + 3) % 8]];
  const [, cg] = await api(H.token, 'groups', { name: 'Group ' + g, members: who.map((x) => x.me.id) });
  const keys = (ids) => Object.fromEntries(ids.map((id) => [id, 'k'.repeat(40)])), all = [H.me.id, ...who.map((x) => x.me.id)];
  const [s1, r1] = await api(H.token, 'group-messages', { id: randomUUID(), group: cg.group.id, body: 'b'.repeat(60), keys: keys(all), pigeon: 'standard' });
  const [s2] = await api(who[0].token, 'group-messages', { id: randomUUID(), group: cg.group.id, body: 'b'.repeat(60), keys: keys(all), pigeon: 'swift' });
  if (s1 !== 200 || s2 !== 200) console.log('group send', s1, s2, JSON.stringify(r1).slice(0, 120));
}
// a few syncs: the first warms the server up
const runs = [];
for (let i = 0; i < 6; i++) { const t0 = performance.now(); const [s, body, h] = await api(H.token, 'sync'); runs.push({ s, ms: performance.now() - t0, trips: Number(h.get('x-db-trips')), body }); }
// and opening a chat (the app asks again every 15 s while it's open): one to one, and a group
const trips = async (path) => { await api(H.token, path); const [, , h] = await api(H.token, path); return Number(h.get('x-db-trips')); };
const [, gl] = await api(H.token, 'sync');
const gs0 = [...gl.groups].sort((a, b) => a.name.localeCompare(b.name))[0];
console.log(`chat: ${await trips('messages?with=' + F[0].me.id)} trips; group chat: ${await trips('group-messages?id=' + gs0.id)} trips`);
ok((await trips('messages?with=' + F[0].me.id)) <= Number(process.env.MAX_CHAT || 8), `opening a chat: at most ${process.env.MAX_CHAT || 8} trips (it was 10, one after another)`);
const chat = (await api(H.token, 'messages?with=' + F[0].me.id))[1], gchat = (await api(H.token, 'group-messages?id=' + gs0.id))[1];
const last = runs.at(-1), ms = runs.slice(1).map((r) => r.ms).sort((a, b) => a - b), med = ms[Math.floor(ms.length / 2)];
console.log(`sync: ${last.trips} trips to the database, ${med.toFixed(0)} ms (median of 5, local)`);
ok(last.s === 200 && last.body.friends.length === 8 && last.body.groups.length === 5, 'sync answers: 8 friends, 5 groups', JSON.stringify({ s: last.s, f: last.body.friends?.length, g: last.body.groups?.length }));
ok(last.trips > 0 && last.trips <= Number(process.env.MAX_TRIPS || 6), `at most ${process.env.MAX_TRIPS || 6} trips to the database (it was 48 before they were batched)`, String(last.trips));
// the same answer as before (ids and times aside: each run makes new ones)
const labels = new Map();
const norm = (v) => JSON.parse(JSON.stringify(v, (k, x) => {
  if (typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(x)) { if (!labels.has(x)) labels.set(x, 'id' + labels.size); return labels.get(x); }
  if (typeof x === 'number' && x > 1e12) return 'T';
  if (typeof x === 'number' && !Number.isInteger(x)) return Math.round(x * 100) / 100;   // (where a pigeon is now moves on between runs)
  if (['now', 'x', 'y', 'seenAt', 'locAt', 'streak', 'skin', 'legs', 'near', 'fly', 'liveAt'].includes(k)) return undefined;   // (the minute's background round adds to these when it runs)
  if (Array.isArray(x) && x.length && x[0] && typeof x[0] === 'object' && 'toPlace' in x[0]) return [...x].sort((a, b) => String(a.toPlace).localeCompare(String(b.toPlace)));
  return x; }));
// (in a steady order: friends and members by handle, groups by name; the database's own order follows random ids)
const byKey = (k) => (a, b) => String(a[k]).localeCompare(String(b[k]));
const steady = (b) => ({ ...b, friends: [...b.friends].sort(byKey('handle')), incoming: [...b.incoming].sort(byKey('handle')), outgoing: [...b.outgoing].sort(byKey('handle')),
  groups: [...b.groups].sort(byKey('name')).map((g) => ({ ...g, members: [...g.members].sort(byKey('handle')) })) });
const mine = norm({ sync: steady(last.body), chat: { ...chat, now: 0 }, gchat: { ...gchat, now: 0 } }), file = `${S}/sync-saved.json`;
if (process.env.SAVE) { writeFileSync(file, JSON.stringify(mine, null, 1)); console.log('saved', file); }
else if (existsSync(file)) { const was = readFileSync(file, 'utf8'), now = JSON.stringify(mine, null, 1); ok(was === now, 'the same answer as the saved one', was === now ? '' : `differs at char ${[...was].findIndex((c, i) => c !== now[i])}: …${now.slice(Math.max(0, [...was].findIndex((c, i) => c !== now[i]) - 120), [...was].findIndex((c, i) => c !== now[i]) + 120)}…`); }
console.log(`FAILS ${fails}`);
process.exit(0);
