import http from 'http';
import { readFileSync, appendFileSync, existsSync } from 'fs';
const [,, dir, log] = process.argv;
const idx = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8'));
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  appendFileSync(log, JSON.stringify({ path: u.pathname, q: Object.fromEntries(u.searchParams), headers: req.headers }) + '\n');
  if (/^\/v1\/gifs\/(search|trending)$/.test(u.pathname)) {
    if (u.searchParams.get('api_key') !== 'giphy-test-key') { res.writeHead(401); return res.end('{}'); }
    const q = (u.searchParams.get('q') || '').toLowerCase(), off = +u.searchParams.get('offset') || 0, lim = +u.searchParams.get('limit') || 24;
    const all = q ? idx.filter((g) => g.title.toLowerCase().includes(q)) : idx;
    const page = all.slice(off, off + lim);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ data: page.map((g) => ({ id: g.id, title: g.title, images: { fixed_width: { width: String(g.w), height: String(g.h) } } })), pagination: { total_count: all.length, count: page.length, offset: off } }));
  }
  const m = /^\/media\/([A-Za-z0-9]+)\/(200w_d\.webp|200w\.webp|giphy-downsized\.gif|200w\.gif)$/.exec(u.pathname);
  if (m && existsSync(`${dir}/${m[1]}.${m[2].endsWith('webp') ? 'webp' : 'gif'}`)) {
    res.writeHead(200, { 'Content-Type': m[2].endsWith('webp') ? 'image/webp' : 'image/gif' });
    return res.end(readFileSync(`${dir}/${m[1]}.${m[2].endsWith('webp') ? 'webp' : 'gif'}`));
  }
  res.writeHead(404); res.end();
}).listen(8797, '127.0.0.1');
