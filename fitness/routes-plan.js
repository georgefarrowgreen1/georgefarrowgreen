// A secondary route card alongside the workout, using Fitness's own components.
import { ROUTES, readPlan, clearPlan } from './routes-store.js';
import { icon, sportIcon } from './ui.js';
export function renderPlanCard(host, { owner, metric = true, onOpen, onRemove, storage, current } = {}) {
  const previous = host.querySelector('[data-k="route-demo-plan"]');
  const plan = readPlan(owner, storage), route = plan && ROUTES.find(r => r.id === plan.routeId);
  const stamp = plan && JSON.stringify([owner,plan,metric]);
  if (previous?.dataset.planStamp === stamp) return previous;
  previous?.remove();
  if (!route) return null;
  const doc = host.ownerDocument;
  const node = (tag, cls, text) => { const n = doc.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
  const card = node('section','card glass fr-plan-summary');
  card.dataset.k = 'route-demo-plan'; card.dataset.planStamp = stamp; card.setAttribute('aria-label','Demo ride plan');
  const heading = node('h3','k','Planned route');
  heading.prepend(icon('ride',15,2)); heading.append(node('span','fr-plan-demo','Demo'));
  const row = node('div','fr-plan-row'), tile = node('span','tile s-ride'); tile.append(sportIcon('ride',20));
  const copy = node('div','fr-plan-copy');
  const date = new Date(`${plan.day}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
  copy.append(node('b','',route.name),node('p','',`${date} · ${plan.time} · ${(route.metres/(metric?1000:1609.344)).toFixed(1)} ${metric?'km':'mi'}`));
  row.append(tile,copy);
  const acts = node('div','fr-plan-actions');
  const open = node('button','pill primary','View route'); open.type='button';
  open.addEventListener('click',()=>{if(current?.()!==false)onOpen?.(route.id);});
  const remove = node('button','pill','Remove'); remove.type='button'; remove.setAttribute('aria-label','Remove demo ride');
  remove.addEventListener('click',()=>{
    if(current?.()===false)return;
    try{clearPlan(owner,storage);card.remove();onRemove?.();}
    catch{card.querySelector('.fr-muted').textContent='Couldn’t remove the demo ride. Please try again.';}
  });
  acts.append(open,remove);
  card.append(heading,row,acts,node('p','fr-muted','Saved on this device. Demo planning.'));
  const workout=host.querySelector('[data-k="daycard"]');
  if(workout)workout.after(card);else host.prepend(card);
  return card;
}
