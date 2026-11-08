import {coach,S,P,TODAY,keep,load,perSecond,actsOn} from './core.js';
import {h,row,section,openSheet,Sheet,toast,redraw} from './fxui.js';
import {createRhythm2View} from '../rhythm2-view.js';
export async function openRhythm2(ctx){
 try{await coach.load();}catch(e){ctx.fw.toast(e.message);return;}
 const owner=S.me?.id;
 const view=createRhythm2View({h,row,section,coach,prefs:()=>S.rhythm,setPrefs:p=>{if(S.me?.id!==owner)return;if(S.rhythm?.engine===2&&p.engine!==2){for(const [d,id]of Object.entries(S.swaps))if(+d>=TODAY&&String(id).startsWith("r2"))delete S.swaps[d];keep("swaps");}S.rhythm=p;keep('rhythm');redraw('plan');},today:()=>TODAY,acts:()=>S.own,loadPower:async id=>{const a=S.own.find(a=>a.id===id);return perSecond(await load(a)).pwr;},refresh:()=>{if(S.me?.id===owner)Sheet.redraw?.();},notify:toast,setup:()=>ctx.open.rhythmSetup()});
 openSheet(view,{sheet:'rhythm2'});
}
