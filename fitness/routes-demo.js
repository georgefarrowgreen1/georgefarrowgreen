// The Routes demo: pure local planning, real cached geometry, optional street map.
// Called by the Fitness module and the standalone preview. No activity/API writes.
import { ROUTES, routeOf, geometry, estimate, recommendations, profile, toGPX, sampleWeather } from './routes-model.js';
import { readPlan, savePlan, localDay, validDay } from './routes-store.js';
import { renderPlanCard } from './routes-plan.js';
const NS = 'http://www.w3.org/2000/svg';
export function createRoutesView(root, opts = {}) {
  const doc = root.ownerDocument, owner = opts.owner || 'preview';
  const current = () => !dead && root.isConnected && opts.current?.() !== false;
  let dead = false, active = null, mapHandle = null, mapTicket = 0, mapTimer = 0, mapReady = false, cursorPoint = null;
  let target = Number(opts.workout?.minutes) || 90, surface = 'all', effort = opts.workout?.effort || 'endurance';
  let planDay = localDay(opts.now?.()), planTime = '09:00', rendered = false;
  const metric = opts.metric !== false, speed = opts.speed || 22;
  const abort = new AbortController();
  const e = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const svgEl = (tag, attrs = {}) => { const n = doc.createElementNS(NS,tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v)); return n; };
  const distance = m => `${(m / (metric ? 1000 : 1609.344)).toFixed(1)} ${metric ? 'km' : 'mi'}`;
  const climb = m => `${Math.round(metric ? m : m * 3.28084)} ${metric ? 'm' : 'ft'}`;
  const duration = mins => mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}` : `${mins} min`;
  function button(label, run, cls = '') {
    const b = e('button',`fr-btn ${cls}`,label); b.type = 'button';
    b.addEventListener('click', () => { if (current()) run(); }, { signal: abort.signal }); return b;
  }
  const tag = text => e('span','fr-tag',text);
  const credit = () => e('p','fr-credit','Sample routes calculated with BRouter using OpenStreetMap data (ODbL). Elevation, surfaces and ride times are estimates; access can change.');
  function outline(route, mini = false) {
    const g = geometry(route), svg = svgEl('svg',{viewBox:'0 0 300 300',class:mini ? 'fr-mini-route' : 'fr-route-outline','aria-hidden':'true'});
    svg.append(svgEl('path',{d:g.path,class:'fr-route-halo'}),svgEl('path',{d:g.path,class:'fr-route-line'}));
    const [x,y] = g.positions[0]; svg.append(svgEl('circle',{cx:x,cy:y,r:6,class:'fr-route-start'}));
    return svg;
  }
  function clearMap() {
    mapTicket++; clearTimeout(mapTimer); mapTimer = 0; mapReady = false; cursorPoint = null;
    mapHandle?.remove(); mapHandle = null;
  }
  function setupMap(route, host, fallback, message, retry) {
    if (!opts.map || !current()) return;
    const ticket = ++mapTicket;
    message.textContent = 'Loading street map…'; retry.hidden = true;
    const failed = () => {
      if (ticket !== mapTicket || !current()) return;
      mapTicket++; clearTimeout(mapTimer); mapHandle?.remove(); mapHandle = null; host.replaceChildren(); mapReady = false;
      fallback.hidden = false; message.textContent = 'Street map unavailable. The route outline and GPX still work.'; retry.hidden = false;
    };
    mapTimer = setTimeout(failed, 12000);
    Promise.resolve().then(() => opts.map(host, { coords: geometry(route).coords.map(c => c.slice(0,2)), explore:true, tint:'#ef704d' })).then(g => {
      if (ticket !== mapTicket || !current()) { g?.remove(); return; }
      mapHandle = g;
      const ready = () => {
        if (ticket !== mapTicket || !current()) return;
        clearTimeout(mapTimer); mapReady = true; if (cursorPoint) Promise.resolve(mapHandle?.at?.(cursorPoint)).catch(()=>{}); fallback.hidden = true; message.textContent = 'Street map · OpenFreeMap / OpenStreetMap'; retry.hidden = true;
      };
      if (g.map?.loaded?.()) ready(); else if (g.map?.once) g.map.once('load',ready); else ready();
    }).catch(failed);
  }
  function chooseSelect(label, values, value, onChange) {
    const wrap = e('label','fr-field'), s = e('select'); s.setAttribute('aria-label',label); wrap.append(e('span','',label),s);
    for (const [v,text] of values) { const o = e('option','',text); o.value = String(v); s.append(o); }
    s.value = String(value); s.addEventListener('change', () => { if (current()) onChange(s.value); }, {signal:abort.signal}); return wrap;
  }
  function cards(list) {
    list.replaceChildren();
    const ranked = recommendations({minutes:target,surface,effort,speed});
    for (const [i,fit] of ranked.entries()) {
      const { route } = fit, b = button('', () => open(route.id), 'fr-route-card'); b.dataset.route = route.id;
      const body = e('span','fr-route-copy');
      const chips = e('span','fr-card-tags');
      if (!i) chips.append(tag(fit.fit ? 'Best fit' : 'Closest to your time'));
      chips.append(e('span','fr-surface',route.surface === 'road' ? 'Road-biased' : 'Mixed surface'));
      body.append(chips,e('b','',route.name),e('span','fr-route-stats',`${distance(route.metres)} · ↑ ${climb(route.ascent)} · ≈ ${duration(fit.duration)}`),e('small','',fit.why));
      b.append(outline(route,true),body,e('span','fr-chevron','›')); list.append(b);
    }
  }
  function showList(focus = false) {
    clearMap(); active = null; rendered = true; root.replaceChildren(); root.classList.add('fr-routes');
    const intro = e('div','fr-intro'); intro.append(tag('Routes demo'),e('h2','','A route for your ride'),e('p','','Real routes around Richmond and Surrey, matched to the time you have.'));
    const context = e('section','fr-context');
    context.append(e('span','fr-location','Richmond Gate, London · sample starting point'),e('b','',opts.workout?.name || 'Sample endurance ride'),e('p','fr-muted',`${opts.workout && !opts.sampleWorkout ? 'Your planned ride' : 'Sample session'} · ${duration(target)}${opts.speedFromHistory ? ' · estimates use recent outdoor ride speed' : ''}`));
    const controls = e('div','fr-filters');
    const minutes = [...new Set([30,45,60,75,90,120,180,target])].sort((a,b)=>a-b);
    controls.append(chooseSelect('Time available',minutes.map(v=>[v,duration(v)]),target,v=>{target=Number(v);cards(list);}),
      chooseSelect('Surface',[['all','All surfaces'],['road','Road-biased'],['mixed','Mixed surface']],surface,v=>{surface=v;cards(list);}));
    const list = e('div','fr-route-list'); list.setAttribute('aria-label','Suggested routes');
    root.append(intro,context,controls,list,credit());
    renderPlanCard(root,{owner,metric,storage:opts.storage,onOpen:open,onRemove:()=>opts.onPlan?.(null)});
    cards(list);
    if (focus) root.querySelector('h2')?.setAttribute('tabindex','-1');
    if (focus) root.querySelector('h2')?.focus({preventScroll:true});
  }
  function open(id) {
    const route = routeOf(id); if (!route || !current()) return;
    active = id; clearMap(); root.replaceChildren();
    root.append(button('‹ All routes',()=>showList(true),'fr-back'));
    const heading = e('div','fr-detail-title'); heading.append(tag('Routes demo'),e('h2','',route.name),e('p','',route.description)); root.append(heading);
    const map = e('section','fr-map'); map.setAttribute('aria-label',`${route.name} route map`);
    const canvas = e('div','fr-map-canvas'), fallback = e('div','fr-map-fallback'); fallback.append(outline(route));
    const mapFoot = e('div','fr-map-foot'), mapMessage = e('span','','Route outline · real GPX geometry');
    const retry = button('Try street map',()=>setupMap(route,canvas,fallback,mapMessage,retry),'fr-small'); retry.hidden = !opts.map;
    mapFoot.append(mapMessage,retry); map.append(canvas,fallback,mapFoot); root.append(map);
    const stats = e('dl','fr-stats');
    for (const [label,value] of [['Distance',distance(route.metres)],['Climbing',climb(route.ascent)],['Est. time',duration(estimate(route,speed))]]) { const cell=e('div');cell.append(e('dt','',label),e('dd','',value));stats.append(cell); } root.append(stats);
    const fit = recommendations({minutes:target,effort,speed}).find(x=>x.route.id===id);
    const why = e('section','fr-insight'); why.append(e('b','','Fits the ride you have in mind?'),e('p','',fit.why),e('small','',`Estimated at ${Math.round(metric ? speed : speed / 1.609344)} ${metric ? 'km/h' : 'mph'}, with a climbing allowance and a five-minute pause. Effort and traffic will change this.`)); root.append(why);
    const elev = e('section','fr-elevation'); elev.append(e('h3','','Look at the climbs'));
    const g = geometry(route), pr = profile(route), chart = svgEl('svg',{viewBox:'0 0 600 130',class:'fr-profile','aria-hidden':'true'});
    chart.append(svgEl('path',{d:`${pr.path}L600,130L0,130Z`,class:'fr-profile-area'}),svgEl('path',{d:pr.path,class:'fr-profile-line'}));
    const cursor = svgEl('line',{x1:0,x2:0,y1:0,y2:130,class:'fr-profile-cursor'}); chart.append(cursor);
    const scrub = e('input','fr-scrub'); scrub.type='range';scrub.min='0';scrub.max=String(g.coords.length-1);scrub.value='0';scrub.step='1';scrub.setAttribute('aria-label','Inspect route distance');
    const readout = e('output','fr-profile-readout'), marker = svgEl('circle',{r:7,class:'fr-route-marker'}); fallback.querySelector('svg').append(marker);
    const move = () => { const i=Number(scrub.value), [x,y]=g.positions[i];marker.setAttribute('cx',String(x));marker.setAttribute('cy',String(y)); const at=g.distances[i]/g.metres*600;cursor.setAttribute('x1',String(at));cursor.setAttribute('x2',String(at));readout.textContent=`${distance(g.distances[i])} into the route · ${climb(g.coords[i][2])} elevation`;scrub.setAttribute('aria-valuetext',readout.textContent);cursorPoint=g.coords[i].slice(0,2);if(mapReady) Promise.resolve(mapHandle?.at?.(cursorPoint)).catch(()=>{});};
    scrub.addEventListener('input',move,{signal:abort.signal});move();elev.append(chart,scrub,readout);root.append(elev);
    const surfaceInfo = e('p','fr-surface-info',`${route.paved}% mapped paved · ${route.unknown}% surface unknown · ${route.surface==='road' ? 'Road-biased cycling profile' : 'Roads and park paths'}.`);root.append(surfaceInfo);
    const form=e('form','fr-planner');form.append(e('h3','','Make it your next ride'),e('p','fr-muted','Demo planning is saved for this account on this device.'));
    const fields=e('div','fr-plan-fields'), dateLabel=e('label','fr-field'), date=e('input');date.type='date';date.value=planDay;date.min=localDay(opts.now?.());date.required=true;dateLabel.append(e('span','','Ride day'),date);
    const timeLabel=e('label','fr-field'), time=e('input');time.type='time';time.value=planTime;time.required=true;timeLabel.append(e('span','','Departure'),time);fields.append(dateLabel,timeLabel);form.append(fields);
    const weather=e('div','fr-sample-weather');
    const showWeather=()=>{planTime=time.value;planDay=date.value;const w=sampleWeather(time.value);weather.replaceChildren(tag('Sample weather'),e('b','',w.label),e('span','',w.detail),e('small','','Illustrative forecast for the demo, not a live prediction.'));};
    date.addEventListener('change',showWeather,{signal:abort.signal});time.addEventListener('input',showWeather,{signal:abort.signal});showWeather();form.append(weather);
    const status=e('p','fr-feedback');status.setAttribute('role','status');
    const save=e('button','fr-btn fr-primary','Add demo ride to Fitness Today');save.type='submit';
    const next=button('Open Fitness Today',()=>opts.onToday?.(),'fr-text-btn');next.hidden=true;
    form.append(save,next,status);form.addEventListener('submit',event=>{event.preventDefault();if(!current())return;
      if(!validDay(date.value)||date.value<localDay(opts.now?.())){status.textContent='Choose today or a future ride day.';return;}
      try{const p=savePlan(owner,{v:1,routeId:id,day:date.value,time:time.value},opts.storage);status.textContent='Demo ride saved. Find it on Fitness Today.';next.hidden=!opts.onToday;save.textContent='Update demo ride';opts.onPlan?.(p);}
      catch{status.textContent='Couldn’t save the demo ride on this device. Please try again.';}
    },{signal:abort.signal});root.append(form);
    const exportButton=button('Export GPX',()=>{
      const blob=new Blob([toGPX(route)],{type:'application/gpx+xml'}), url=URL.createObjectURL(blob), a=e('a');a.href=url;a.download=`inflite-${route.id}.gpx`;root.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
    });root.append(exportButton,credit());
    if(opts.map)setupMap(route,canvas,fallback,mapMessage,retry);
    const title=heading.querySelector('h2');title.tabIndex=-1;title.focus({preventScroll:true});
  }
  return {
    draw(){if(current()&&!rendered)showList();},
    resume(){if(!current())return;if(active&&!mapHandle)open(active);},
    hide(){clearMap();},
    destroy(){dead=true;abort.abort();clearMap();root.replaceChildren();},
    open,
    get active(){return active;},
  };
}
