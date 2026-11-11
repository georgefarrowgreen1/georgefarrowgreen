// The real OS controller, Fitness core, account route and native binary encoders.
// Reuse the existing transport-only harness without registering its other tests.
const {test}=require('node:test'),assert=require('node:assert/strict'),{Module}=require('node:module'),{readFileSync}=require('node:fs'),{resolve}=require('node:path');
function fixture(){const filename=resolve(__dirname,'workspace-integration.test.cjs'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);const requireOriginal=m.require.bind(m);let start,stop;m.require=id=>id==='node:test'?{test(){},before(fn){start=fn},after(fn){stop=fn}}:requireOriginal(id);m._compile(readFileSync(filename,'utf8')+'\nmodule.exports={open};',filename);return{start:()=>start(),stop:()=>stop(),open:m.exports.open};}
test('the OS Files library opens the real saved route and exports GPX/FIT through native Fitness while retaining its mounted pane',async()=>{
 const env=fixture();await env.start();let t;
 try{
  t=await env.open();const {page}=t;
  await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('button',{name:'Download inflite-r-workspace-fixture.gpx',exact:true}).waitFor();
  const native=page.locator('#m-fitness');const identity=()=>page.evaluate(()=>window.__originalFitness===document.getElementById('m-fitness'));
  assert.equal(await identity(),true);const gpx=page.waitForEvent('download');await page.getByRole('button',{name:'Download inflite-r-workspace-fixture.gpx',exact:true}).click();const route=await gpx;const gpxText=readFileSync(await route.path(),'utf8');assert.match(gpxText,/<gpx /);assert.equal((gpxText.match(/<trkpt /g)||[]).length,t.state.plan.route.coords.length);assert.equal(await identity(),true);
  await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByLabel('Type',{exact:true}).selectOption('workouts');
  const fit=page.locator('.ifl-files-item').filter({has:page.locator('.ifl-tx b', {hasText:/\.fit$/})}).first();await fit.waitFor();const label=await fit.locator('.ifl-tx b').innerText();
  const download=page.waitForEvent('download');await fit.getByRole('button',{name:'Download '+label,exact:true}).click();const workout=await download,bytes=readFileSync(await workout.path());assert.equal(bytes.subarray(8,12).toString(),'.FIT');assert.ok(bytes.length>40);assert.equal(await identity(),true);assert.equal(await native.count(),1);
  await page.getByRole('button',{name:'Files',exact:true}).click();await page.getByRole('dialog',{name:'Files',exact:true}).getByRole('button',{name:'Open inflite-r-workspace-fixture.gpx',exact:true}).click();await page.locator('#m-fitness .fx-sec[data-sec="routes"]:not([hidden])').waitFor();assert.equal(await identity(),true);
  assert.deepEqual(t.state.routeWrites,[],'opening and downloading files never mutate the saved route');await t.clean();
 }finally{await t?.ctx.close();await env.stop();}
});
