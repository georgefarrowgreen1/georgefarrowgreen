// Exercise the real entry's optional boundary: Today stays unchanged, while one OS provider survives section navigation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const noop=()=>{},tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
class Element extends EventTarget{
 constructor(doc){super();this.ownerDocument=doc;this.children=[];this.dataset={};this.classList={add:noop,remove:noop,toggle:noop};}
 append(...nodes){for(const n of nodes){this.children.push(n);if(n&&typeof n==='object')n.parentElement=this;}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
 setAttribute(){}querySelector(){return null;}get childElementCount(){return this.children.length;}
}
const view=()=>({draw:noop,resume:noop,hide:noop,destroy:noop});
function setup({enabled=false,delayed=false}={}){
 const doc=new EventTarget();doc.createElement=()=>new Element(doc);doc.head=doc.createElement();doc.querySelector=()=>null;
 const root=doc.createElement(),controller=new AbortController(),job=deferred(),loads=[],made=[],destroyed=[];
 const core={S:{me:{id:'ann'},acts:[],mine:[],times:[],dirty:new Set()},U:{},TODAY:Date.now(),EVENTS:[],start:noop,stop:noop,shown:noop,actsOn:()=>[],plannedOn:()=>null,rhythmOn:()=>false};
 const adapter={createWorkspace:(el,ctx,options)=>{made.push({el,ctx,options});return{changed:noop,destroy:()=>destroyed.push(1)};}};
 const fw={signal:controller.signal,session:{user:{id:'ann'}},screenEl:root,visible:()=>true,stale:()=>false,header:{set:noop},nav:{section:noop},search:{provide:()=>noop},toast:noop,
  ui:{skeleton:()=>doc.createElement(),error:()=>doc.createElement()},
  lazy(fn){const file=/import\("[^\"]*\/([^/\"]+)"/.exec(String(fn))?.[1];loads.push(file);if(file==='workspace.js')return delayed?job.promise:Promise.resolve(adapter);return Promise.resolve({view,renderRoutePlan:noop,forgetRoutePlans:noop});}};
 if(enabled)fw.workspace={enabled:true};
 const deps={core,connector:{search:()=>[]},attach:noop,detach:noop,setPicker:noop,closeSheet:noop,sheetEl:{},todayView:view,lookAt:noop,sendableToday:noop,openOffer:noop,dayStamp:()=>'',rhythmSaid:()=>'',dur:String,dist:String,measure:noop,startOfDay:d=>d,addDays:d=>d,mondayOf:d=>d,WORKOUTS:[]};
 const source=readFileSync(new URL('../../../fitness/roof/fitness.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');
 const mount=new Function(...Object.keys(deps),`${source}\nreturn mount;`)(...Object.values(deps));
 return{root,fw,controller,job,adapter,loads,made,destroyed,mount:()=>mount(root,fw)};
}
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{connection:{saveData:true}}});

test('ordinary Today never imports or registers the optional Fitness workspace',async()=>{
 const e=setup(),app=await e.mount();try{await app.show({section:'today'});await tick();app.hide();await app.show({section:'activities'});await tick();assert.ok(!e.loads.includes('workspace.js'));assert.equal(e.made.length,0);}finally{app.unmount();}
});
test('the OS reuses one Fitness provider across section changes and hide/return; unmount disposes it once',async()=>{
 const e=setup({enabled:true,delayed:true}),app=await e.mount();await app.show({section:'today'});await app.show({section:'progress'});assert.equal(e.loads.filter(x=>x==='workspace.js').length,1);e.job.resolve(e.adapter);await tick();assert.equal(e.made.length,1);assert.equal(e.made[0].el,e.root);assert.equal(e.made[0].ctx.fw,e.fw);app.hide();await app.show({section:'activities'});await tick();assert.equal(e.made.length,1);assert.equal(e.loads.filter(x=>x==='workspace.js').length,1);app.unmount();assert.equal(e.destroyed.length,1);assert.equal(e.made[0].options.current(),false);
});
test('a late optional adapter never registers after disposal, abort or an account switch',async()=>{
 for(const end of ['unmount','abort','account']){const e=setup({enabled:true,delayed:true}),app=await e.mount();await app.show({section:'today'});if(end==='unmount')app.unmount();else if(end==='abort')e.controller.abort();else e.fw.session.user.id='bea';e.job.resolve(e.adapter);await tick();assert.equal(e.made.length,0,end);if(end!=='unmount')app.unmount();}
});

test('an already-loaded app accepts a late OS capability through the optional hook without a duplicate show or provider',async()=>{
 const e=setup({delayed:true}),app=await e.mount();await app.show({section:'today'});await tick();assert.equal(e.made.length,0);assert.equal(app.workspace(),null);e.fw.workspace={enabled:true};const first=app.workspace(),second=app.workspace();assert.equal(first,second,'all callers await the same pending bridge');assert.equal(e.loads.filter(x=>x==='workspace.js').length,1);e.job.resolve(e.adapter);await first;assert.equal(e.made.length,1);assert.ok(app.workspace());assert.equal(e.loads.filter(x=>x==='workspace.js').length,1);app.unmount();assert.equal(app.workspace(),null);assert.equal(e.destroyed.length,1);
});
