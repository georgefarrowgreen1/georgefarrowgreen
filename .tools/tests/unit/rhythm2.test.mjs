import {test} from 'node:test';import assert from 'node:assert/strict';
import {plan,compose,progression,recordedWorkout,riderModel,assessPrescription,dayKey,workoutFromId} from '../../../fitness/rhythm2.js';
import {createCoach} from '../../../fitness/rhythm2-account.js';
import {measure,flatten,DAY,addDays} from '../../../fitness/workouts.js';
const today=new Date(2026,10,9).getTime(),prefs={days:[0,60,60,60,0,150,90],level:'some',mode:'build',objective:'balanced',at:today};
const workout=compose('threshold',60),dose=workout.dose;
const record=(days,feedback={completion:'completed',effort:6,reason:'none'},extra={})=>({id:'a'.repeat(24),day:dayKey(addDays(today,-days)),ftp:200,workout,feedback,revision:0,created:today-days*DAY,...extra});
test('sessions exactly fit the slot, keep recoveries between efforts, and round-trip their ids',()=>{
 for(const family of ['threshold','vo2','sprint','durable','long','endurance','recovery'])for(const minutes of [15,30,35,45,60,90,150]){const w=compose(family,minutes);if(!w)continue;assert.equal(measure(w).secs,minutes*60);assert.deepEqual(workoutFromId(w.id).steps,w.steps);assert.ok(w.steps.every(s=>s.secs>0));for(let i=1;i<w.steps.length;i++)assert.ok(!(w.steps[i].kind==='work'&&w.steps[i-1].kind==='work'));}
});
test('progression needs two independent controlled reviews at the same dose; difficulties, uncertainty and interruptions differ',()=>{
 assert.equal(progression([record(7)],'threshold').action,'hold');
 const progress=progression([record(14),record(7)],'threshold');assert.equal(progress.action,'progress');const w=compose('threshold',60,{progress});assert.equal(w.dose.intensity,dose.intensity);assert.equal(w.dose.reps,dose.reps);assert.equal(w.dose.work,dose.work+60);
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
