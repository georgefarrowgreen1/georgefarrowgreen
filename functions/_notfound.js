// Shared 404 protocol (also functions/_notfound.js in georgefarrowgreen).
// The design lives only in inflite's today/public/404.*. Never forward account
// headers or the missing URL to the renderer, or replace machine responses.
export function documentRequest(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const dest = request.headers.get('Sec-Fetch-Dest');
  const mode = request.headers.get('Sec-Fetch-Mode');
  if (dest !== null && !['document', 'iframe'].includes(dest)) return false;
  if (mode !== null && mode !== 'navigate') return false;
  const accepts = (request.headers.get('Accept') || '').split(',').some(part => {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
    return ['text/html', 'application/xhtml+xml'].includes(type.trim()) && (!q || Number(q.slice(2)) > 0);
  });
  if (!accepts) return false;
  let path;
  try { path = decodeURIComponent(new URL(request.url).pathname); } catch { return false; }
  if (/(?:^|\/)(?:api|roof|parts|body|cdn-cgi|_[^/]*|\.[^/]*)(?:\/|$)/i.test(path)) return false;
  const file = path.split('/').pop();
  return !file.includes('.') || /\.html?$/i.test(file);
}

export async function sharedNotFound(request, response, service, timeoutMs = 1500) {
  if (response.status !== 404 || response.headers.get('X-Inflite-Error') === '404' || !documentRequest(request) || !service?.fetch) return response;
  const controller = new AbortController();
  let timer;
  try {
    // Bound both the service call and reading its body; a broken error page must
    // never leave the original request waiting indefinitely.
    const replacement = await Promise.race([
      (async () => {
        const upstream = await service.fetch(new Request('https://inflite.ai/_errors/404', {
          headers: { Accept: 'text/html' }, signal: controller.signal,
        }));
        if (upstream.status !== 404 || upstream.headers.get('X-Inflite-Error') !== '404' || !upstream.headers.get('Content-Type')?.startsWith('text/html')) {
          upstream.body?.cancel().catch(() => {});
          return null;
        }
        const html = await upstream.text();
        return new Response(request.method === 'HEAD' ? null : html, { status: 404, headers: upstream.headers });
      })(),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs); }),
    ]);
    if (!replacement) return response;
    response.body?.cancel().catch(() => {});
    return replacement;
  } catch { return response; }
  finally { clearTimeout(timer); }
}
