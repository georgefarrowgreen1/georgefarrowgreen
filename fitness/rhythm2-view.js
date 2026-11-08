// The experimental planner has one control. Training stays in Fitness's normal views.
import {h,svg} from './ui.js';
let serial=0;
export function experimentalLogo(){
 const id=`experimental-${++serial}`;
 return svg(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 48 48" aria-hidden="true" data-logo="experimental"><defs><linearGradient id="${id}" x2="1" y2="1"><stop stop-color="#8472ff"/><stop offset="1" stop-color="#3531a3"/></linearGradient><linearGradient id="${id}-orbit" x2="1" y2="1"><stop stop-color="#a7fff1"/><stop offset="1" stop-color="#98baff"/></linearGradient></defs><rect x="1" y="1" width="46" height="46" rx="13" fill="url(#${id})"/><rect x="1.5" y="1.5" width="45" height="45" rx="12.5" fill="none" stroke="#fff" stroke-opacity=".2"/><g fill="none" stroke="url(#${id}-orbit)" stroke-width="2.1"><ellipse cx="24" cy="24" rx="17" ry="7.5" transform="rotate(-38 24 24)"/><ellipse cx="24" cy="24" rx="17" ry="7.5" transform="rotate(38 24 24)"/></g><path d="m24 16 2.4 5.6L32 24l-5.6 2.4L24 32l-2.4-5.6L16 24l5.6-2.4Z" fill="#fff"/><circle cx="36.8" cy="13.6" r="2.7" fill="#a7fff1"/></svg>`);
}
export function experimentalPatch({rhythm,swaps={}},on,today){
 if(!rhythm)throw Error('Set up your riding week before enabling Experimental.');
 if(on&&(rhythm.run||rhythm.swim||rhythm.event?.date>=today-7*86400e3))throw Error('Experimental is available for ongoing cycling plans.');
 const patch={rhythm:{...rhythm,engine:on?2:1}};
 if(!on)patch.swaps=Object.fromEntries(Object.entries(swaps).filter(([day,id])=>+day<today||!String(id).startsWith('r2')));
 return patch;
}
export function createExperimentalControl({coach,state,save,owner,today,refresh=()=>{},notify=()=>{}}){
 const user=owner();let busy=false,pending=false;
 const update=()=>{input.checked=busy?pending:state().rhythm?.engine===2;input.disabled=busy||!user||owner()!==user;};
 const input=h('input',{type:'checkbox',role:'switch','aria-label':'Experimental',onchange:async()=>{
  if(!user||busy||owner()!==user){update();return;}
  pending=input.checked;busy=true;update();
  try{
   experimentalPatch(state(),pending,today());
   if(pending)await coach.load();
   if(owner()!==user)throw Error('The signed-in account changed.');
   await save(experimentalPatch(state(),pending,today()));
  }catch(e){if(owner()===user)notify(e.message);}
  finally{busy=false;update();if(owner()===user)refresh();}
 }});
 const control=h('span.experimental-switch',{},input,h('span.experimental-track',{'aria-hidden':'true'}));
 update();return {control,update};
}
