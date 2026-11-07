// Standalone, account-free preview of the exact component used by Fitness's module.
import { createRoutesView } from './routes-demo.js';
import { renderPlanCard } from './routes-plan.js';
import { able, routeMap } from './map.js';
const root = document.querySelector('#routes'), today = document.querySelector('#today'), tabs = [...document.querySelectorAll('[data-tab]')];
const owner = 'standalone-preview';
let section = 'routes';
const routes = createRoutesView(root,{owner,workout:{name:'Endurance 90',minutes:90},sampleWorkout:true,map:(el,o)=>able()?routeMap(el,{...o,light:matchMedia('(prefers-color-scheme: light)').matches}):Promise.reject(new Error('WebGL unavailable')),onToday:()=>show('today'),onPlan:()=>drawToday()});
function drawToday() {
  today.replaceChildren();
  const sample=document.createElement('section');sample.className='fr-sample-session';
  for(const [tag,text] of [['span','Sample session'],['h2','Endurance 90'],['p','A steady 90-minute ride. Your selected route sits alongside the session as a separate demo plan.']]){const e=document.createElement(tag);e.textContent=text;sample.append(e);}
  today.append(sample);
  renderPlanCard(today,{owner,onOpen:id=>{show('routes');routes.open(id);},onRemove:()=>drawToday()});
}
function show(id) {
  section=id;root.hidden=id!=='routes';today.hidden=id!=='today';
  for(const tab of tabs) { if(tab.dataset.tab===id)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current'); }
  document.querySelector('h1').textContent=id==='today'?'Today':'Routes';
  if(id==='today'){routes.hide();drawToday();}else{routes.draw();routes.resume();}
  scrollTo({top:0,behavior:'instant'});
}
for(const tab of tabs)tab.addEventListener('click',()=>show(tab.dataset.tab));
routes.draw();
addEventListener('pagehide',()=>routes.hide());
addEventListener('pageshow',()=>{if(section==='routes')routes.resume();});
