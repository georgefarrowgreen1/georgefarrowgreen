import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateRoutes,routeQuality} from '../../../functions/_fitloops.js';
import {excursionWaypoints} from '../../../functions/_fitroutenetwork.js';
import {trackStats} from '../../../fitness/routes-geometry.js';
const start=[.847,52.682];
const point=(x,y)=>[start[0]+x/(111320*Math.cos(start[1]*Math.PI/180)),start[1]+y/111320,25];
const corners=[[0,0],[10000,0],[10000,10000],[0,10000],[0,0]],loop=[];
for(let i=1;i<corners.length;i++)for(let n=0;n<20;n++)loop.push(point(corners[i-1][0]+(corners[i][0]-corners[i-1][0])*n/20,corners[i-1][1]+(corners[i][1]-corners[i-1][1])*n/20));
loop.push(point(0,0));
const branch=[point(10200,0),point(10300,150),point(10500,300)];
const withSpur=[...loop.slice(0,21),...branch,branch.at(-1),...branch.slice(0,-1).reverse(),loop[20],...loop.slice(21)];
const junctionDetour = [[10200,0],[10340,0],[10366,20],[10350,45],[10327,20],[10200,0],[10000,0]].map(([x,y])=>point(x,y));
const withJunctionDetour = [...loop.slice(0,21),...junctionDetour,...loop.slice(21)];
const parallelDetour = [[10200,2000],[10340,2000],[10366,2005],[10372,2012],[10347,2020],[10200,2020],[10000,2020]].map(([x,y])=>point(x,y));
const withParallelDetour = [...loop.slice(0,25),...parallelDetour,...loop.slice(25)];
test('a bent dead-end spur is rejected even when it is a small part of a long ride',async()=>{
 const quality=routeQuality(withSpur);assert.ok(quality.overlap<.05,'the old aggregate overlap threshold would accept this');assert.ok(quality.longestBacktrack>500);
 await assert.rejects(generateRoutes({start,metres:40000,surface:'road',seed:1},{fetcher:async()=>Response.json({features:[{geometry:{type:'LineString',coordinates:withSpur}}]})}),{status:422});
});
test('proper loops, nearby hairpin roads and a shared start/finish access road are retained',()=>{
 assert.equal(routeQuality(loop).longestBacktrack,0);
 const hairpin=[[0,0],[2000,0],[2500,50],[2500,100],[2000,200],[0,200],[-200,100],[0,0]].map(([x,y])=>point(x,y));
 assert.equal(routeQuality(hairpin).longestBacktrack,0);
 const access=point(-500,0),shared=[access,...loop,access];
 const stem=routeQuality(shared);
 assert.equal(stem.longestBacktrack,0);
 assert.ok(stem.overlap>0);
 assert.equal(stem.interiorOverlap,0);
 assert.ok(routeQuality(withSpur).interiorOverlap>0);
});
test('a clean candidate can still be returned when another direction contains a spur',async()=>{
 let calls=0;const got=await generateRoutes({start,metres:40000,surface:'road',seed:1},{fetcher:async()=>Response.json({features:[{geometry:{type:'LineString',coordinates:++calls===1?withSpur:loop}}]})});
 assert.equal(calls,6);assert.equal(got.routes.length,1);assert.equal(got.partial,true);assert.equal(routeQuality(got.routes[0].coords).longestBacktrack,0);
});

test('rejects a side loop that returns to the same junction and a turnback on parallel lanes', async () => {
 const query = { start, metres:40000, surface:'road', seed:1 };
 for (const coords of [withJunctionDetour, withParallelDetour]) {
  const quality = routeQuality(coords);
  assert.equal(quality.longestBacktrack,0);
  assert.ok(quality.overlap<.05);
  assert.ok(quality.excursion.to-quality.excursion.from>500);
  await assert.rejects(generateRoutes(query, {fetcher:async()=>Response.json({features:[{geometry:{type:'LineString',coordinates:coords}}]})}), {status:422});
 }
});

test('a tight hairpin onto a separate path and a normal roundabout exit retain forward progress', () => {
 const hairpin = [[-400,0],[0,0],[400,0],[430,10],[400,20],[0,20],[-400,20],[-800,100],[-800,2500],[2000,2500],[2000,-2500],[-400,-2500],[-400,0]].map(([x,y])=>point(x,y));
 const roundabout = [[10000,0],[10003,8],[10010,12],[10018,8],[10020,0],[10018,-8],[10010,-12],[10003,-8],[10005,-150],[10250,-800],[12000,-800],[12000,1000]].map(([x,y])=>point(x,y));
 assert.equal(routeQuality(hairpin).excursion,null);
 const arcRoute = [...loop.slice(0,20),...roundabout,...loop.slice(24)];
 assert.equal(routeQuality(arcRoute).excursion,null);
 assert.equal(routeQuality([point(-500,0),...loop,point(-500,0)]).excursion,null);
});

test('a detour retry asks BRouter to reconnect the useful roads before offering the result', async () => {
 const query = { start, metres:40000, surface:'road', seed:1 }, route = {coords:withJunctionDetour,...trackStats(withJunctionDetour)};
 const points = excursionWaypoints(route,routeQuality(route.coords).excursion,query);
 assert.ok(points.length>=5 && points.length<=10);
 assert.ok(points.slice(1,-1).every(([lon])=>lon <= point(10000,0)[0] + 1e-6));
 let calls=0,repaired=0;
 const result = await generateRoutes(query,{fetcher:async(_url,init)=>{
  calls++;
  const retry = new URLSearchParams(init.body).get('lonlats') === points.join('|');
  if(retry) repaired++;
  return Response.json({features:[{geometry:{type:'LineString',coordinates:retry?loop:withJunctionDetour}}]});
 }});
 assert.equal(repaired,1);
 assert.ok(calls<=9);
 assert.deepEqual(result.routes[0].coords,loop);
});
