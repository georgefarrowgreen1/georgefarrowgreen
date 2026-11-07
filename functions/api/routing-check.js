// Deployment-only check: fixed public start, no caller coordinates or account writes.
import { tickHost } from '../_sites.js';
import { tickAuthOk } from '../_notify.js';
import { generateRoutes } from '../_fitloops.js';
export async function onRequest({request,env}) {
  const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST'||!tickHost(new URL(request.url).hostname,env))return json({error:'Not found.'},404);
  try {
    tickAuthOk(request,env);
    if(!env.ROUTING_APP?.fetch)return json({ready:false},503);
    const at=Date.now(),result=await generateRoutes({start:[-.296178,51.450117],minutes:90,surface:'road',speed:22,seed:1},{fetcher:(url,init)=>env.ROUTING_APP.fetch(new Request(url,init))});
    return json({ready:result.routes.length>0,count:result.routes.length,metres:result.routes.map(r=>r.metres),ms:Date.now()-at});
  }catch(e){return json({ready:false,error:e.status?e.message:'Routing check failed.'},e.status||503);}
}
