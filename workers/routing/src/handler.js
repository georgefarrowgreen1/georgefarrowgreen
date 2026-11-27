import { inUK } from './coverage.js';
export const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const profiles = new Set(['road','road-quiet','road-paved','road-quiet-paved','gravel','gravel-rural','mtb','mtb-rural','mixed']);
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
export async function routeInput(request) {
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/route'||url.search)return null;
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return null;
  const text=await request.text();if(text.length>4096)return null;
  const form = new URLSearchParams(text);
  const profile = form.get('profile'), pins = form.get('mode') === 'pins';
  if (!profiles.has(profile) || form.size !== (pins ? 3 : 2)) return null;
  const raw = form.get('lonlats')?.split('|');
  if (!raw || raw.length < (pins ? 2 : 5) || raw.length > 10) return null;
  const points = [];
  for (const point of raw) {
    if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(point)) return null;
    const pair = point.split(',').map(Number);
    if (Math.abs(pair[0]) > 180 || Math.abs(pair[1]) > 90) return null;
    if (pins && points.length && samePoint(points.at(-1), pair)) return null;
    if (!pins && (pair[0] < -16 || pair[0] > 4 || pair[1] < 48 || pair[1] > 63)) return null;
    points.push(pair);
  }
  if (!pins && !samePoint(points[0], points.at(-1))) return null;
  return {points, profile, pins, body:form.toString()};
}
export async function handleRoute(request,env,{get=key=>env.ROUTER_POOL.get(env.ROUTER_POOL.idFromName(key),{locationHint:'weur'})}={}) {
  if(new URL(request.url).pathname==='/health'&&request.method==='GET'){
    try{return await get('uk-primary').fetch('http://router/health');}catch{return json({ready:false,error:'warming'},503);}
  }
  const input=await routeInput(request).catch(()=>null);if(!input)return json({error:'invalid_route'},400);
  // Loop shaping points can be offshore near the coast. User-selected stops each need coverage.
  const outside = (input.pins ? input.points : input.points.slice(0,1)).findIndex(p => !inUK(p));
  if (outside !== -1) return json({error:'outside_coverage', message:'Cycling routes currently cover the United Kingdom.', pointIndex:outside},422);
  for(const key of ['uk-primary','uk-standby']){
    request.signal?.throwIfAborted();
    try {
      const response=await get(key).fetch(new Request('http://router/route',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:input.body,signal:request.signal}));
      if(response.status<500)return response;
      console.warn(JSON.stringify({event:'routing_failover',instance:key,status:response.status}));
      await response.body?.cancel();
    } catch { request.signal?.throwIfAborted(); }
  }
  return json({error:'route_unavailable'},503);
}
