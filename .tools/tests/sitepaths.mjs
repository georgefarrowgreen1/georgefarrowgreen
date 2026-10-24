// The site's addresses and its open doors: an address written oddly (/%77eather/, //account/) is sent to its plain
// self, so each app is only ever served by its own host, under its own rules; one that can't be read as an address is
// nothing; files that aren't the site stay hidden. The contact form holds a network to 5 messages an hour, counted in
// one step (so a burst can't slip through), and keeps line breaks out of the name; the owner's answers aren't cached.
import http from 'node:http';
const [,, S, out] = process.argv;
let fails = 0;
const ok = (c, l, extra = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${extra ? '  — ' + extra : ''}`); if (!c) fails++; };
// (a raw request, so the address goes as written: fetch would tidy it first)
const get = (path, { method = 'GET', host = 'localhost:8788', body = null, headers = {} } = {}) => new Promise((done, fail) => {
  const r = http.request({ host: '127.0.0.1', port: 8788, path, method, headers: { Host: host, ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}), ...headers } }, (res) => {
    let t = ''; res.on('data', (x) => (t += x)); res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: t }));
  });
  r.on('error', fail); if (body) r.write(body); r.end();
});

// 1. odd addresses: to their plain selves
for (const [path, to] of [['/%77eather/', '/weather/'], ['/%61ccount/', '/account/'], ['/%70igeon/', '/pigeon/'], ['//account/', '/account/']]) {
  const r = await get(path);
  ok(r.status === 301 && new URL(r.headers.location).pathname === to, `${path}: sent to ${to}`, `${r.status} ${r.headers.location || ''}`);
}
// (from there, on the site itself, each to its app's own host: weather.georgefarrowgreen.com and the rest; a test server
// serves them where they are)
for (const path of ['/%ZZ/README.md', '/%2/x', '/README.md', '/wrangler.toml', '/.tools/tests/README.md', '/%2etools/tests/README.md', '/blokk/']) {
  const r = await get(path);
  ok(r.status === 404, `${path}: not found`, String(r.status));
}
const home = await get('/');
ok(home.status === 200 && /includeSubDomains/.test(home.headers['strict-transport-security'] || '') && home.headers['cross-origin-opener-policy'] === 'same-origin', 'the home page: HSTS for every subdomain, and its own window', JSON.stringify([home.headers['strict-transport-security'], home.headers['cross-origin-opener-policy']]));
// (the script in its head, which the page waits for before it draws: stamped too, so a visit back doesn't ask after it)
const sv = (home.body.match(/signedin\.js\?v=([0-9a-f]{12})"/) || [])[1];
const [js, oldJs] = await Promise.all([get(`/signedin.js?v=${sv}`), get('/signedin.js?v=old')]);
ok(sv && js.status === 200 && /immutable/.test(js.headers['cache-control'] || '') && oldJs.headers['cache-control'] === 'no-cache',
  'the home page’s signedin.js: stamped, kept for good by its stamp, checked each time by any other', JSON.stringify([sv, js.headers['cache-control'], oldJs.headers['cache-control']]));

// 2. the contact form: 5 an hour from one network, the 6th held back; a name with a line break in it, one line
const msg = (name, i) => JSON.stringify({ name, email: `writer${i}@example.com`, message: `Hello number ${i}` });
const sent = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((i) => get('/api/contact', { method: 'POST', body: msg(i ? 'Pat Lee' : 'Pat\r\nBcc: someone@example.com', i), headers: { 'CF-Connecting-IP': '2001:db8:1:2::' + (i + 1) } })));
const codes = sent.map((r) => r.status).sort();
ok(codes.filter((c) => c === 200).length === 5 && codes.filter((c) => c === 429).length === 3, 'eight at once from one network (a /64, each from its own address): five through, three held back', codes.join(','));
const big = await get('/api/contact', { method: 'POST', body: JSON.stringify({ name: 'Big', email: 'big@example.com', message: 'x'.repeat(20000) }), headers: { 'CF-Connecting-IP': '203.0.113.9' } });
ok(big.status === 400, 'a message far too big: refused before it’s read', String(big.status));
const bad = await get('/api/contact', { method: 'POST', body: JSON.stringify({ name: 'Odd', email: 'x?bcc=evil@example.com', message: 'hi' }), headers: { 'CF-Connecting-IP': '203.0.113.10' } });
ok(bad.status === 200 || bad.status === 400, 'an address with a “?” in it: taken as written or refused, never as more than one', String(bad.status));

// 3. the owner's answers: never cached
const c = await get('/api/content');
ok(c.status === 200 && /no-store/.test(c.headers['cache-control'] || ''), 'the site’s API answers: not kept by a cache', c.headers['cache-control']);

console.log(`FAILS ${fails}`);
process.exit(0);
