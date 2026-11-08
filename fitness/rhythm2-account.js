// One account-scoped controller shared by standalone Fitness and the InFlite module.
// The engine is lazy; classic Rhythm pays no extra planning or network cost.
export function createCoach({owner,inputs,importEngine,api,change=()=>{},hold=()=>{},onRecorded=()=>{}}){
 let engine=null,records=[],pending=null,generation=0,loadedFor=null,error=null;
 const current=()=>owner()||null;
 const valid=(id,g)=>current()===id&&generation===g;
 const ready=()=>!!engine&&loadedFor===current()&&!!current();
 async function load({refresh=false}={}){
  const id=current(),g=generation;if(!id)throw Error('Sign in to use Rhythm 2.0.');
  if(ready()&&!refresh)return state();if(pending)return pending;
  error=null;
  const p=Promise.all([engine||importEngine(),api.trainingRecords()]).then(([e,r])=>{if(!valid(id,g))throw Error('The signed-in account changed.');engine=e;records=r.records||[];loadedFor=id;change();return state();}).catch(e=>{if(valid(id,g)){error=e.message;change();}throw e;}).finally(()=>{if(pending===p)pending=null;});
  pending=p;return p;
 }
 const state=()=>({ready:ready(),loading:!!pending,error,records:ready()?records:[],engine});
 const plan=()=>ready()?engine.plan({...inputs(),records,resolveWorkout:id=>workout(id)||inputs().resolveWorkout?.(id)}):null;
 const workout=id=>{if(!ready()||!id)return null;const r=records.find(r=>'r2p:'+r.id===id);return r?engine.recordedWorkout(r,inputs().ftp):engine.workoutFromId(id,inputs().ftp);};
 async function record(day){
  const id=current(),g=generation;await load();if(!valid(id,g))throw Error("The signed-in account changed.");const p=plan(),d=p?.days.find(d=>d.date===day),w=d?.id&&(p.workouts[d.id]||workout(d.id));
  if(!w||!d||w.engine!=='rhythm-2.0')throw Error('Choose a Rhythm 2.0 session before recording it.');
  const original=w.prescriptionId?records.find(r=>r.id===w.prescriptionId):null;
  if(original?.day===engine.dayKey(day))return original;
  if(d.done)throw Error('Record a planned session before riding it.');
  const input=inputs();hold(true);try{const r=(await api.prescribe({day:engine.dayKey(day),ftp:original?.ftp||input.ftp,objective:original?.objective||p.objective,workout:original?.workout||w})).record;if(!valid(id,g))throw Error('The signed-in account changed.');records=[...records.filter(x=>x.id!==r.id),r];onRecorded(day,w.id,"r2p:"+r.id);change();return r;}finally{if(valid(id,g))hold(false);}
 }
 async function feedback(record,details,{power}={}){
  const id=current(),g=generation;await load();if(!valid(id,g))throw Error("The signed-in account changed.");if(!records.includes(record))throw Error("This session changed. Refresh sessions before reviewing it.");hold(true);try{const assessment=power?engine.assessPrescription(record,power):undefined;const r=(await api.sessionFeedback({id:record.id,revision:record.revision,...details,...(assessment?{assessment}:{})})).record;if(!valid(id,g))throw Error('The signed-in account changed.');records=records.map(x=>x.id===r.id?r:x);change();return r;}finally{if(valid(id,g))hold(false);}
 }
 function reset(){generation++;hold(false);records=[];loadedFor=null;pending=null;error=null;}
 return {load,state,ready,plan,workout,record,feedback,reset};
}
