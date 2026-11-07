import { Container } from '@cloudflare/containers';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleRoute, json } from './handler.js';
import lock from '../data.lock.json';
import { PROBES, runProbes } from './probes.js';
export class UKRouter extends Container {
  defaultPort=8080;
  sleepAfter='10m';
  enableInternet=false;
  pingEndpoint='/health';
  async fetch(request) {
    await this.startAndWaitForPorts([8080],{instanceGetTimeoutMS:15000,portReadyTimeoutMS:30000,waitInterval:200});
    return this.containerFetch(request);
  }
  onError(){console.warn('router_container_error');}
}
// Only the site's private service binding can reach this entrypoint.
export class RoutingService extends WorkerEntrypoint {
  fetch(request){return handleRoute(request,this.env);}
}
async function authorised(request,secret){
  if(!secret)return false;
  const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request.headers.get('authorization')||''));
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Bearer '+secret));
  let diff=0;const aa=new Uint8Array(a),bb=new Uint8Array(b);for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    // Public health describes the release without starting an idle container.
    if(request.method==='GET'&&url.pathname==='/health'&&!url.search)return json({service:'InFlite UK Routing',snapshot:lock.date,engine:'BRouter-'+lock.engine.version,coverage:'United Kingdom',privateRouting:true});
    if(request.method==='POST'&&url.pathname==='/probe'&&!url.search&&await authorised(request,env.ROUTING_PROBE_TOKEN))return json(await runProbes((r)=>handleRoute(r,env),PROBES));
    return json({error:'not_found'},404);
  }
};
