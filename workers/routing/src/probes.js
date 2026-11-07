// Fixed public test places only. No caller-supplied coordinates on the probe endpoint.
export const PROBES=[
 {name:'London',start:[-.296178,51.450117]},
 {name:'Cardiff',start:[-3.1813,51.4837]},
 {name:'Edinburgh',start:[-3.1883,55.9533]},
 {name:'Belfast',start:[-5.9301,54.5973]},
 {name:'Shetland',start:[-1.1493,60.1545]},
 {name:'Scilly',start:[-6.311,49.915]}
];
export function probeBody(start){const [x,y]=start;const points=[start,[x+.006,y+.003],[x+.006,y+.006],[x-.003,y+.003],start];return new URLSearchParams({lonlats:points.map(p=>p.map(n=>n.toFixed(6)).join(',')).join('|'),profile:'road'}).toString();}
export async function runProbes(fetcher,cases=PROBES) {
 const checks=[];
 for(const item of cases){const at=Date.now();let status=0,closed=false,points=0;try{const r=await fetcher(new Request('http://router/route',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:probeBody(item.start)}));status=r.status;const j=await r.json(),c=j.features?.find(f=>f.geometry?.type==='LineString')?.geometry.coordinates;if(c?.length>5){closed=Math.hypot(c[0][0]-c.at(-1)[0],c[0][1]-c.at(-1)[1])<.0001;points=c.length;}}catch{}
  checks.push({region:item.name,status,closed,points,ms:Date.now()-at});
 }
 return {ready:checks.every(c=>c.status===200&&c.closed&&c.points>5),checks};
}
