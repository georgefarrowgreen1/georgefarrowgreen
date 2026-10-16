// Pwned Passwords stand-in: /range/ABCDE answers suffixes (with padding), logs only what it was asked
import http from 'http'; import { createHash } from 'crypto'; import { appendFileSync } from 'fs';
const LEAKED = { 'password1234': 123456, 'correct horse battery staple': 2 };
const H = Object.fromEntries(Object.entries(LEAKED).map(([p, n]) => [createHash('sha1').update(p).digest('hex').toUpperCase(), n]));
http.createServer((req, res) => {
  const m = /^\/range\/([0-9A-F]{5})$/.exec(req.url);
  appendFileSync(process.argv[2], JSON.stringify({ at: Date.now(), url: req.url, pad: req.headers['add-padding'] }) + '\n');
  if (!m) { res.writeHead(404); return res.end(); }
  const lines = Object.entries(H).filter(([h]) => h.startsWith(m[1])).map(([h, n]) => `${h.slice(5)}:${n}`);
  for (let i = 0; i < 20; i++) lines.push(`${(i.toString(16) + '0'.repeat(35)).slice(0, 35).toUpperCase()}:0`);
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(lines.join('\r\n'));
}).listen(8795);
