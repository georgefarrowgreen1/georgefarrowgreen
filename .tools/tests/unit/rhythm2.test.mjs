import {test} from 'node:test';import assert from 'node:assert/strict';
import {plan,compose,progression,recordedWorkout,riderModel,assessPrescription,dayKey,workoutFromId,recoveryState} from '../../../fitness/rhythm2.js';
import {createCoach} from '../../../fitness/rhythm2-client.js';
import {measure,flatten,DAY,addDays} from '../../../fitness/workouts.js';
const today=new Date(2026,10,9).getTime(),prefs={days:[0,60,60,60,0,150,90],level:'some',mode:'build',objective:'balanced',at:today};
const workout=compose('threshold',60),dose=workout.dose;
const record=(days,feedback={completion:'completed',effort:6,reason:'none'},extra={})=>({id:'a'.repeat(24),day:dayKey(addDays(today,-days)),ftp:200,workout,feedback,revision:0,created:today-days*DAY,...extra});
test('sessions exactly fit the slot, keep recoveries between efforts, and round-trip their ids',()=>{
 for(const family of ['threshold','vo2','sprint','durable','long','endurance','recovery'])for(const minutes of [15,30,35,45,60,90,150]){const w=compose(family,minutes);if(!w)continue;assert.equal(measure(w).secs,minutes*60);assert.deepEqual(workoutFromId(w.id).steps,w.steps);assert.ok(w.steps.every(s=>s.secs>0));for(let i=1;i<w.steps.length;i++)assert.ok(!(w.steps[i].kind==='work'&&w.steps[i-1].kind==='work'));}
});
test('long-ride labels follow the final duration, including shortened ids and saved prescriptions',()=>{
 for(const minutes of [40,60,90,115,120,150]){
  const w=compose('long',minutes);
  assert.equal(w.name,minutes<120?'Endurance ride':'Long endurance ride');
  assert.equal(measure(w).secs,minutes*60);
  assert.equal(workoutFromId(w.id).name,w.name);
  assert.equal(workoutFromId(w.id).id,w.id);
 }
 const old={id:'old-long',ftp:200,workout:{...compose('long',60),name:'Long endurance ride'}};
 const before=JSON.stringify(old),shown=recordedWorkout(old);
 assert.equal(shown.name,'Endurance ride');
 assert.deepEqual(shown.steps,old.workout.steps);
 assert.equal(shown.sourceId,old.workout.id);
 assert.equal(JSON.stringify(old),before,'the saved prescription is unchanged');
 const named={...old,workout:{...old.workout,name:'Sunday coffee loop'}};
 assert.equal(recordedWorkout(named).name,'Sunday coffee loop');
 assert.equal(compose('durable',100).name,'Endurance ride, sustained finish');
 assert.equal(compose('durable',120).name,'Long ride, sustained finish');
 const p=plan({prefs:{...prefs,mode:'hold',days:[150,0,0,0,0,150,150]},today});
 assert.ok(p.today.mins>0&&p.today.mins<120,'the weekly limits shorten the long-ride slot');
 assert.equal(p.workouts[p.today.id].name,'Endurance ride');
 assert.ok(p.days.filter(d=>d.date>=today&&d.date<addDays(today,7)).reduce((n,d)=>n+d.mins,0)<=p.weekly.minutes);
});
test('progression needs two independent controlled reviews at the same dose; difficulties, uncertainty and interruptions differ',()=>{
 assert.equal(progression([record(7)],'threshold').action,'hold');
 const progress=progression([record(14),record(7)],'threshold');assert.equal(progress.action,'progress');const w=compose('threshold',60,{progress});assert.equal(w.dose.intensity,dose.intensity);assert.equal(w.dose.reps,dose.reps);assert.equal(w.dose.work,dose.work+30);
 assert.equal(progression([record(7),record(7)],'threshold').action,'hold');
 assert.equal(progression([record(7,{completion:'completed',effort:9,reason:'none'})],'threshold').action,'reduce');
 assert.equal(progression([record(7,{completion:'reduced',effort:9,reason:'traffic'})],'threshold').action,'start');
 assert.equal(progression([record(14),record(7,{completion:'completed',effort:6,reason:'none',assessment:{status:'uncertain'}})],'threshold').action,'hold');
});
test('recorded watts survive later FTP changes and imported power gaps are not training failures',()=>{
 const r=record(0),w=recordedWorkout(r,300);assert.equal(w.steps.find(s=>s.kind==='work').from*300,190);assert.equal(r.workout.steps.find(s=>s.kind==='work').from,.95);
 assert.equal(assessPrescription(r,Array(3600).fill(null)).status,'uncertain');assert.equal(assessPrescription(r,null).status,'uncertain');
 const power=flatten(workout).flatMap(s=>Array(Math.round(s.secs)).fill(((s.from+s.to)/2)*200));const assessment=assessPrescription(r,power);assert.equal(assessment.status,'held');assert.equal(assessment.held,workout.dose.reps);
});
test('sparse history stays explicit and absence of hard efforts never lowers FTP',()=>{
 const model=riderModel({acts:[],records:[],today,ftp:250});assert.equal(model.confidence,'limited');assert.equal(model.ftp,250);assert.ok(model.profile.every(p=>p.confidence==='limited'));
 const p=plan({prefs,acts:[],today,ftp:250});assert.equal(p.ftpSeen,null);assert.equal(p.engine,'rhythm-2.0');assert.ok(p.seeded);
});
test('plans respect each day, weekly time/load budgets and hard-day recovery including an unplanned ride',()=>{
 const acts=Array.from({length:16},(_,i)=>({id:'ride'+i,start:today-(i*3+1)*DAY,sport:'ride',sum:{moving:5400,tss:65,kind:'power',iF:.7}}));
 for(const objective of ['balanced','endurance','threshold','topend']){
 const p=plan({prefs:{...prefs,objective},acts,today,ftp:200});const future=p.days.filter(d=>d.date>=today);for(const d of future){assert.ok(d.mins<=prefs.days[(new Date(d.date).getDay()+6)%7]);if(d.id)assert.equal(measure(p.workouts[d.id]).secs,Math.round(d.mins*60));}
 const hard=future.filter(d=>d.hard);for(let i=1;i<hard.length;i++)assert.ok(hard[i].date-hard[i-1].date>=2*DAY-3600e3);
 for(let week=0;week<2;week++){const ds=future.filter(d=>d.date>=today+week*7*DAY&&d.date<today+(week+1)*7*DAY);assert.ok(ds.reduce((n,d)=>n+d.mins,0)<=p.weekly.minutes+1);assert.ok(ds.reduce((n,d)=>n+d.tss,0)<=p.weekly.tss+ds.length);assert.ok(ds.filter(d=>d.hard).length<=2);}
 }
 const hardSunday={start:today-DAY,sport:'ride',sum:{moving:5400,tss:150,zones:[0,0,0,0,1200,600,0]}};const p=plan({prefs:{...prefs,days:[60,60,60,60,0,150,90]},acts:[...acts,hardSunday],today,ftp:200});assert.equal(p.today.hard,false);
});
test('missed sessions do not create training debt, and recorded sessions retain their original steps',()=>{
 const r=record(0,null),p=plan({prefs:{...prefs,days:[60,60,60,60,0,150,90]},records:[r],today,ftp:300});assert.equal(p.today.prescriptionId,r.id);assert.equal(p.workouts[p.today.id].steps.find(s=>s.kind==='work').from*300,190);assert.ok(p.days.every(d=>!d.missed));
});
test('coach ignores records arriving after the account changes and classic use makes no network requests',async()=>{
 let owner='ann',finish,calls=0;const coach=createCoach({owner:()=>owner,inputs:()=>({prefs,today,ftp:200}),importEngine:()=>import('../../../fitness/rhythm2.js'),api:{trainingRecords:()=>{calls++;return new Promise(r=>finish=r);}}});
 assert.equal(coach.ready(),false);assert.equal(coach.workout('endurance-90'),null);assert.equal(calls,0);
 const p=coach.load();owner='bo';coach.reset();finish({records:[record(0)]});await assert.rejects(p,/account changed/);assert.equal(coach.ready(),false);assert.deepEqual(coach.state().records,[]);
});
test('a recorded workout exports absolute watts so a device FTP change cannot rewrite it',async()=>{
 const {fitFromWorkout}=await import('../../../fitness/formats.js'),{readFit}=await import('../../../fitness/fit.js');
 const w=recordedWorkout(record(0),300),steps=readFit(fitFromWorkout(w)).messages.workoutStep;
 const work=steps.find(s=>s.name==='Effort');assert.equal(work.low,1188);assert.equal(work.high,1193);
});
test('changing FTP holds the work duration while new evidence accumulates',()=>{
 const p=progression([record(14),record(7)],'threshold',250);assert.equal(p.action,'hold');assert.equal(p.dose.work,dose.work);
});
test('moving a recorded session creates a new dated prescription with the original watts',async()=>{
 const original=record(0,null),tomorrow=addDays(today,1),swaps={[today]:null,[tomorrow]:'r2p:'+original.id};let posts=0;
 const coach=createCoach({owner:()=> 'ann',inputs:()=>({prefs:{...prefs,days:[60,60,60,60,0,90,60]},today,ftp:300,swaps}),importEngine:()=>import('../../../fitness/rhythm2.js'),onRecorded:(day,was,id)=>{if(swaps[day]===was)swaps[day]=id;},api:{trainingRecords:async()=>({records:[original]}),prescribe:async p=>({record:{...p,id:'b'.repeat(24),created:today+1,revision:0,feedback:null}})}});
 await coach.load();const d=coach.plan().days.find(d=>d.date===tomorrow);assert.equal(d.prescriptionId,null);
 const copy=await coach.record(tomorrow);assert.equal(copy.day,dayKey(tomorrow));assert.equal(copy.ftp,200);assert.deepEqual(copy.workout.steps,original.workout.steps);assert.equal(swaps[tomorrow],'r2p:'+copy.id);assert.equal(coach.plan().days.find(d=>d.date===tomorrow).prescriptionId,copy.id);
});
test('a completed reviewed ride counts for recovery even before its activity file arrives',()=>{
 const sunday=record(1),p=plan({prefs:{...prefs,days:[60,60,60,60,0,90,60]},records:[sunday],today,ftp:200});assert.equal(p.today.hard,false);
});

test('lazy coach deduplicates imports and rejects a controller loaded after an account switch',async()=>{
 const {createCoach:lazyCoach}=await import('../../../fitness/account.js');let owner='ann',finish,imports=0,loads=0;
 const client={load:async()=>{loads++;},ready:()=>true,reset(){},state:()=>({records:[]})};
 const coach=lazyCoach({owner:()=>owner,create:()=>{imports++;return new Promise(r=>finish=r);}});
 assert.equal(imports,0);const pending=coach.load();assert.equal(coach.load(),pending);await Promise.resolve();assert.equal(imports,1);
 owner='bo';coach.reset();finish(client);await assert.rejects(pending,/account changed/);assert.equal(loads,0);assert.equal(coach.ready(),false);
 const next=coach.load();await Promise.resolve();finish(client);await next;assert.equal(loads,1);assert.equal(coach.ready(),true);
});

test('VO2 reviews use session context, and stale, future or different-FTP evidence cannot unlock progression',()=>{
 const vo2=compose('vo2',60),r=(days,effort=8,extra={})=>record(days,{completion:'completed',effort,reason:'none'},{workout:vo2,...extra});
 assert.equal(progression([r(14),r(7)],'vo2',200,today).action,'progress');
 const next=compose('vo2',60,{progress:progression([r(14),r(7)],'vo2',200,today)});assert.equal(next.dose.work,195);assert.equal(next.dose.reps,vo2.dose.reps);assert.equal(next.dose.intensity,vo2.dose.intensity);assert.match(next.name,/3:15 min/);
 assert.equal(progression([r(7,9)],'vo2',200,today).action,'hold');assert.equal(progression([r(7,10)],'vo2',200,today).action,'reduce');
 assert.equal(progression([r(55),r(48)],'vo2',200,today).action,'start');assert.equal(progression([r(-1),r(-2)],'vo2',200,today).action,'start');
 assert.equal(progression([r(14,7,{ftp:250}),r(7,7)],'vo2',200,today).action,'hold');
 const previous=r(2,6,{created:1}),older=r(14,10,{created:9999999999999});assert.equal(progression([previous,older],'vo2',200,today).action,'hold','review insertion order cannot override the most recent ride');
});

test('new interval doses have work ceilings while old ids and captured prescriptions round-trip unchanged',()=>{
 for(const [family,ceiling]of [['threshold',2400],['vo2',1200],['sprint',120],['durable',1800]]){
  let w=compose(family,180);for(let i=0;i<100;i++){w=compose(family,180,{progress:{action:'progress',dose:w.dose}});assert.ok(w.dose.reps*w.dose.work<=ceiling);assert.equal(measure(w).secs,10800);assert.deepEqual(workoutFromId(w.id).steps,w.steps);}
  assert.equal(progression([record(7,undefined,{workout:w})],family,200,today).action,'hold');
 }
 const legacy=workoutFromId('r2:threshold:120:3:1200:240:950');assert.equal(legacy.dose.work,1200);assert.equal(legacy.workSecs,3600);assert.equal(legacy.id,'r2:threshold:120:3:1200:240:950');
 const r=record(7,undefined,{workout:legacy});assert.equal(progression([r],'threshold',200,today).action,'hold');assert.deepEqual(recordedWorkout(r).steps,legacy.steps);
 const short=compose('threshold',35),repeat=compose('threshold',35,{progress:{action:'progress',dose:short.dose}});assert.deepEqual(repeat.dose,short.dose);assert.equal(measure(repeat).secs,2100);assert.match(repeat.about,/longer time slot/);
});

test('recovery combines trends, sleep and check-in instead of treating one outlier as a failed recovery',()=>{
 const well=Object.fromEntries(Array.from({length:38},(_,i)=>[addDays(today,-i),{hrv:60,rhr:50,sleep:8*3600}]));
 well[today]={hrv:25,hrv_lo:45,hrv_hi:75,rhr:50,sleep:8*3600};
 assert.equal(recoveryState({well,today}).easy,false);assert.match(recoveryState({well,today}).why,/One unusual reading/);
 const variable=Object.fromEntries(Array.from({length:38},(_,i)=>[addDays(today,-i),{hrv:i<7?59:i%2?58:62,rhr:50,sleep:8*3600}]));variable[today].hrv=20;
 assert.equal(recoveryState({well:variable,today}).easy,false,'one outlier cannot turn normal baseline variation into a persistent low trend');
 well[today].rhr=58;assert.equal(recoveryState({well,today}).easy,true);
 well[today].rhr=50;for(let i=0;i<7;i++)well[addDays(today,-i)].hrv=25;assert.equal(recoveryState({well,today}).easy,true);
 assert.equal(recoveryState({today}).easy,false);assert.equal(recoveryState({today}).rest,false);
 assert.equal(recoveryState({today,feel:{[today]:{sleep:0,legs:0,mood:1}}}).rest,true);
 for(let i=0;i<38;i++)well[addDays(today,-i)].hrv=60;for(let i=0;i<3;i++)well[addDays(today,-i)].sleep=6*3600;
 assert.equal(recoveryState({well,today}).easy,true,'repeated short sleep matters even with normal HRV');
});

test('repeated fatigue reviews prompt an easier period and expire without rewriting fitness or counting traffic',()=>{
 const fatigue={completion:'completed',effort:8,reason:'fatigue'},records=[record(3,fatigue),record(1,fatigue)];
 const r=recoveryState({records,today});assert.equal(r.easy,true);assert.equal(r.until,addDays(today,6));
 assert.equal(recoveryState({records,today:addDays(today,7)}).easy,false);
 assert.equal(recoveryState({records:[record(1,fatigue),record(1,fatigue)],today}).easy,false);
 assert.equal(recoveryState({records:[record(3,{...fatigue,reason:'traffic'}),record(1,fatigue)],today}).easy,false);
 const p=plan({prefs:{...prefs,days:[60,60,60,60,60,90,90]},records,today,ftp:250});assert.equal(p.ftpSeen,null);assert.ok(p.days.filter(d=>d.date>=today&&d.date<r.until).every(d=>!d.hard));
});

const steadyHistory=()=>Array.from({length:24},(_,i)=>({id:'steady'+i,start:addDays(today,-(i*2+1)),sport:'ride',sum:{moving:7200,secs:7200,tss:70,kind:'power',iF:.6,zones:[0,7200,0,0,0,0,0]}}));
test('focused sessions respect rolling seven-day limits across Monday, including unplanned rides',()=>{
 const hardDays=[addDays(today,-4),addDays(today,-2)],acts=[...steadyHistory(),...hardDays.map(start=>({start,sport:'ride',sum:{moving:3600,tss:55,kind:'power',iF:.8,zones:[600,2400,0,0,600,0,0]}}))];
 const p=plan({prefs:{...prefs,level:'regular',days:[60,60,60,60,60,120,90]},acts,today,ftp:250});const future=p.days.filter(d=>d.date>=today);
 assert.equal(p.today.hard,false);assert.ok(future.some(d=>d.hard),'the guard must still allow later focused work');
 const dates=[...new Set([...hardDays,...future.filter(d=>d.hard).map(d=>d.date)])];for(const d of future)assert.ok(dates.filter(x=>x>=addDays(d.date,-6)&&x<=d.date).length<=2);
});
test('planned interval minutes stay a minority and reviews cannot exceed the scheduled time goal',()=>{
 const acts=steadyHistory(),settings={...prefs,level:'regular',days:[60,60,60,60,60,120,90]},base=plan({prefs:settings,acts,today,ftp:200});
 const focused=base.days.filter(d=>d.date>=today&&d.hard);assert.ok(focused.length>0);
 for(let week=0;week<2;week++){const work=focused.filter(d=>d.date>=addDays(today,week*7)&&d.date<addDays(today,(week+1)*7)).reduce((n,d)=>n+base.workouts[d.id].workSecs/60,0);assert.ok(work<=base.weekly.workMinutes+1);}
 const hold=plan({prefs:{...settings,mode:'hold'},acts,today,ftp:200});assert.equal(base.weekly.minutes,settings.days.reduce((n,d)=>n+d,0));assert.ok(hold.weekly.minutes<base.weekly.minutes);
 const controlled=plan({prefs:settings,acts,records:[record(12),record(8)],today,ftp:200});assert.equal(controlled.weekly.minutes,base.weekly.minutes);
 const stale=plan({prefs:settings,acts,records:[record(55),record(48)],today,ftp:200});assert.equal(stale.weekly.minutes,base.weekly.minutes);
 const changedFtp=plan({prefs:settings,acts,records:[record(12,undefined,{ftp:250}),record(8,undefined,{ftp:250})],today,ftp:200});assert.equal(changedFtp.weekly.minutes,base.weekly.minutes);
});

test('a declared ten-hour week uses the chosen days despite sparse imports, without inventing extra intensity',()=>{
 const days=[270,0,0,0,0,60,270],settings={...prefs,days,level:'regular'};
 const sparse=Array.from({length:6},(_,i)=>({start:addDays(today,-(i*9+1)),sport:'ride',sum:{moving:8340,secs:8340,tss:98,kind:'power',iF:.65}}));
 for(const acts of [[],sparse]){
  const p=plan({prefs:settings,acts,today,ftp:300});assert.equal(p.weekly.minutes,600);assert.equal(p.weekly.availableMinutes,600);
  for(let week=0;week<2;week++){
   const ds=p.days.filter(d=>d.date>=addDays(today,week*7)&&d.date<addDays(today,(week+1)*7));
   assert.deepEqual(ds.map(d=>d.mins),days);
   assert.ok(ds.reduce((n,d)=>n+d.tss,0)<=p.weekly.tss+7);
   assert.ok(ds.filter(d=>d.hard).length<=p.weekly.maxHard);
   for(const d of ds.filter(d=>d.hard)){const w=p.workouts[d.id];assert.ok(w.workSecs<=2400);assert.equal(w.targetFtp,300);}
  }
 }
});
test('time goals still respect explicit recovery, rest, hold mode and a starting-again level',()=>{
 const settings={...prefs,days:[270,0,0,0,0,60,270],level:'regular'};
 const easy=plan({prefs:settings,today,feel:{[today]:{sleep:0,legs:2,mood:2}}});assert.equal(easy.today.kind,'recovery');assert.ok(easy.today.mins<=60);assert.equal(easy.today.hard,false);
 const rest=plan({prefs:settings,today,feel:{[today]:{sleep:0,legs:0,mood:0}}});assert.equal(rest.today.id,null);assert.equal(rest.today.mins,0);
 const novice=plan({prefs:{...settings,level:'none'},today});assert.equal(novice.weekly.minutes,90);assert.ok(novice.days.filter(d=>d.date>=today&&d.date<addDays(today,7)).reduce((n,d)=>n+d.mins,0)<=90);
 const hold=plan({prefs:{...settings,mode:'hold'},today});assert.equal(hold.weekly.minutes,330);
});
test('draft week previews use the active engine and account records without changing saved preferences',async()=>{
 const settings={...prefs,days:[60,60,0,60,0,120,90]},draft={...settings,days:[270,0,0,0,0,60,270]};
 const coach=createCoach({owner:()=> 'ann',inputs:()=>({prefs:settings,today,ftp:250}),importEngine:()=>import('../../../fitness/rhythm2.js'),api:{trainingRecords:async()=>({records:[record(0,null)]})}});
 await coach.load();const before=JSON.stringify(settings),preview=coach.plan({prefs:draft});
 assert.equal(preview.weekly.minutes,600);assert.equal(preview.today.prescriptionId,'a'.repeat(24));
 assert.equal(coach.plan().weekly.minutes,settings.days.reduce((n,d)=>n+d,0));assert.equal(JSON.stringify(settings),before);
});
