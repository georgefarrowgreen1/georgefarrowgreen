// Lazy live Routes: current-location loops, account plans and GPX.
import { createLiveRoutes } from '../routes-live.js';
import { measure } from '../workouts.js';
export function view(el, ctx) {
  let owner = null, real = null;
  const make = () => {
    const id = ctx.fw.session.user.id;
    if (real && owner === id) return real;
    real?.destroy(); owner = id;
    const c = ctx.core, pid = c.plannedOn(c.TODAY), w = pid && pid !== 'event' ? c.wkById(pid) : null;
    const workout = w?.sport === 'ride' ? { name: w.name, minutes: Math.round(measure(w,c.paceFor(w.sport)).secs/60), effort: /recovery/i.test(w.name) ? 'recovery' : 'endurance' } : null;
    const speeds = ctx.S.acts.filter(a=>a.sport==='ride'&&!a.indoor).slice(-15).map(a=>{const s=c.sumOf(a);return s?.moving>900&&s.dist>1000 ? s.dist/s.moving*3.6 : 0;}).filter(v=>v>=10&&v<=40).sort((a,b)=>a-b);
    const hold = Symbol("route-save");
    real = createLiveRoutes(el,{owner:id,current:()=>ctx.fw.session.user.id===id,metric:c.U.metric!==false,workout,speed:speeds.length?speeds[Math.floor(speeds.length/2)]:22,speedFromHistory:!!speeds.length,
      openMapData: (body,onClose) => ctx.fw.sheet.open({sheet:"credits",title:"Map and Data",app:"fitness",body,onClose}),
      map: (host,o) => { if(!c.M.able())return Promise.reject(new Error('WebGL unavailable'));return c.M.routeMap(host,{...o,light:ctx.fw.theme()==='light'}); },
      onBusy:on=>c.hold(hold,on), onSaved:()=>ctx.refreshRoute?.(), onToday:()=>ctx.fw.nav.section('today')});
    return real;
  };
  const openPending = () => { const plan=ctx.routeToOpen;if(plan){ctx.routeToOpen=null;make().open(plan.route,plan);} };
  return { draw(){make().draw();openPending();},resume(){make().resume();openPending();},hide(){real?.hide();},destroy(){real?.destroy();real=null;} };
}
