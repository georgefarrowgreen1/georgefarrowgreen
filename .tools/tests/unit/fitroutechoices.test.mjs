import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {roadData,sharedRoadFraction,routeScore,selectRoutes} from '../../../functions/_fitroutechoices.js';
import {cleanQuery,generateRoutes} from '../../../functions/_fitloops.js';
import {cleanRoute,destination,trackStats} from '../../../fitness/routes-geometry.js';
import {junctionWaypoints} from '../../../functions/_fitroutenetwork.js';
import {builtUpMetres,settlementDensity} from '../../../workers/routing/src/settlements.js';
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
 const selected=selectRoutes([a,duplicate,flat,hill],query);assert.equal(selected[0].name,'Recommended loop');assert.deepEqual(new Set(selected.slice(1).map(r=>r.name)),new Set(['Flatter loop','More climbing']));assert.equal(selected.includes(duplicate),false);
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
  const profiles = [];
  const found = await generateRoutes({ ...q, surface }, { fetcher: async (_url, init) => {
   const params = new URLSearchParams(init.body);
   const profile = params.get('profile');
   profiles.push(profile);
   const points = params.get('lonlats').split('|');
   assert.equal(points[0], q.start.join(','));
   assert.equal(points.at(-1), q.start.join(','));
   // A failed rural retry still leaves the suitable loop served from the same start.
   if (profile === surface + '-rural') return new Response(null, { status: 422 });
   return Response.json({ features: [withTerrain([paved, part])] });
  } });
  assert.deepEqual(profiles.slice(0, 6), Array(6).fill(surface));
  assert.deepEqual(profiles.slice(6), [surface + '-rural']);
  assert.ok(found.routes[0].terrain[measure] >= 39);
  const saved = cleanRoute(found.routes[0]);
  assert.deepEqual(saved.terrain, found.routes[0].terrain);
  assert.ok(saved.longestTerrainMetres > 10000);
  assert.equal(saved.longestTerrainMetres,found.routes[0].longestTerrainMetres);
  assert.equal(cleanRoute({...saved,longestTerrainMetres:saved.metres}).longestTerrainMetres,undefined);
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
 const result = await generateRoutes(query, { fetcher: async (_url, init) => {
  if (new URLSearchParams(init.body).get('profile') === 'gravel-rural') return new Response(null, { status: 422 });
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

test('quiet lanes favour a separated paved path and shorter stretches of busy road', () => {
 const score = tags => routeScore({ ...fixture, _roads: roadData(feature(tags), 'road') }, { ...q, roadPreference: 'quiet' });
 assert.ok(score('highway=path bicycle=designated surface=asphalt estimated_traffic_class=6') <
  score('highway=primary surface=asphalt estimated_traffic_class=6'));
 const rows = tags => roadData({ properties: { messages: [['Distance','WayTags'], ...tags] } }, 'road');
 const busy = 'highway=primary surface=asphalt', quiet = 'highway=residential surface=asphalt';
 assert.equal(rows([[400,busy],[400,busy],[200,quiet]]).longestBusy,800);
 assert.equal(rows([[400,busy],[200,quiet],[400,busy]]).longestBusy,400);
});

test('directional cycling access follows travel direction, and restricted sections cannot guide a retry', () => {
 const data = tags => roadData(feature(tags), 'mtb');
 assert.equal(data('highway=cycleway surface=gravel bicycle:backward=no').trail,fixture.metres);
 assert.equal(data('highway=cycleway surface=gravel bicycle:backward=no').blocked,0);
 const reversed = data('reversedirection=yes highway=cycleway surface=gravel bicycle:backward=no');
 assert.equal(reversed.blocked,fixture.metres);
 assert.deepEqual(reversed.sections,[]);
 assert.equal(data('highway=footway surface=asphalt').blocked,fixture.metres);
 assert.equal(data('highway=footway surface=asphalt bicycle=designated').blocked,0);
 assert.equal(data('highway=cycleway surface=asphalt').trail,0);
 assert.equal(data('highway=track surface=gravel smoothness=impassable').blocked,fixture.metres);
});

test('sustained gravel ranks above scattered sections without counting paved connectors as gravel', () => {
 const road = 'highway=residential surface=asphalt', gravel = 'highway=track surface=compacted';
 const data = rows => roadData({ properties: { messages: [['Distance','WayTags'],...rows] } }, 'gravel');
 const continuous = data([[500,gravel],[100,road],[500,gravel],[1400,road]]);
 const broken = data([[500,gravel],[300,road],[500,gravel],[1200,road]]);
 assert.equal(continuous.gravel,broken.gravel);
 assert.equal(continuous.longestTerrain,1000);
 assert.equal(broken.longestTerrain,500);
 const score = roads => routeScore({metres:2500,_roads:roads},{metres:2500,surface:'gravel'});
 assert.ok(score(continuous)<score(broken));
});

test('network-shaped retries return only independently routed and validated geometry', async () => {
 const { networkWaypoints, terrainWaypoints } = await import('../../../functions/_fitroutenetwork.js');
 const query = { ...q, surface: 'gravel' };
 const stretch = n => fixture.coords.map(([x,y,z]) => [q.start[0]+(x-q.start[0])*n,q.start[1]+(y-q.start[1])*n,z]);
 const roads = roadData(feature('highway=track surface=compacted'), 'gravel');
 const records = [1.2,1.3].map(n => ({route:cleanRoute({...fixture,coords:stretch(n)}),roads}));
 const mapped = new Set(records.flatMap(({route}) => route.coords.map(p=>p.slice(0,2).join(','))));
 const plans = networkWaypoints(records,query);
 assert.ok(plans.length && plans.length<=3);
 for (const p of plans) {
  assert.deepEqual(p[0],q.start);assert.deepEqual(p.at(-1),q.start);
  assert.ok(p.length>=5 && p.length<=10);
  assert.ok(p.slice(1,-1).every(point=>mapped.has(point.join(','))));
 }
 assert.deepEqual(terrainWaypoints(records[0].route,roadData(feature('highway=track'),'gravel'),query),[]);
 let calls=0, extended=0;
 await assert.rejects(generateRoutes(query,{fetcher:async(_url,init)=>{
  const points=new URLSearchParams(init.body).get('lonlats').split('|');
  calls++;
  if(points.length>5){extended++;return new Response(null,{status:422});}
  const f=feature('highway=track surface=compacted');
  f.geometry.coordinates=records[calls%2].route.coords;
  f.properties.messages[1][0]=records[calls%2].route.metres;
  return Response.json({features:[f]});
 }}),{status:422});
 assert.ok(extended>0 && calls<=9);
});

test('the last retry can combine two measured loops at shared junctions and recheck access', async () => {
 const start = [.847, 52.682], query = { start, metres: 20700, surface: 'gravel', seed: 1 };
 const scale = 111320 * Math.cos(start[1] * Math.PI / 180);
 const point = ([x, y]) => [start[0] + x / scale, start[1] + y / 111320].map(n => Number(n.toFixed(6)));
 const line = (...corners) => [point(corners[0]), ...corners.slice(1).flatMap(([x, y], i) => {
  const [px, py] = corners[i];
  return [.25, .5, .75, 1].map(t => point([px + (x - px) * t, py + (y - py) * t]));
 })];
 const home = [0, 0], left = [4000, 0], right = [4000, 5500];
 const outbound = line(home, [0, -1000], left), inbound = line(right, [0, 6000], home);
 const paved = 'highway=unclassified surface=asphalt', gravel = 'highway=track surface=compacted';
 const detour = line(left, [4800, 1500], [4800, 4000], right);
 const track = (...sections) => ({
  geometry: { type: 'LineString', coordinates: sections.flatMap(([coords], i) => i ? coords.slice(1) : coords) },
  properties: { messages: [['Distance', 'WayTags'], ...sections.map(([coords, tags]) => [trackStats(coords).metres, tags])] },
 });
 const base = track([outbound, paved], [line(left, right), paved], [inbound, paved]);
 const shorter = track([line(home, left), paved], [detour, gravel], [line(right, home), paved]);
 const measurements = [base, shorter].map(result => ({
  route: cleanRoute({ ...fixture, start, surface: query.surface, coords: result.geometry.coordinates }),
  roads: roadData(result, query.surface),
 }));
 const points = junctionWaypoints(measurements, query);
 assert.ok(points?.length >= 5 && points.length <= 10);
 assert.deepEqual(points[0], start);
 assert.deepEqual(points.at(-1), start);
 assert.ok(points.some(p => detour.slice(1, -1).some(c => String(c) === String(p))));
 assert.equal(junctionWaypoints([measurements[0], { ...measurements[1], roads: { ...measurements[1].roads, blocked: 1 } }], query), null);

 function replay(tags) {
  const attempts = [];
  const result = generateRoutes(query, { fetcher: async (_url, init) => {
   const form = new URLSearchParams(init.body);
   assert.equal(form.get('profile'), 'gravel');
   attempts.push(form.get('lonlats'));
   if (attempts.length <= 2) return Response.json({ features: [[base, shorter][attempts.length - 1]] });
   if (attempts.at(-1) === points.join('|')) {
    return Response.json({ features: [track([outbound, paved], [detour, tags], [inbound, paved])] });
   }
   return new Response(null, { status: 422 });
  } });
  return { attempts, result };
 }
 const accepted = replay(gravel);
 const { routes } = await accepted.result;
 assert.equal(accepted.attempts.length, 9);
 assert.equal(accepted.attempts.at(-1), points.join('|'));
 assert.equal(routes[0].metres, trackStats(track([outbound, paved], [detour, gravel], [inbound, paved]).geometry.coordinates).metres);
 assert.ok(routes[0].terrain.gravel >= 18);
 const closed = replay(gravel + ' bicycle=no');
 await assert.rejects(closed.result, { status: 422 });
 assert.deepEqual(closed.attempts, accepted.attempts);
});

test('gravel and MTB rank a rural loop ahead of an equally long loop through Norwich', () => {
 const start = [1.18, 52.633];
 const ring = direction => [start, [start[0] + .13 * direction, start[1]],
  [start[0] + .13 * direction, 52.658], [start[0], 52.658], start];
 const city = ring(1), rural = ring(-1);
 assert.equal(settlementDensity(...start),0);
 assert.ok(settlementDensity(1.2935,52.62838)>=3);
 assert.ok(settlementDensity(-5.9301,54.5973)>=3);
 assert.ok(builtUpMetres(city)>5_000);
 assert.ok(builtUpMetres(rural)<900);
 assert.ok(builtUpMetres([[1.18,52.628],[1.48,52.628]])>5_000,'sample across a city even when neither endpoint is in it');
 const data = roadData(feature('highway=track surface=compacted'));
 const makeRoute = coords => ({start,coords,metres:fixture.metres,_roads:data});
 for (const surface of ['gravel','mtb']) {
  const query={metres:fixture.metres,surface};
  const chosen=selectRoutes([
   {...makeRoute(city),elevation:true,ascent:300},
   {...makeRoute(rural),elevation:true,ascent:100},
  ],query);
  assert.equal(chosen[0].coords,rural);
  assert.equal(chosen.length,1);
 }
 assert.equal(routeScore(makeRoute(city),q),routeScore(makeRoute(rural),q));
});

test('the curated set finds two genuinely different options when the closest alternative overlaps both', () => {
 const start=[.847,52.682];
 const oneLobe=bearing => [destination(start,1400,bearing-13),destination(start,1400,bearing+13),start];
 const loop=(bearings,metres=10000)=>({start,coords:[start,...bearings.flatMap(oneLobe)],metres});
 const best=loop([25,65,105]);
 const intermediate=loop([145,185,225]);
 const north=loop([145,185,265],10200);
 const south=loop([185,225,305],10300);
 assert.ok(sharedRoadFraction(intermediate,north)>.65);
 assert.ok(sharedRoadFraction(intermediate,south)>.65);
 assert.ok(sharedRoadFraction(north,south)<.65);
 assert.deepEqual(selectRoutes([best,intermediate,north,south],{surface:'road',metres:10000}),[best,north,south]);
});

test('distance feedback comes from a suitable measured loop, and an out-of-range loop stays excluded', async () => {
 const query={...q,surface:'gravel'};
 const measured=feature('highway=track surface=compacted');
 measured.geometry.coordinates=fixture.coords.map(([x,y,z])=>[q.start[0]+.8*(x-q.start[0]),q.start[1]+.8*(y-q.start[1]),z]);
 let calls=0,adjusted=0;
 await assert.rejects(generateRoutes(query,{fetcher:async (_url,init)=>{
  calls++;
  const vias=new URLSearchParams(init.body).get('lonlats').split('|');
  if(vias.length>5){
   adjusted++;
   assert.equal(vias[0],vias.at(-1));
   assert.ok(vias.length<=10);
  }
  return Response.json({features:[measured]});
 }}),error=>error.status===422&&/closest suitable loop found was 26\.\d km/.test(error.message));
 assert.ok(adjusted>0&&calls<=9);
});
