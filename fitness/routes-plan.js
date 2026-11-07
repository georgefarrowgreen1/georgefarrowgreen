// A local demo ride on Fitness's Today screen. Separate from real training state.
import { ROUTES, readPlan, clearPlan } from './routes-store.js';
export function renderPlanCard(host, { owner, metric = true, onOpen, onRemove, storage, current } = {}) {
  const previous = host.querySelector('[data-k="route-demo-plan"]');
  const plan = readPlan(owner, storage), route = plan && ROUTES.find(r => r.id === plan.routeId);
  const stamp = plan && JSON.stringify([owner,plan,metric]);
  if (previous?.dataset.planStamp === stamp) return previous;
  previous?.remove();
  if (!route) return null;
  const doc = host.ownerDocument, node = (tag, cls, text) => { const n = doc.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
  const card = node('section', 'fr-plan-summary'); card.dataset.k = 'route-demo-plan'; card.dataset.planStamp = stamp; card.setAttribute('aria-label', 'Demo ride plan');
  const date = new Date(`${plan.day}T12:00:00`).toLocaleDateString(undefined, { weekday:'short',day:'numeric',month:'short' });
  card.append(node('span','fr-tag','Routes demo'), node('h2','',route.name), node('p','',`${date} · ${plan.time} · ${(route.metres/(metric ? 1000 : 1609.344)).toFixed(1)} ${metric ? 'km' : 'mi'}`), node('p','fr-muted','Saved on this device. Demo planning.'));
  const acts = node('div','fr-plan-actions');
  const open = node('button','fr-btn fr-primary','View route'); open.type = 'button'; open.addEventListener('click', () => { if (current?.() !== false) onOpen?.(route.id); });
  const remove = node('button','fr-btn','Remove demo ride'); remove.type = 'button'; remove.addEventListener('click', () => {
    if (current?.() === false) return;
    try { clearPlan(owner, storage); card.remove(); onRemove?.(); }
    catch { card.querySelector('.fr-muted').textContent = 'Couldn’t remove the demo ride. Please try again.'; }
  });
  acts.append(open,remove); card.append(acts); host.prepend(card); return card;
}
