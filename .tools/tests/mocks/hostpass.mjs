// Host pass-throughs for InFlite's hub in the end-to-end tests (spec §14.5): each port answers as one of the apps' own
// addresses, passing every request on to the local site (pages dev on :8788) with that address as its Host, since the
// hub's Worker (workerd) can't resolve *.ifl.test and the site routes by Host. Each request is noted in the log, without
// its cookie's value or any bearer: which port, method and path, the Origin it spoke as, whether it carried a cookie
// (and the cookies' names) or an Authorization header, and whether it carried the hub's key.
//   node hostpass.mjs <log.jsonl> 8791=account.ifl.test:8788 8792=chat.ifl.test:8788 …
import http from 'node:http';
import { appendFileSync } from 'node:fs';

const [,, LOG, ...maps] = process.argv;
const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
for (const m of maps) {
  const [port, host] = m.split('=');
  http.createServer((q, s) => {
    const cookie = q.headers.cookie || '';
    try {
      appendFileSync(LOG, JSON.stringify({ at: Date.now(), port: Number(port), host, method: q.method, path: q.url, origin: q.headers.origin || null, cookie: !!cookie,
        cookies: cookie ? cookie.split(';').map((c) => c.trim().split('=')[0]).filter(Boolean) : [], auth: !!q.headers.authorization, hub: !!q.headers['x-hub-key'] }) + '\n');
    } catch (_) {}
    const out = http.request({ host: '127.0.0.1', port: 8788, method: q.method, path: q.url, agent, headers: { ...q.headers, host } }, (r) => {
      s.writeHead(r.statusCode, r.statusMessage, r.rawHeaders);
      r.pipe(s);
    });
    out.on('error', () => { if (!s.headersSent) s.writeHead(502, { 'Content-Type': 'text/plain' }); s.end('the local site isn’t answering'); });
    q.pipe(out);
  }).listen(Number(port), '127.0.0.1');
}
