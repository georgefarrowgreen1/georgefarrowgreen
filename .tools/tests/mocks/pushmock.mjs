import http from 'http';
import { appendFileSync } from 'fs';
const [,, box] = process.argv;
let mode = 201;
http.createServer((req, res) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    if (req.url === '/mode') { mode = Number(Buffer.concat(chunks).toString()); res.end('ok'); return; }
    appendFileSync(box, JSON.stringify({ headers: req.headers, body: Buffer.concat(chunks).toString('base64'), at: Date.now() }) + '\n');
    res.writeHead(mode); res.end();
  });
}).listen(8798, '127.0.0.1');
