// Deployment-only checks use fixed public roads and never write account data.
import { tickHost } from '../_sites.js';
import { tickAuthOk } from '../_notify.js';
import { generateRoutes } from '../_fitroutes.js';

const start = [-.296178, 51.450117];
const pins = [[-.256625, 51.441439], [-.266024, 51.451899]];
export async function onRequest({ request, env }) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST' || !tickHost(new URL(request.url).hostname, env)) return json({ error: 'Not found.' }, 404);
  try {
    tickAuthOk(request, env);
    if (!env.ROUTING_APP?.fetch) return json({ ready: false }, 503);
    const at = Date.now();
    const pinned = request.headers.get('X-Routing-Check') === 'pins';
    const query = pinned ? { mode: 'pins', start, pins, surface: 'road', returnToStart: true }
      : { start, metres: 33000, surface: 'road', seed: 1 };
    const { routes } = await generateRoutes(query, { fetcher: (url, init) => env.ROUTING_APP.fetch(new Request(url, init)) });
    const route = routes[0];
    const ready = pinned ? route?.source === 'map-pins' && route.returnToStart && route.pinIndices.length === pins.length : routes.length > 0;
    return json({ ready, count: routes.length, metres: routes.map(r => r.metres), ms: Date.now() - at,
      ...(pinned && ready ? { orderedPins: route.pinIndices.length, vertices: route.coords.length } : {}) }, ready ? 200 : 503);
  } catch (e) {
    return json({ ready: false, error: e.status ? e.message : 'Routing check failed.' }, e.status || 503);
  }
}
