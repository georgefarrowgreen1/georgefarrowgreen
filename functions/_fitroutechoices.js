// Route ranking and diversity use actual geometry and source tags; no location cache.
import {metresBetween} from '../fitness/routes-geometry.js';
export const DISTANCE_TOLERANCE=.10;
export function roadData(feature){
 const rows=feature?.properties?.messages;if(!Array.isArray(rows)||!Array.isArray(rows[0]))return null;
 const di=rows[0].indexOf('Distance'),ti=rows[0].indexOf('WayTags');if(di<0||ti<0)return null;
 const out={total:0,unpaved:0,unknown:0,main:0,busy:0,path:0};
 for(const row of rows.slice(1)){const metres=Number(row[di]),tags=String(row[ti]||'');if(!Number.isFinite(metres)||metres<=0)continue;
  out.total+=metres;
  const highway=/\bhighway=([^ ]+)/.exec(tags)?.[1],surface=/\bsurface=([^ ]+)/.exec(tags)?.[1];
  if(/^(primary|secondary|tertiary)(?:_link)?$/.test(highway||''))out.main+=metres;
  if(/^(primary|trunk)(?:_link)?$/.test(highway||''))out.busy+=metres;
  if(/^(path|footway|track|bridleway)$/.test(highway||''))out.path+=metres;
  if(/^(unpaved|gravel|fine_gravel|compacted|ground|dirt|earth|grass|sand|mud|woodchips|pebblestone)$/.test(surface||'')||/\btracktype=grade[2-5]\b/.test(tags))out.unpaved+=metres;
  if(!surface)out.unknown+=metres;
 }
 return out.total?out:null;
}
const corridors=new WeakMap();
function corridor(route){
 if(corridors.has(route))return corridors.get(route);
 const cells=new Map(),lat=route.start[1]*Math.PI/180,cos=Math.cos(lat);let total=0;
 for(let i=1;i<route.coords.length;i++){
  const a=route.coords[i-1],b=route.coords[i],length=metresBetween(a,b),steps=Math.max(1,Math.ceil(length/25));
  for(let n=0;n<steps;n++){const t=(n+.5)/steps,x=(a[0]+(b[0]-a[0])*t-route.start[0])*111320*cos,y=(a[1]+(b[1]-a[1])*t-route.start[1])*111320,key=Math.round(x/40)+','+Math.round(y/40),weight=length/steps;cells.set(key,(cells.get(key)||0)+weight);total+=weight;}
 }
 const result={cells,total};corridors.set(route,result);return result;
}
export function sharedRoadFraction(a,b){
 const aa=corridor(a),bb=corridor(b);let shared=0;
 for(const[key,length]of aa.cells)shared+=Math.min(length,bb.cells.get(key)||0);
 return shared/Math.max(1,Math.min(aa.total,bb.total));
}
export function routeScore(route,q){
 const data=route._roads,t=data?.total||1;
 return Math.abs(route.metres-q.metres)/q.metres*100+(route._quality?.overlap||0)*20+(q.surface==='road'&&data?(data.unpaved/t*35+data.path/t*8+(q.roadPreference==='quiet'?data.busy/t*5:(1-data.main/t)*2)):0);
}
export function selectRoutes(routes,q){
 const ranked=[...routes].sort((a,b)=>routeScore(a,q)-routeScore(b,q));if(!ranked.length)return [];
 const chosen=[ranked[0]];chosen[0].name='Recommended loop';
 const distinct=route=>chosen.every(other=>sharedRoadFraction(route,other)<=.65);
 const remaining=()=>ranked.filter(r=>!chosen.includes(r)&&distinct(r));
 const climbs=remaining().filter(r=>r.elevation&&chosen[0].elevation);
 const minimum=Math.max(30,(chosen[0].ascent||0)*.15);
 const flatter=[...climbs].sort((a,b)=>a.ascent-b.ascent).find(r=>chosen[0].ascent-r.ascent>=minimum);
 if(flatter){flatter.name='Flatter loop';chosen.push(flatter);}
 const hillier=remaining().filter(r=>r.elevation&&chosen[0].elevation&&r.ascent-chosen[0].ascent>=minimum).sort((a,b)=>b.ascent-a.ascent)[0];
 if(hillier){hillier.name='More climbing';chosen.push(hillier);}
 for(const route of remaining()){if(chosen.length===3)break;if(!distinct(route))continue;route.name=chosen.length===1?'Different direction':'Another way round';chosen.push(route);}
 return chosen;
}
