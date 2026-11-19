import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roadData,sharedRoadFraction,routeScore,selectRoutes} from '../../../functions/_fitroutechoices.js';
import {cleanQuery,generateRoutes} from '../../../functions/_fitloops.js';
import {cleanRoute} from '../../../fitness/routes-geometry.js';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/cycling-loop.json',import.meta.url))),q={start:fixture.start,metres:33000,surface:'road',seed:1};
const feature=(tags)=>({geometry:{type:'LineString',coordinates:fixture.coords},properties:{messages:[['Distance','WayTags'],[fixture.metres,tags]]}});
const square=(x,y,ascent=100)=>({start:[-.3,51.4],coords:[[0,0],[x,0],[x,y],[0,y],[0,0]].map(([dx,dy])=>[-.3+dx/70000,51.4+dy/111320]),metres:10000,ascent,elevation:true});
test('road preferences are validated, default paved, and map to private allowlisted profiles',async()=>{
 assert.equal(cleanQuery(q).avoidUnpaved,true);
 for(const bad of [{roadPreference:'motorway'},{avoidUnpaved:'true'}])assert.throws(()=>cleanQuery({...q,...bad}),{status:400});
 for(const [extra,expected]of [[{},'road-paved'],[{roadPreference:'quiet'},'road-quiet-paved'],[{avoidUnpaved:false},'road'],[{roadPreference:'quiet',avoidUnpaved:false},'road-quiet'],[{surface:'mixed'},'mixed']]){
  const profiles=[];await generateRoutes({...q,...extra},{fetcher:async(u,init)=>{profiles.push(new URLSearchParams(init.body).get('profile'));return Response.json({features:[feature('highway=secondary surface=asphalt')]});}});assert.ok(profiles.length<=9);assert.deepEqual([...new Set(profiles)],[expected]);
 }
});
test('known unpaved roads are rejected when enabled; missing surface tags stay unknown',async()=>{
 const tags='highway=track surface=compacted tracktype=grade2',data=roadData(feature(tags));assert.equal(data.unpaved,fixture.metres);assert.equal(data.path,fixture.metres);
 assert.equal(roadData(feature('highway=secondary')).unknown,fixture.metres);assert.equal(roadData({}),null);
 await assert.rejects(generateRoutes(q,{fetcher:async()=>Response.json({features:[feature(tags)]})}),{status:422});
 assert.equal((await generateRoutes({...q,avoidUnpaved:false},{fetcher:async()=>Response.json({features:[feature(tags)]})})).routes.length,1);
});
test('corridor matching detects reversed and differently sampled versions of the same roads',()=>{
 const a=square(2500,2500),reverse={...a,coords:[...a.coords].reverse()},dense={...a,coords:a.coords.flatMap((p,i)=>i===a.coords.length-1?[p]:[p,[(p[0]+a.coords[i+1][0])/2,(p[1]+a.coords[i+1][1])/2]])};
 assert.ok(sharedRoadFraction(a,reverse)>.98);assert.ok(sharedRoadFraction(a,dense)>.95);assert.ok(sharedRoadFraction(a,square(-2500,-2500))<.02);
});
test('ranking uses distance, repeated roads and selected road class; alternatives are distinct with truthful climbing labels',()=>{
 const a=square(2500,2500,150),duplicate={...a,coords:[...a.coords].reverse()},flat=square(-2500,2500,60),hill=square(-2500,-2500,250),query={metres:10000,surface:'road',roadPreference:'main'};
 const selected=selectRoutes([a,duplicate,flat,hill],query);assert.deepEqual(selected.map(r=>r.name),['Recommended loop','Flatter loop','More climbing']);assert.equal(selected.includes(duplicate),false);
 for(let i=0;i<selected.length;i++)for(const b of selected.slice(i+1))assert.ok(sharedRoadFraction(selected[i],b)<=.65);
 const noHeight=[square(2500,2500),square(-2500,2500),square(-2500,-2500)].map(r=>({...r,elevation:false,ascent:null}));assert.ok(selectRoutes(noHeight,query).every(r=>!/(Flatter|climbing)/.test(r.name)));
 const main={...a,_roads:{total:100,unpaved:0,path:0,main:90,busy:80}},quiet={...a,_roads:{total:100,unpaved:0,path:0,main:10,busy:0}};
 assert.ok(routeScore(main,query)<routeScore(quiet,query));assert.ok(routeScore(quiet,{...query,roadPreference:'quiet'})<routeScore(main,{...query,roadPreference:'quiet'}));
});
test('verified distance and road preferences survive saved-plan validation; false claims are discarded',()=>{
 const valid=cleanRoute({...fixture,targetMetres:33000,roadPreference:'quiet',avoidUnpaved:true});assert.equal(valid.targetMetres,33000);assert.equal(valid.roadPreference,'quiet');assert.equal(valid.avoidUnpaved,true);
 assert.equal(cleanRoute({...fixture,targetMetres:5000}).targetMetres,undefined);
});

test('gravel and mountain bike use different engine profiles and require mapped terrain', async () => {
 const withTerrain = (rows) => ({ ...feature(''), properties: { messages: [['Distance', 'WayTags'], ...rows] } });
 const paved = [fixture.metres * .6, 'highway=secondary surface=asphalt'];
 const aggregate = [fixture.metres * .4, 'highway=track surface=compacted tracktype=grade2'];
 const trail = [fixture.metres * .4, 'highway=path bicycle=designated mtb:scale=1'];
 for (const [surface, part, measure] of [['gravel', aggregate, 'gravel'], ['mtb', trail, 'trail']]) {
  const profiles = new Set();
  const found = await generateRoutes({ ...q, surface }, { fetcher: async (_url, init) => {
   profiles.add(new URLSearchParams(init.body).get('profile'));
   return Response.json({ features: [withTerrain([paved, part])] });
  } });
  assert.deepEqual([...profiles], [surface]);
  assert.ok(found.routes[0].terrain[measure] >= 39);
  assert.deepEqual(cleanRoute(found.routes[0]).terrain, found.routes[0].terrain);
  await assert.rejects(generateRoutes({ ...q, surface }, {
   fetcher: async () => Response.json({ features: [feature('highway=residential surface=asphalt')] }),
  }), { status: 422 });
 }
});

test('access restrictions and unsuitable grades trump surface quality', async () => {
 const invalid = [
  ['gravel', 'highway=track surface=gravel bicycle=no'],
  ['gravel', 'highway=track surface=gravel smoothness=impassable'],
  ['mtb', 'highway=path surface=ground bicycle=yes mtb:scale=4'],
  ['mtb', 'highway=track surface=earth access=private'],
 ];
 for (const [surface, tags] of invalid) {
  await assert.rejects(generateRoutes({ ...q, surface }, {
   fetcher: async () => Response.json({ features: [feature(tags)] }),
  }), { status: 422 });
 }
});

test('a useful direction is retried between measured distances when a waypoint snaps to a shorter path', async () => {
 const query = { ...q, surface: 'gravel' };
 const distances = [1.18, .86, 1.01];
 let calls = 0;
 const result = await generateRoutes(query, { fetcher: async () => {
  calls++;
  if (calls > 1 && calls <= 6) return new Response(null, { status: 422 });
  const ratio = q.metres / fixture.metres * distances[calls === 1 ? 0 : calls - 6];
  const f = feature('highway=track surface=compacted tracktype=grade2');
  f.geometry.coordinates = fixture.coords.map(([x, y, z]) => [
   q.start[0] + (x - q.start[0]) * ratio, q.start[1] + (y - q.start[1]) * ratio, z,
  ]);
  f.properties.messages[1][0] = fixture.metres * ratio;
  return Response.json({ features: [f] });
 } });
 assert.equal(calls, 8);
 assert.ok(Math.abs(result.routes[0].metres - query.metres) / query.metres < .05);
});
