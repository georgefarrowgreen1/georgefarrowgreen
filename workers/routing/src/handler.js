import { inUK } from './coverage.js';
export const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function routeInput(request) {
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/route'||url.search)return null;
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return null;
  const text=await request.text();if(text.length>4096)return null;
  const form=new URLSearchParams(text);if([...form].length!==2||!['road','road-quiet','road-paved','road-quiet-paved','mixed'].includes(form.get('profile')))return null;
  const raw=form.get('lonlats')?.split('|');
  if(!raw||raw.some(p=>p.split(',').some(v=>!/^[-]?\d+(?:\.\d+)?$/.test(v))))return null;
  const points=raw.map(p=>p.split(',').map(Number));
  if(!points||points.length!==5||points.some(p=>p.length!==2||!p.every(Number.isFinite)||p[0]<-16||p[0]>4||p[1]<48||p[1]>63)||String(points[0])!==String(points[4]))return null;
  return {points,profile:form.get('profile'),body:form.toString()};
}
export async function handleRoute(request,env,{get=key=>env.ROUTER_POOL.get(env.ROUTER_POOL.idFromName(key),{locationHint:'weur'})}={}) {
  if(new URL(request.url).pathname==='/health'&&request.method==='GET'){
    try{return await get('uk-primary').fetch('http://router/health');}catch{return json({ready:false,error:'warming'},503);}
  }
  const input=await routeInput(request).catch(()=>null);if(!input)return json({error:'invalid_route'},400);
  if(!inUK(input.points[0]))return json({error:'outside_coverage',message:'Cycling routes currently cover the United Kingdom.'},422);
  for(const key of ['uk-primary','uk-standby']){
    try {
      const response=await get(key).fetch(new Request('http://router/route',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:input.body}));
      if(response.status<500)return response;
      console.warn(JSON.stringify({event:'routing_failover',instance:key,status:response.status}));
      await response.body?.cancel();
    } catch { /* retry once on the other capped instance; never log coordinates */ }
  }
  return json({error:'route_unavailable'},503);
}
