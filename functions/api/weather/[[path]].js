// Weather's own API (the forecast itself comes straight from Open-Meteo, in the browser).
//   GET /api/weather/where   roughly where you are, from your connection (Cloudflare's guess,
//                            to the city), so a first visit opens on somewhere near without
//                            asking for your location. Nothing is kept.
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });

export function onRequest({ request, params }) {
  const parts = [].concat(params.path || []);
  if (parts.join("/") !== "where") return json({ error: "Not found." }, 404);
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405);
  const cf = request.cf || {}, lat = Number(cf.latitude), lon = Number(cf.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "Unknown." }, 404);
  const name = cf.city || cf.region || cf.country || "Near you";
  const region = [cf.city ? cf.region : null, cf.country].filter(Boolean).join(", ");
  return json({ name, region, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, tz: cf.timezone || null });
}
