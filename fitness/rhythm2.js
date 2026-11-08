// Rhythm 2: deterministic cycling planner. Recorded prescriptions are the evidence;
// uncertain data never counts as a failed workout or a reason to increase FTP.
import {DAY,addDays,startOfDay,mondayOf,measure,flatten} from './workouts.js';
import {tssOf} from './load.js';
import {classify,nightOf,targets,plan as classicPlan} from './rhythm.js';
import {efforts} from './efforts.js';
export const ENGINE='rhythm-2.0';
export const OBJECTIVES={balanced:'All-round riding',endurance:'Longer rides',threshold:'Sustained power',topend:'Hard efforts'};
// Evidence and our implementation choices are separated in docs/rhythm2-science.md.
export const RESEARCH=[
 {title:'Training balance · Rosenblat et al., 2025',url:'https://doi.org/10.1007/s40279-024-02149-3'},
 {title:'Cycling intervals · Norte et al., 2024',url:'https://doi.org/10.47206/ijsc.v4i1.271'},
 {title:'Interval duration · Schoenmakers et al., 2026',url:'https://doi.org/10.1186/s13102-026-01766-x'},
 {title:'Recovery signals · Schaffarczyk & Sperlich, 2026',url:'https://doi.org/10.3389/fspor.2026.1858271'}
];
const doseCeiling={threshold:2400,vo2:1200,sprint:120,durable:1800};
const controlledEffort={threshold:7,vo2:8,sprint:8,durable:7};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const dayKey=t=>{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const step=(kind,secs,from,name,to)=>({kind,secs:Math.round(secs),from,name,...(to==null?{}:{to})});
// Name the fitted session, rather than the original long-ride slot. Two hours
// is a wording convention, not a physiological threshold or a volume target.
function durationName(family,secs,name){
 if(secs<7200){
  if(family==='long'&&name==='Long endurance ride')return 'Endurance ride';
  if(family==='durable'&&name==='Long ride, sustained finish')return 'Endurance ride, sustained finish';
 }
 return name;
}
const latest=rows=>[...rows].sort((a,b)=>String(a.day).localeCompare(String(b.day))||(a.created||0)-(b.created||0)||String(a.id).localeCompare(String(b.id)));
const evidence=(records,family)=>latest(records.filter(r=>r.workout?.family===family&&r.feedback&&['completed','reduced'].includes(r.feedback.completion)&&!['traffic','time','equipment','other'].includes(r.feedback.reason)));
export function progression(records,family,ftp=null,today=null){
 if(today!=null)records=records.filter(r=>r.day>=dayKey(addDays(today,-42))&&r.day<=dayKey(today));
 const rows=evidence(records,family),last=rows.at(-1),dose=last?.workout?.dose;
 if(!dose)return {action:'start',why:'A conservative first session; tell Rhythm how it felt.'};
 if(ftp&&Math.abs(last.ftp/ftp-1)>.02)return {action:'hold',dose,why:'Your FTP setting changed; keep the work duration steady before progressing.'};
 const f=last.feedback;
 if(f.reason==='fatigue'&&f.completion==='completed'&&f.effort<9)return {action:'hold',dose,why:'Fatigue was reported; repeat the dose before progressing.'};
 if(f.completion==='reduced'||f.effort>=(family==='vo2'?10:9)||f.assessment?.status==='reduced')return {action:'reduce',dose,why:'Less work after a demanding session; your FTP stays unchanged.'};
 const increment=family==='vo2'?15:30,limit=Math.min(family==='vo2'?300:1200,doseCeiling[family]/dose.reps);
 if(dose.reps*dose.work>=doseCeiling[family]||family!=='sprint'&&dose.work+increment>limit)return {action:'hold',dose,why:'This session has reached its work ceiling; consolidate rather than keep adding intervals.'};
 const controlled=r=>r.feedback.completion==='completed'&&r.feedback.reason!=='fatigue'&&r.feedback.effort>=1&&r.feedback.effort<=(controlledEffort[family]||7)&&Math.abs(r.ftp/last.ftp-1)<=.02&&r.feedback.assessment?.status!=='uncertain'&&r.feedback.assessment?.status!=='reduced';
 const same=rows.slice(-2),differentDays=new Set(same.map(r=>r.day)).size===2;
 if(same.length===2&&differentDays&&same.every(controlled)&&same.every(r=>JSON.stringify(r.workout.dose)===JSON.stringify(dose)))return {action:'progress',dose,why:'Two controlled sessions at this dose: one small progression.'};
 return {action:'hold',dose,why:'Repeat this dose to build consistency before progressing.'};
}
export function riderModel({acts=[],records=[],today,ftp=200}){
 const recent=acts.filter(a=>a.sport==='ride'&&a.start>=addDays(today,-56)&&a.start<addDays(today,1)),power=recent.filter(a=>a.sum?.kind==='power'),count=power.length;
 records=records.filter(r=>r.day>=dayKey(addDays(today,-56))&&r.day<=dayKey(today));
 const weeksObserved=recent.length?Math.max(2,Math.min(8,(today-Math.min(...recent.map(a=>a.start))+DAY)/(7*DAY))):8;
 const confidence=count>=8?'established':count>=3?'developing':'limited';
 const hours=recent.reduce((n,a)=>n+(a.sum?.moving||a.sum?.secs||0)/3600,0)/weeksObserved;
 const best=secs=>Math.max(0,...power.map(a=>a.sum?.curve?.[secs]||0));
 const late=recent.filter(a=>a.sum?.late20>0&&a.sum?.moving>=7200);
 const profile=[
  {key:'endurance',name:'Endurance',value:recent.length?`${Math.round(Math.max(...recent.map(a=>(a.sum?.moving||a.sum?.secs||0)/60)))} min longest recent ride`:'Learning your comfortable riding time',confidence:recent.length>=6?'developing':'limited'},
  {key:'threshold',name:'Threshold endurance',value:best(1200)?`${Math.round(best(1200))} W observed for 20 min`:'Learning from sustained efforts',confidence:best(1200)?confidence:'limited'},
  {key:'vo2',name:'Hard-effort repeatability',value:`${evidence(records,'vo2').length} reviewed sessions`,confidence:evidence(records,'vo2').length>=3?'developing':'limited'},
  {key:'sprint',name:'Sprint ability',value:best(5)?`${Math.round(best(5))} W observed for 5 sec`:'No recent sprint evidence',confidence:best(5)?'developing':'limited'},
  {key:'durability',name:'Durability',value:late.length?`${Math.round(Math.max(...late.map(a=>a.sum.late20)))} W for 20 min after two hours`:'Learning from longer rides',confidence:late.length>=3?'developing':'limited'}
 ];
 return {ftp,hours,weeksObserved,recentRides:recent.length,powerRides:count,confidence,profile,progress:Object.fromEntries(['threshold','vo2','sprint','durable'].map(k=>[k,progression(records,k,ftp,today)]))};
}
export function compose(family,minutes,{model,ftp=200,progress={action:'start'},target,preserveDose=false}={}){
 const secs=Math.floor(minutes*60);if(secs<600)return null;
 let warm=Math.min(600,Math.round(secs*.2)),cool=Math.min(300,Math.round(secs*.1));const steps=[];
 let dose=null,work=0;
 if(['threshold','vo2','sprint','durable'].includes(family)){
  warm=Math.min(900,Math.max(600,warm));cool=Math.max(300,cool);
  const defaults={threshold:{reps:3,work:480,recovery:240,intensity:.95},vo2:{reps:4,work:180,recovery:180,intensity:1.12},sprint:{reps:4,work:15,recovery:180,intensity:1.6},durable:{reps:2,work:480,recovery:240,intensity:.9}};
  dose={...defaults[family],...(progress.dose||{})};
  if(progress.action==='progress'){if(family==='threshold'||family==='durable')dose.work+=30;else if(family==='vo2')dose.work+=15;else dose.reps=Math.min(8,dose.reps+1);}
  if(progress.action==='reduce')dose.reps=Math.max(2,dose.reps-1);
  if(!preserveDose){dose.work=Math.min(dose.work,family==='vo2'?300:1200,Math.floor(doseCeiling[family]/dose.reps/15)*15);}
  // Power changes do not also increase interval duration/repetitions in the same step.
  if(!progress.dose&&target&&family==='vo2')dose.intensity=clamp(target,1.06,1.22);
  const minimum=family==='durable'?3600:0;
  const cost=()=>dose.reps*dose.work+(dose.reps-1)*dose.recovery;
  if(progress.action==='progress'&&warm+cool+cost()+minimum>secs)return compose(family,minutes,{model,ftp,target,preserveDose,progress:{...progress,action:'hold',why:'Repeat your last dose; a progression needs a longer time slot.'}});
  while(dose.reps>2&&warm+cool+cost()+minimum>secs)dose.reps--;
  if(warm+cool+cost()+minimum>secs)return null;
  work=dose.reps*dose.work;
  steps.push(step('warmup',warm,.5,'Warm up',.72));
  const spare=secs-warm-cool-cost();
  if(family==='durable')steps.push(step('steady',spare,.65,'Endurance'));
  for(let n=0;n<dose.reps;n++){steps.push(step('work',dose.work,dose.intensity,family==='sprint'?'Controlled sprint':'Effort'));if(n<dose.reps-1)steps.push(step('rest',dose.recovery,.5,'Recover'));}
  if(spare>0&&family!=='durable')steps.push(step('steady',spare,.65,'Endurance'));
 }else{steps.push(step('warmup',warm,.45,'Warm up',.62),step('steady',secs-warm-cool,family==='recovery'?.48:.65,family==='recovery'?'Easy spin':'Endurance'));}
 steps.push(step('cooldown',cool,.6,'Cool down',.45));
 const interval=dose?`${Math.floor(dose.work/60)}${dose.work%60?':'+String(dose.work%60).padStart(2,'0'):''}`:'';
 const names={threshold:`Threshold ${dose?.reps} × ${interval} min`,vo2:`Hard efforts ${dose?.reps} × ${interval} min`,sprint:`Sprints ${dose?.reps} × ${dose?.work} sec`,durable:'Long ride, sustained finish',long:'Long endurance ride',endurance:'Endurance ride',recovery:'Recovery spin'};
 const kind={threshold:'Threshold',vo2:'VO₂ max',sprint:'Sprint',durable:'Durability',long:'Endurance',endurance:'Endurance',recovery:'Recovery'}[family];
 const code=dose?`${dose.reps}:${dose.work}:${dose.recovery}:${Math.round(dose.intensity*1000)}`:'0';
 return {id:`r2:${family}:${minutes}:${code}`,sport:'ride',family,kind,name:durationName(family,secs,names[family]),about:progress.why||'Comfortable, conversational riding. Adjust to how you feel.',steps,dose,workSecs:work,rhythm:true,engine:ENGINE,targetFtp:ftp};
}
export function assessPrescription(record,power){
 if(!Array.isArray(power)&&!ArrayBuffer.isView(power))return {status:'uncertain',why:'No power data; use your session feedback.'};
 const valid=Array.from(power).filter(v=>Number.isFinite(v)&&v>=0).length;
 if(!power.length||valid/power.length<.9)return {status:'uncertain',why:'Power data is incomplete; this does not count as a failed session.'};
 const w=record.workout,e=efforts(flatten(w),power,record.ftp);
 if(!e)return {status:'uncertain',why:'The recording cannot be confidently matched to this session.'};
 if(e.ratio>1.12)return {status:'uncertain',why:'The ride was harder than prescribed; extra power is not automatic progression.'};
 return {status:e.held===e.n?'held':'reduced',efforts:e.n,held:e.held,ratio:Math.round(e.ratio*1000)/1000,why:e.held===e.n?'The prescribed efforts were sustained.':'Some efforts were below target. Your feedback helps explain why.'};
}
export function recordedWorkout(record,currentFtp=record.ftp){
 const scale=record.ftp/currentFtp;
 return {...record.workout,name:durationName(record.workout.family,measure(record.workout).secs,record.workout.name),id:`r2p:${record.id}`,capturedFtp:record.ftp,prescriptionId:record.id,targetFtp:currentFtp,sourceId:record.workout.id,steps:record.workout.steps.map(s=>({...s,from:s.from*scale,...(s.to==null?{}:{to:s.to*scale})}))};
}
export function recoveryState({well={},feel={},records=[],today}){
 const check=feel[today],night=nightOf(well,today),values=check&&[check.sleep,check.legs,check.mood];
 const rest=!!values&&values.every(Number.isFinite)&&values.reduce((a,b)=>a+b,0)<=2;
 const poor=!!values&&values.some(x=>x===0);
 const fatigue=latest(records.filter(r=>r.day>=dayKey(addDays(today,-6))&&r.day<=dayKey(today)&&r.feedback?.reason==='fatigue'&&['completed','reduced'].includes(r.feedback.completion)));
 const repeated=new Set(fatigue.map(r=>r.day)).size>=2;
 const until=repeated?addDays(new Date(fatigue.at(-1).day+'T00:00:00').getTime(),7):null;
 // A lone HRV/RHR outlier cannot cancel quality work. Trends, sleep debt,
 // corroborating signals and the rider's own check-in carry more weight.
 const persistentLow=night?.trendLow&&Array.from({length:7},(_,i)=>well[addDays(today,-i)]?.hrv).filter(v=>v>0&&v<night.base.m-.5*night.base.sd).length>=4;
 const signals=!!(persistentLow||night?.debt||(night?.rhrUp&&(night?.hrvLow||night?.short)));
 return {rest,easy:rest||poor||signals||repeated,until,
  why:rest?'Your check-in calls for rest today':repeated?'Repeated fatigue reviews: keep riding easy while you recover':poor?'Your check-in calls for an easier ride':signals?'Your recovery trend calls for an easier ride':night?.hrvLow||night?.rhrUp?'One unusual reading: keep the plan and check how you feel during the warm-up':night?'Recovery readings support the plan; your warm-up and check-in still matter':'No recovery trend available; use your check-in and warm-up'};
}
const hardKinds=new Set(['sweet','threshold','vo2','thirty','sprint','durable','run-tempo','event']);
const focusedSeconds=w=>flatten(w).reduce((n,s)=>n+(s.kind==='work'?s.secs:0),0);
const observedWork=a=>a.reviewed?a.workSecs||0:a.sum?.kind==='power'&&a.sum?.zones?.length===7?a.sum.zones.slice(3).reduce((n,x)=>n+x,0):0;
export function plan(input){
 const {prefs={},acts=[],feel={},swaps={},well={},wet={},today,ftp=200,records=[]}=input;
 if(prefs.run||prefs.swim||prefs.event?.date>=today-7*DAY)return {...classicPlan(input),betaUnavailable:'The first beta supports ongoing cycling plans. Use classic Rhythm for events, running or swimming.'};
 const pastRecords=records.filter(r=>r.day<=dayKey(today));
 const model=riderModel({acts,records:pastRecords,today,ftp}),objective=OBJECTIVES[prefs.objective]?prefs.objective:prefs.lean==='endurance'?'endurance':prefs.lean==='punch'?'topend':'balanced';
 const reviewed=records.filter(r=>r.day<=dayKey(today)&&r.feedback&&['completed','reduced'].includes(r.feedback.completion)&&!acts.some(a=>a.sport==='ride'&&dayKey(a.start)===r.day)).map(r=>{const m=measure(r.workout),start=new Date(r.day+'T12:00:00').getTime();return {start,sport:'ride',reviewed:true,workSecs:focusedSeconds(r.workout),sum:{moving:m.secs,secs:m.secs,tss:m.tss,iF:m.iF,zones:['threshold','vo2','sprint','durable'].includes(r.workout.family)?[0,0,0,0,600,0,0]:undefined}};});
 const effective=[...acts,...reviewed];
 const days=prefs.days||[0,60,60,60,0,150,90],weekMins=days.reduce((a,b)=>a+b,0),recent=effective.filter(a=>a.start>=addDays(today,-56)&&a.start<addDays(today,1));
 const daily=new Map(),byDay=new Map();
 for(const a of recent){const d=startOfDay(a.start);daily.set(d,(daily.get(d)||0)+tssOf(a.sum,a.sport));if(!byDay.has(d))byDay.set(d,[]);byDay.get(d).push(a);}
 const activeDays=new Set(recent.filter(a=>a.sport==='ride'&&!a.reviewed).map(a=>startOfDay(a.start))).size,seed=activeDays<6;
 let ctl=seed?({none:5,some:15,regular:30,lots:45}[prefs.level]||10):0,atl=ctl;
 for(let d=addDays(today,-56);d<today;d=addDays(d,1)){const t=daily.get(d)||0;ctl+=(t-ctl)/42;atl+=(t-atl)/7;}
 const now={ctl,atl},line=[],out=[],workouts={};
 const lastHardActual=recent.filter(a=>hardKinds.has(classify(a))).sort((a,b)=>a.start-b.start).at(-1);
 let lastHard=lastHardActual?startOfDay(lastHardActual.start):-Infinity,hardCount=0,week=null,used=0,usedMins=0,usedWork=0;
 const hardDates=new Set(recent.filter(a=>hardKinds.has(classify(a))).map(a=>startOfDay(a.start)));
 const recovery=recoveryState({well,feel,records:pastRecords,today});
 const observedWeekly=recent.reduce((n,a)=>n+tssOf(a.sum,a.sport),0)/model.weeksObserved;
 const typicalMinutes=model.hours*60;
 const starting={none:90,some:180,regular:330,lots:480}[prefs.level]||150;
 const controlledRecent=pastRecords.filter(r=>r.day>=dayKey(addDays(today,-14))&&Math.abs(r.ftp/ftp-1)<=.02&&r.feedback?.completion==='completed'&&r.feedback.reason==='none'&&r.feedback.effort>=1&&r.feedback.effort<=(controlledEffort[r.workout.family]||7)&&r.feedback.assessment?.status!=='uncertain'&&r.feedback.assessment?.status!=='reduced');
 const growth=prefs.mode!=='hold'&&!recovery.easy&&new Set(controlledRecent.map(r=>r.day)).size>=2?1.05:1;
 const timeBudget=Math.min(weekMins,seed?starting:Math.max(60,typicalMinutes*growth));
 const loadBudget=seed?timeBudget*.65:Math.max(40,observedWeekly*growth);
 // This is a conservative product guardrail, not a measured LT1/LT2 split
 // or a claim that one 80/20 distribution is optimal for every rider.
 const workBudget=timeBudget*(objective==='threshold'?.25:.2)*60;
 const maxHard=seed||objective==='endurance'?1:2,theme=objective==='topend'?'topend':objective==='threshold'?'threshold':'aerobic';
 const block={index:0,theme,week:0,absorb:!!recovery.until};
 const start=Math.max(mondayOf(today),startOfDay(prefs.at??today));
 for(let d=start;d<=addDays(today,13);d=addDays(d,1)){
  const mon=mondayOf(d),done=byDay.get(d)||[],key=dayKey(d),record=latest(records.filter(r=>r.day===key)).at(-1);
  if(week!==mon){week=mon;used=0;usedMins=0;usedWork=0;hardCount=0;for(const a of recent.filter(a=>a.start>=mon&&a.start<today)){used+=tssOf(a.sum,a.sport);usedMins+=(a.sum?.moving||a.sum?.secs||0)/60;usedWork+=observedWork(a);if(hardKinds.has(classify(a)))hardCount++;}}
  const dateBase={date:d,block,done:done.length>0,missed:false,hard:false,mins:0,tss:0,id:null,strength:false,fuel:null,moved:false};
  if(d<today){const w=record?recordedWorkout(record,ftp):null;if(w)workouts[w.id]=w;out.push({...dateBase,id:w?.id||null,kind:w?.family||'rest',why:record?'Your recorded session':'Activity history; no session was issued'});continue;}
  line.push({date:d,ctl, future:d>today});
  const slot=days[(new Date(d).getDay()+6)%7]||0;
  const exhausted=d===today&&recovery.rest,recover=d===today&&recovery.easy||recovery.until!=null&&d<recovery.until;
  let kind='rest',why=!slot?'Your chosen rest day':'Training load is already covered; recover for the next ride',w=null;
  const remaining=Math.max(0,timeBudget-usedMins),budget=Math.max(0,loadBudget-used);
  const dow=(new Date(d).getDay()+6)%7,slotsLeft=days.slice(dow).reduce((n,x)=>n+x,0)||1;
  const share=remaining*slot/slotsLeft;
  let available=Math.min(slot,Math.floor(remaining/5)*5,Math.max(15,Math.floor(share/5)*5));
  const tired=atl-ctl>Math.max(15,ctl*.7);
  const long=slot>=90&&slot===Math.max(...days);
  if(done.length){kind=classify(done[0]);why=done.some(a=>a.reviewed)?'Your reviewed ride counts towards the plan':'Your actual riding counts towards the plan';if(record&&done.some(a=>a.reviewed)){w=recordedWorkout(record,ftp);kind=w.family;}}
  else if(record){w=recordedWorkout(record,ftp);kind=w.family;why='Your recorded prescription; its original targets are preserved';}
  else if(exhausted){why='Your check-in calls for rest today';}
  else if(available>=15&&budget>=8){
   const rollingHard=[...hardDates].filter(x=>x>=addDays(d,-6)&&x<=d).length;
   const quality=slot>=35&&remaining>=35&&d-lastHard>=2*DAY-3600e3&&hardCount<maxHard&&rollingHard<maxHard&&!recover&&!tired&&!long;
   // Keep the focus across week boundaries instead of always restarting with
   // threshold on Monday. Actual, reviewed and future planned work all count.
   const previous=out.filter(x=>x.hard&&x.date<d).at(-1)?.kind||lastHardActual&&classify(lastHardActual);
   kind=quality?(objective==='topend'?(previous==='vo2'?'sprint':'vo2'):objective==='threshold'?'threshold':previous==='threshold'?'vo2':'threshold'):recover||tired?'recovery':long?'long':'endurance';
   why=quality?`${OBJECTIVES[objective]}: ${model.progress[kind]?.why||'A focused session with recovery around it.'}`:recover?recovery.why:tired?'Easy riding while recent training settles':rollingHard>=maxHard?'Your last seven days already include enough focused sessions':long?'Build comfortable time on the bike':'Aerobic riding between your focused sessions';
   if(quality)available=Math.min(slot,Math.floor(remaining/5)*5,Math.max(35,available));
   const dayBudget=quality?Math.min(budget,Math.max(40,budget*slot/slotsLeft)):budget*slot/slotsLeft;
   const progress=model.progress[kind]||{action:'start'};
   for(let mins=available;mins>=15;mins-=5){let candidate=compose(kind,mins,{model,ftp,progress});if(candidate&&progress.action==='progress'&&(measure(candidate).tss>dayBudget||usedWork+focusedSeconds(candidate)>workBudget))candidate=compose(kind,mins,{model,ftp,progress:{...progress,action:'hold',why:'Repeat this dose to keep the week’s focused work manageable.'}});if(candidate&&measure(candidate).tss<=dayBudget&&(!focusedSeconds(candidate)||usedWork+focusedSeconds(candidate)<=workBudget)){w=candidate;break;}}
   if(w&&quality)why=`${OBJECTIVES[objective]}: ${w.about}`;
   if(!w&&quality){kind='endurance';why='Easy riding keeps focused work within this week’s time and recovery limits';for(let mins=available;mins>=15;mins-=5){const c=compose(kind,mins,{ftp});if(c&&measure(c).tss<=dayBudget){w=c;break;}}}
  }
  if(Object.prototype.hasOwnProperty.call(swaps,d)){w=input.resolveWorkout?.(swaps[d])||null;kind=w?.family||(/^rh:([a-z]+):/.exec(w?.id||'')?.[1])||(w&&measure(w).iF>=.84?'threshold':w?'endurance':'rest');why='Your manual choice';}
  if(w){const stats=measure(w);workouts[w.id]=w;const hard=['threshold','vo2','sprint','durable'].includes(kind);used+=stats.tss;usedMins+=stats.secs/60;usedWork+=focusedSeconds(w);if(hard){lastHard=d;hardCount++;hardDates.add(d);}out.push({...dateBase,id:w.id,kind,mins:stats.secs/60,tss:Math.round(stats.tss),hard,why,confidence:model.confidence,prescriptionId:records.find(r=>r.id===w.prescriptionId&&r.day===key)?.id||null,objective,provisional:!w.prescriptionId});ctl+=(stats.tss-ctl)/42;atl+=(stats.tss-atl)/7;}
  else{const t=done.reduce((n,a)=>n+tssOf(a.sum,a.sport),0);used+=t;usedMins+=done.reduce((n,a)=>n+(a.sum?.moving||a.sum?.secs||0)/60,0);usedWork+=done.reduce((n,a)=>n+observedWork(a),0);if(done.some(a=>hardKinds.has(classify(a)))){lastHard=d;hardCount++;hardDates.add(d);}out.push({...dateBase,kind:done.length?kind:'rest',why:done.length?why:slot&&available<15?'Your week already includes the planned riding time':why});ctl+=(t-ctl)/42;atl+=(t-atl)/7;}
 }
 return {engine:ENGINE,label:"Rhythm · "+OBJECTIVES[objective],days:out,today:out.find(d=>d.date===today)||null,block,ctl:now.ctl,atl:now.atl,seeded:seed,line,cpw:null,targets:targets(null),adjust:{said:[]},ftpSeen:null,event:null,model,objective,workouts,weekly:{minutes:Math.round(timeBudget),tss:Math.round(loadBudget),workMinutes:Math.round(workBudget/60),maxHard},recovery,research:RESEARCH,beta:true};
}
export function workoutFromId(id,ftp=200){
 const m=/^r2:(threshold|vo2|sprint|durable|long|endurance|recovery):(\d+):(0|\d+:\d+:\d+:\d+)$/.exec(id||'');if(!m)return null;
 const minutes=Number(m[2]);if(minutes<10||minutes>600)return null;
 const a=m[3].split(':').map(Number),dose=a.length===4?{reps:a[0],work:a[1],recovery:a[2],intensity:a[3]/1000}:null;
 if(dose&&(!Number.isInteger(dose.reps)||dose.reps<2||dose.reps>8||dose.work<10||dose.work>1200||dose.recovery<60||dose.recovery>600||dose.intensity<.5||dose.intensity>2.5))return null;
 return compose(m[1],minutes,{ftp,progress:dose?{action:'hold',dose}:{action:'start'},preserveDose:true});
}
