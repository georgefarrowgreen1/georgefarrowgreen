import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../../weather/charts.js',import.meta.url),'utf8'),start=source.indexOf('function watchWidth('),body=source.slice(start,source.indexOf('\n}\n',start)+2);
function harness(connected=true){
 const frames=new Map(),observed=[],widths=[];let next=0,draws=0;
 const context={ResizeObserver:class{constructor(fn){this.fn=fn;this.disconnected=false;observed.push(this);}observe(n){this.host=n;}disconnect(){this.disconnected=true;}},requestAnimationFrame:fn=>(frames.set(++next,fn),next),cancelAnimationFrame:id=>frames.delete(id),seen:(_,w)=>widths.push(w)};
 const watch=vm.runInNewContext(body+';watchWidth',context),host={isConnected:connected,clientWidth:300,_w:260};watch(host,()=>draws++);
 return{host,frames,observed,widths,get draws(){return draws;},flush(){const fs=[...frames.values()];frames.clear();for(const fn of fs)fn();}};
}
test('chart resize delivery records widths and coalesces one draw outside the observer',()=>{
 const h=harness(),ro=h.observed[0];ro.fn();h.host.clientWidth=320;ro.fn();
 assert.equal(h.draws,0);assert.equal(h.frames.size,1);assert.equal(h.host._w,320);
 h.flush();assert.equal(h.draws,1);assert.deepEqual(h.widths,[300,320]);
 ro.fn();assert.equal(h.frames.size,0,'unchanged width does not redraw');
});
test('a newer explicit render cancels queued resize work and its generation rejects an already queued callback',()=>{
 const h=harness();h.observed[0].fn();const old=[...h.frames.values()][0];h.host._cancelResize();
 assert.equal(h.frames.size,0);old();assert.equal(h.draws,0);
 h.host.clientWidth=340;h.observed[0].fn();h.flush();assert.equal(h.draws,1,'later width changes can draw normally');
});
test('a removed chart disconnects and cancels without drawing into a detached sheet',()=>{
 const h=harness(),ro=h.observed[0];ro.fn();h.host.isConnected=false;h.flush();
 assert.equal(h.draws,0);assert.equal(ro.disconnected,true);assert.equal(h.host._ro,null);assert.equal(h.frames.size,0);
 ro.fn();assert.equal(h.frames.size,0,'late observer delivery cannot restart a removed chart');
 const h2=harness(),ro2=h2.observed[0];ro2.fn();h2.host.isConnected=false;ro2.fn();
 assert.equal(h2.frames.size,0,'detach delivery cancels a frame before it runs');assert.equal(ro2.disconnected,true);h2.flush();assert.equal(h2.draws,0);
});
test('a chart built before attachment remains observable and hidden zero width never replaces its useful width',()=>{
 const h=harness(false),ro=h.observed[0];ro.fn();assert.equal(ro.disconnected,false);assert.equal(h.frames.size,0);
 h.host.isConnected=true;ro.fn();h.flush();assert.equal(h.draws,1);
 h.host.clientWidth=0;ro.fn();assert.equal(h.host._w,300);assert.equal(h.frames.size,0);
});
