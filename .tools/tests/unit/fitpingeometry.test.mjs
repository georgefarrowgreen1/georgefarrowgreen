import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRoute, toGPX } from '../../../fitness/routes-geometry.js';
import { forgetRoutePlans, generateRoutes, readRoutePlan } from '../../../fitness/routes-account.js';

const coords = [[-0.297,51.45,42],[-0.295,51.45,43],[-0.294,51.449,42],[-0.292,51.447,34]];
const pins = [[-0.2941,51.4491],[-0.2921,51.4471]];
const course = {
  id:'r-pin-test-123', name:'Park & café', start:[-0.2971,51.4501], source:'map-pins',
  surface:'road', roadPreference:'quiet', avoidUnpaved:true,
  coords, pins, pinIndices:[2,3], returnToStart:false
};

test('open courses preserve routed geometry, requested pins, snapped visits and road preferences across JSON', () => {
  const route = cleanRoute(course);
  assert.ok(route);
  assert.deepEqual(cleanRoute(JSON.parse(JSON.stringify(route))), route);
  assert.deepEqual(route.coords,coords);
  assert.notEqual(route.pins[0],course.pins[0]);
  assert.deepEqual(route.pins,pins);
  assert.deepEqual(route.pinIndices,[2,3]);
  assert.equal(route.roadPreference,'quiet');
  assert.equal(route.avoidUnpaved,true);
  assert.equal(route.source,'map-pins');
  assert.equal(cleanRoute({...course,source:undefined}),null);

  const gpx = toGPX(route);
  assert.match(gpx, /Park &amp; café/);
  assert.deepEqual(Array.from(gpx.matchAll(/<wpt lat="([^"]+)" lon="([^"]+)"><name>([^<]+)<\/name><\/wpt>/g), m => [+m[2],+m[1],m[3]]),
    [[...coords[0].slice(0,2),'Start'],[...coords[2].slice(0,2),'Pin 1'],[...coords[3].slice(0,2),'Finish']]);
  assert.equal((gpx.match(/<trkpt /g)||[]).length,coords.length);
});

test('returning courses preserve the final pin separately from the return leg', () => {
  const returning = cleanRoute({...course,returnToStart:true,coords:[...coords,...coords.slice(0,-1).reverse()]});
  assert.ok(returning?.returnToStart);
  assert.equal(returning.pinIndices.at(-1),3);
  assert.deepEqual(returning.coords.at(-1),coords[0]);
  assert.ok(returning.metres > cleanRoute(course).metres);
  assert.match(toGPX(returning), /<name>Start \/ finish<\/name>/);
  for (const change of [
    {returnToStart:true}, {returnToStart:'true'}, {pins:[]}, {pinIndices:[1]},
    {pinIndices:[3,2]}, {pinIndices:[2,4]}, {pinIndices:[0,3]}, {pinIndices:[2,2]}, {pins:[pins[0],[0,50]]},
    {pins:[pins[0]],pinIndices:[2]}, {coords:[...coords,coords[0]]}, {pins:[pins[0],[-0.292,51.447,0]]}
  ]) assert.equal(cleanRoute({...course,...change}),null,JSON.stringify(change));
});

test('the account client reopens saved map pins, sends private requests, and identifies an unreachable pin', async t => {
  forgetRoutePlans();
  t.after(forgetRoutePlans);
  const query = {mode:'pins',start:course.start,pins,returnToStart:false,surface:'road',roadPreference:'quiet',avoidUnpaved:true};
  const fetch = t.mock.method(globalThis,'fetch', async (url, init) => {
    assert.equal(init.headers['X-Inflite-Route-Owner'],'owner');
    assert.equal(init.credentials,'same-origin');
    if (url === '/api/fitness/routes/plan') return Response.json({plan:{route:course,version:'saved'}});
    assert.equal(url,'/api/fitness/routes/generate');
    assert.equal(init.method,'POST');
    assert.deepEqual(JSON.parse(init.body),query);
    return Response.json({routes:[course]});
  });
  const [route] = await generateRoutes(query,{owner:'owner'});
  const reread = await readRoutePlan('owner',{force:true});
  assert.deepEqual(reread.route,route);
  fetch.mock.mockImplementation(async () => Response.json({error:'Move this pin.',field:'pins.1'},{status:422}));
  await assert.rejects(generateRoutes(query,{owner:'owner'}),{status:422,field:'pins.1',message:'Move this pin.'});
});
