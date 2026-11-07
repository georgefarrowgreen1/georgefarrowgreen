import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateRoutes,routeQuality} from '../../../functions/_fitloops.js';
const start=[.847,52.682];
const point=(x,y)=>[start[0]+x/(111320*Math.cos(start[1]*Math.PI/180)),start[1]+y/111320,25];
const corners=[[0,0],[10000,0],[10000,10000],[0,10000],[0,0]],loop=[];
for(let i=1;i<corners.length;i++)for(let n=0;n<20;n++)loop.push(point(corners[i-1][0]+(corners[i][0]-corners[i-1][0])*n/20,corners[i-1][1]+(corners[i][1]-corners[i-1][1])*n/20));
loop.push(point(0,0));
const branch=[point(10200,0),point(10300,150),point(10500,300)];
const withSpur=[...loop.slice(0,21),...branch,branch.at(-1),...branch.slice(0,-1).reverse(),loop[20],...loop.slice(21)];
test('a bent dead-end spur is rejected even when it is a small part of a long ride',async()=>{
 const quality=routeQuality(withSpur);assert.ok(quality.overlap<.05,'the old aggregate overlap threshold would accept this');assert.ok(quality.longestBacktrack>500);
 await assert.rejects(generateRoutes({start,metres:40000,surface:'road',seed:1},{fetcher:async()=>Response.json({features:[{geometry:{type:'LineString',coordinates:withSpur}}]})}),{status:422});
});
test('proper loops, nearby hairpin roads and a shared start/finish access road are retained',()=>{
 assert.equal(routeQuality(loop).longestBacktrack,0);
 const hairpin=[[0,0],[2000,0],[2500,50],[2500,100],[2000,200],[0,200],[-200,100],[0,0]].map(([x,y])=>point(x,y));
 assert.equal(routeQuality(hairpin).longestBacktrack,0);
 const access=point(-500,0),shared=[access,...loop,access];assert.equal(routeQuality(shared).longestBacktrack,0);
});
test('a clean candidate can still be returned when another direction contains a spur',async()=>{
 let calls=0;const got=await generateRoutes({start,metres:40000,surface:'road',seed:1},{fetcher:async()=>Response.json({features:[{geometry:{type:'LineString',coordinates:++calls===1?withSpur:loop}}]})});
 assert.equal(calls,3);assert.equal(got.routes.length,1);assert.equal(got.partial,true);assert.equal(routeQuality(got.routes[0].coords).longestBacktrack,0);
});
