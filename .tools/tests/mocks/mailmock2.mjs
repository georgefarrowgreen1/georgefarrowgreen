import http from 'http';
import { appendFileSync, readFileSync } from 'fs';
const [,, box, modeFile] = process.argv;
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
    appendFileSync(box, JSON.stringify({ auth: req.headers.authorization, body: JSON.parse(b) }) + '\n');
    let mode = ''; try { mode = readFileSync(modeFile, 'utf8').trim(); } catch (_) {}   // (no file: just accept)
    if (mode === 'fail') { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"statusCode":403,"message":"You can only send testing emails to your own email address (owner@example.com)."}'); }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"mock"}');
  });
}).listen(8799, '127.0.0.1');
