// Map pins, generated loops, account route plans and GPX.
import { createLiveRoutes } from '../routes-live.js';
import { routeTraining } from '../routes-training.js';
export function view(el, ctx) {
  let owner = null, real = null;
  const make = () => {
    const id = ctx.fw.session.user.id;
    if (real && owner === id) return real;
    real?.destroy(); owner = id;
    const c = ctx.core;
    const hold = Symbol("route-save");
    real = createLiveRoutes(el,{owner:id,light:()=>ctx.fw.theme()==='light',current:()=>ctx.fw.session.user.id===id,metric:c.U.metric!==false,...routeTraining(c,ctx.S),
      openMapData: (body,onClose) => ctx.fw.sheet.open({sheet:"credits",title:"Map and Data",app:"fitness",body,onClose}),
      map: (host,o) => { if(!c.M.able())return Promise.reject(new Error('WebGL unavailable'));return c.M.routeMap(host,{...o,light:ctx.fw.theme()==='light'}); },
      onBusy:on=>c.hold(hold,on), onSaved:()=>ctx.refreshRoute?.(), onToday:()=>ctx.fw.nav.section('today'),
      onWeather: ctx.fw.workspace?.handoffs?.can('weather','ride') ? (route,day)=>ctx.checkWeather?.(route,day) : null });
    return real;
  };
  const openPending = () => { const plan=ctx.routeToOpen;if(plan){ctx.routeToOpen=null;make().open(plan.route,plan.imported ? undefined : plan);} };
  return { draw(){make().draw();openPending();},resume(){make().resume();openPending();},hide(){real?.hide();},destroy(){real?.destroy();real=null;} };
}
