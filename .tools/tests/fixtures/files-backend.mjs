// Reuse the real D1/R2 security harness without registering its unit cases.
// Only its existing seed/interleaving facade is test code: _files.js,
// FILES_ROUTES, sessions, SQL transactions and object streams run in workerd.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export async function createFilesBackend() {
  const filename = fileURLToPath(new URL('../unit/files-security.test.mjs', import.meta.url));
  const key = '__filesBackendHooks_' + randomUUID().replaceAll('-', '');
  const starts = [], stops = [];
  globalThis[key] = { before(fn) { starts.push(fn); }, after(fn) { stops.push(fn); }, test() {} };
  let source = readFileSync(filename, 'utf8');
  const registration = "import { after, before, test } from 'node:test';";
  if (!source.includes(registration)) throw new Error('Files backend harness registration changed.');
  source = source.replace(registration, `const {after,before,test}=globalThis[${JSON.stringify(key)}];`)
    .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href));
  source += '\nexport {mf,fixture,api,internal,sql,folder,reserve,uploaded};';
  let backend;
  try { backend = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + key); }
  finally { delete globalThis[key]; }
  try { for (const start of starts) await start(); }
  catch (error) { for (const stop of stops.reverse()) await stop().catch(() => {}); throw error; }
  return {
    ...backend,
    async session(owner) {
      const response = await backend.mf.dispatchFetch('https://account.inflite.ai/_seed', { method: 'POST', body: JSON.stringify({ owner }) });
      if (response.status !== 200) throw new Error('Real Files account fixture did not start: ' + await response.text());
      return { owner, cookie: response.headers.get('set-cookie').split(';')[0] };
    },
    fetch(request, init) { return backend.mf.dispatchFetch(request, init); },
    serviceBinding() {
      // Node's Request is not workerd's Request. Serialize only this transport
      // boundary; Root's byte limit, domain upload checks and actual R2 storage
      // remain unchanged. Streaming cancellation has separate workerd coverage.
      return { async fetch(request) {
        const read = request.method === 'GET' || request.method === 'HEAD';
        return backend.mf.dispatchFetch(request.url, {
          method: request.method, headers: Object.fromEntries(request.headers),
          ...(read ? {} : { body: await request.arrayBuffer() }),
          signal: request.signal,
        });
      } };
    },
    async dispose() { for (const stop of stops.reverse()) await stop(); },
  };
}
