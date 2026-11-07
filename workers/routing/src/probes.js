import { generateRoutes, routeQuality } from "../../../functions/_fitloops.js";
// Fixed public test places only. No caller-supplied coordinates on the probe endpoint.
export const PROBES=[
 {name:'London',start:[-.296178,51.450117]},
 {name:'Cardiff',start:[-3.1813,51.4837]},
 {name:'Edinburgh',start:[-3.1883,55.9533]},
 {name:'Belfast',start:[-5.9301,54.5973]},
 {name:'Shetland',start:[-1.1493,60.1545]},
 {name:'Scilly',start:[-6.311,49.915]},
 {name:'Greenwich',start:[-.002,51.48]},
 {name:'Newcastle',start:[-1.615,54.999]}
];
export const LOOP_CHECKS={
 'loops':{start:PROBES[0].start,metres:33000,surface:'road',seed:1},
 'loops-norfolk':{start:[.847,52.682],metres:100000,surface:'road',seed:1}
};
export function probeBody(start){const [x,y]=start;const points=[start,[x+.006,y+.003],[x+.006,y+.006],[x-.003,y+.003],start];return new URLSearchParams({lonlats:points.map(p=>p.map(n=>n.toFixed(6)).join(',')).join('|'),profile:'road'}).toString();}
export async function runProbes(fetcher,cases=PROBES,{loop=true,query=LOOP_CHECKS.loops}={}) {
 const checks=[];
 for(const item of cases){const at=Date.now();let status=0,closed=false,points=0,timer;try{
  await Promise.race([(async()=>{const r=await fetcher(new Request('http://router/route',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:probeBody(item.start)}));status=r.status;const j=await r.json(),c=j.features?.find(f=>f.geometry?.type==='LineString')?.geometry.coordinates;if(c?.length>5){closed=Math.hypot(c[0][0]-c.at(-1)[0],c[0][1]-c.at(-1)[1])<.0001;points=c.length;}})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Region probe timed out.')),35000);})]);
 }catch{}finally{clearTimeout(timer);}
  checks.push({region:item.name,status,closed,points,ms:Date.now()-at});
 }
 let loops={ready:false,count:0};
 if(loop){const attempts=[];
  try {const generated=await generateRoutes(query,{fetcher:(url,init)=>fetcher(new Request(url,init)),onAttempt:a=>attempts.push(a)});loops={ready:generated.routes.length>0,count:generated.routes.length,metres:generated.routes.map(r=>r.metres),maxBacktrack:Math.max(...generated.routes.map(r=>routeQuality(r.coords).longestBacktrack))};}catch(e){loops.error={status:e.status||0,message:e.message};}
  loops.attempts=attempts;
 }
 return {ready:checks.every(c=>c.status===200&&c.closed&&c.points>5)&&(!loop||loops.ready),checks,...(loop?{loops}:{})};
}
