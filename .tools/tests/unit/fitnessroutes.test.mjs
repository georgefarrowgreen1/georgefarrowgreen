import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, geometry, estimate, recommendations, toGPX, profile } from '../../../fitness/routes-model.js';
import { cleanPlan, validDay, readPlan, savePlan, clearPlan } from '../../../fitness/routes-store.js';
import { serveFitness } from '../../../functions/_fitapp.js';
const store = () => { const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}; };
test('sample tracks use finite geographic/elevation points, are closed, and match their distance summaries',()=>{
  for(const route of ROUTES){const g=geometry(route);assert.ok(g.coords.length>100);assert.deepEqual(g.coords[0],g.coords.at(-1));assert.ok(Math.abs(g.metres-route.metres)/route.metres<.025);
    for(const [lon,lat,ele] of g.coords){assert.ok(Number.isFinite(lon)&&lon>-.7&&lon<-.1);assert.ok(Number.isFinite(lat)&&lat>51.1&&lat<51.6);assert.ok(Number.isFinite(ele)&&ele>-100&&ele<1000);}
    for(let i=1;i<g.distances.length;i++)assert.ok(g.distances[i]>=g.distances[i-1]&&g.distances[i]-g.distances[i-1]<750,'no discontinuity in the exported track');
    assert.ok(!/NaN|Infinity/.test(profile(route).path));
  }
});
test('the endurance route repeats a real closed loop twice',()=>{const a=geometry(ROUTES[0]),b=geometry(ROUTES[1]);assert.equal(b.coords.length,a.coords.length*2-1);assert.ok(Math.abs(b.metres-a.metres*2)<.01);});
test('suggestions match time and surface and explain when a route exceeds the available time',()=>{
  assert.equal(recommendations({minutes:90})[0].route.id,'park-endurance');assert.equal(recommendations({minutes:45})[0].route.id,'park-loop');
  assert.deepEqual(recommendations({surface:'mixed'}).map(x=>x.route.id),['park-paths']);assert.equal(recommendations({surface:'road'}).length,3);
  const short=recommendations({minutes:20});assert.equal(short[0].fit,false);assert.match(short[0].why,/beyond your target/);
  assert.ok(estimate(ROUTES[0],-4)>0);assert.ok(Number.isFinite(estimate(ROUTES[0],Infinity)));
});
test('GPX exports every actual point and elevation, escapes names, and invents no recorded timestamps',()=>{
  const r=ROUTES[1],s=toGPX({...r,name:'Ride & <friends>'});assert.match(s,/<gpx version="1.1"/);assert.equal((s.match(/<trkpt /g)||[]).length,geometry(r).coords.length);assert.equal((s.match(/<ele>/g)||[]).length,geometry(r).coords.length);assert.match(s,/Ride &amp; &lt;friends&gt;/);assert.ok(!s.includes('<time>'));
});
test('demo plans are validated, stored per account, and removed without touching another account',()=>{
  const s=store(),p={v:1,routeId:'park-loop',day:'2026-11-08',time:'09:15'};savePlan('a',p,s);assert.deepEqual(readPlan('a',s),p);assert.equal(readPlan('b',s),null);savePlan('b',{...p,routeId:'park-paths'},s);clearPlan('a',s);assert.equal(readPlan('a',s),null);assert.equal(readPlan('b',s).routeId,'park-paths');
  assert.equal(validDay('2026-02-30'),false);assert.equal(validDay('2028-02-29'),true);
  for(const bad of [{...p,routeId:'untrusted'},{...p,time:'25:99'},{...p,day:'2026-02-30'},{...p,v:7}])assert.equal(cleanPlan(bad),null);
  assert.throws(()=>savePlan('',p,s));
});
test('broken local storage is recoverable on reads and explicit on writes',()=>{const s={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};assert.equal(readPlan('a',s),null);assert.throws(()=>savePlan('a',{v:1,routeId:'park-loop',day:'2026-11-08',time:'09:00'},s),/blocked/);});
test('only the named Routes preview joins Fitness’s existing allowed HTML pages',()=>{const r=()=>new Response('<html>demo</html>',{headers:{'Content-Type':'text/html'}});assert.equal(serveFitness(r(),'/fitness/routes-demo.html').status,200);assert.equal(serveFitness(r(),'/fitness/anything-else.html').status,404);});
