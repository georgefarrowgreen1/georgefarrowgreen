// ==== InFlite motion: shared lifecycle ====
// Pause presentation motion before first paint and while the page is in the app
// switcher. This does not pause data, requests, navigation or authentication.
(() => {
  const doc = globalThis.document, root = doc?.documentElement;
  if (!root?.toggleAttribute || globalThis.__iflMotionReady) return;
  globalThis.__iflMotionReady = true;
  const sync = () => root.toggleAttribute("data-motion-paused", doc.visibilityState === "hidden");
  doc.addEventListener?.("visibilitychange", sync);
  globalThis.addEventListener?.("pagehide", () => root.toggleAttribute("data-motion-paused", true));
  globalThis.addEventListener?.("pageshow", sync);
  sync();
})();
// ==== End InFlite motion ====
// ==== InFlite page zoom: shared guard ====
// InFlite's page zoom policy. Runs before sign-in and independently of the menu.
// Components such as maps and photo viewers retain their own gesture handling.
(() => {
  if (globalThis.__iflZoomBlocked) return;
  globalThis.__iflZoomBlocked = true;
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener("touchmove", (event) => {
    if (event.touches?.length > 1) event.preventDefault();
  }, { passive: false });
})();
// ==== End InFlite page zoom ====
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
  const sample=document.createElement('section');sample.className='card glass session fr-sample-session';sample.dataset.k='daycard';
  for(const [tag,text] of [['h3','Sample session'],['h2','Endurance 90'],['p','A steady 90-minute ride. Your selected route sits alongside the session as a separate demo plan.']]){const e=document.createElement(tag);e.textContent=text;sample.append(e);}
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
