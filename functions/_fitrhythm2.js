// Account-owned, immutable workout prescriptions. Subjective feedback is a separate,
// versioned update; changing a plan or FTP cannot alter a recorded prescription.
import {HttpError,pace} from './_pigeon.js';
import {tablesOnce,cleanWorkout} from './_fitness.js';
import {measure} from '../fitness/workouts.js';
const DAYS=180*86400e3;
const table=env=>tablesOnce(env,'rhythm2',D=>D.batch([
 D.prepare('CREATE TABLE IF NOT EXISTS fx_rhythm2 (user_id TEXT NOT NULL,id TEXT NOT NULL,day TEXT NOT NULL,payload TEXT NOT NULL,feedback TEXT,revision INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,id))'),
 D.prepare('CREATE INDEX IF NOT EXISTS fx_rhythm2_day ON fx_rhythm2(user_id,day,created)')
]));
const bad=()=>{throw new HttpError(400,'Check the session details and try again.');};
const n=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const unpack=r=>({id:r.id,...JSON.parse(r.payload),feedback:r.feedback?JSON.parse(r.feedback):null,revision:r.revision,created:r.created});
export async function trainingRecords(env,userId,{all=false,t=Date.now()}={}){
 const D=await table(env),q=all?'SELECT * FROM fx_rhythm2 WHERE user_id = ? ORDER BY created':'SELECT * FROM fx_rhythm2 WHERE user_id = ? AND created >= ? ORDER BY created DESC LIMIT 180';
 const s=D.prepare(q).bind(...(all?[userId]:[userId,t-DAYS]));return (await s.all()).results.map(unpack);
}
export function cleanPrescription(b,t=Date.now()){
 if(!b||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(b.day||'')||!n(b.ftp,50,600)||!['balanced','endurance','threshold','topend'].includes(b.objective)||!['threshold','vo2','sprint','durable','long','endurance','recovery'].includes(b.workout?.family))bad();
 const epoch=Date.parse(b.day+'T12:00:00Z');if(!Number.isFinite(epoch)||new Date(epoch).toISOString().slice(0,10)!==b.day||epoch<t-36*3600e3||epoch>t+15*86400e3)throw new HttpError(400,'Record a session for today or the next two weeks.');
 const raw=b.workout;
 if(!/^r2:[a-z]+:[0-9:]+$/.test(raw.id||'')||raw.id.length>40||!Array.isArray(raw.steps)||raw.steps.length>40||raw.steps.some(s=>s.repeat!=null||!Number.isInteger(s.secs)||s.secs<1||!n(s.from,0,2.5)||s.to!=null&&!n(s.to,0,2.5)))bad();
 const workout=cleanWorkout({...raw,id:'prescribed'});workout.id=raw.id;workout.family=raw.family;workout.engine='rhythm-2.0';
 const m=measure(workout);if(m.secs<600||m.secs>36000||m.tss>1000||m.steps.some(s=>!Number.isFinite(s.from)))bad();
 if(raw.dose!=null){const d=raw.dose;if(!Number.isInteger(d.reps)||!n(d.reps,2,8)||!Number.isInteger(d.work)||!n(d.work,10,1200)||!Number.isInteger(d.recovery)||!n(d.recovery,60,600)||!n(d.intensity,.5,2.5))bad();const work=workout.steps.filter(s=>s.kind==='work');if(work.length!==d.reps||work.some(s=>s.secs!==d.work||s.from!==d.intensity))bad();workout.dose={reps:d.reps,work:d.work,recovery:d.recovery,intensity:d.intensity};}
 else if(workout.steps.some(s=>s.kind==='work'))bad();
 return {engine:'rhythm-2.0',day:b.day,ftp:b.ftp,objective:b.objective,workout};
}
export async function prescribe(env,userId,b,{t=Date.now()}={}){
 const payload=cleanPrescription(b,t),D=await table(env);await pace(env,'rhythm2:record:'+userId,60,3600e3);
 const bytes=new TextEncoder().encode(JSON.stringify(payload)),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('').slice(0,24);
 await D.prepare('INSERT OR IGNORE INTO fx_rhythm2 (user_id,id,day,payload,created,updated) VALUES (?,?,?,?,?,?)').bind(userId,hash,payload.day,JSON.stringify(payload),t,t).run();
 return unpack(await D.prepare('SELECT * FROM fx_rhythm2 WHERE user_id = ? AND id = ?').bind(userId,hash).first());
}
export async function sessionFeedback(env,userId,b,{t=Date.now()}={}){
 if(!b||!/^[a-f0-9]{24}$/.test(b.id||'')||!Number.isInteger(b.revision)||b.revision<0||!['completed','reduced','skipped'].includes(b.completion)||!['none','fatigue','traffic','time','equipment','other'].includes(b.reason)||!Number.isInteger(b.effort)||!n(b.effort,b.completion==='skipped'?0:1,10))bad();
 const D=await table(env),row=await D.prepare('SELECT * FROM fx_rhythm2 WHERE user_id = ? AND id = ?').bind(userId,b.id).first();if(!row)throw new HttpError(404,'That recorded session was not found.');
 if(row.day>new Date(t+14*3600e3).toISOString().slice(0,10))throw new HttpError(400,'Review a session after its day has arrived.');
 const feedback={completion:b.completion,reason:b.reason,effort:b.effort,at:t};
 if(b.activityId!=null){if(!/^[A-Za-z0-9_-]{1,40}$/.test(b.activityId))bad();const a=await D.prepare('SELECT start FROM fx_acts WHERE user_id = ? AND id = ?').bind(userId,b.activityId).first();if(!a||Math.abs(a.start-Date.parse(row.day+'T12:00:00Z'))>36*3600e3)throw new HttpError(400,'Choose one of your activities from this session’s day.');feedback.activityId=b.activityId;}
 // Evaluations are supporting evidence only. Subjective effort is always required;
 // no arbitrary watts/FTP updates are accepted through this endpoint.
 if(b.assessment!=null){const a=b.assessment;if(!['uncertain','held','reduced'].includes(a.status))bad();if(a.status!=='uncertain'&&(!feedback.activityId||!Number.isInteger(a.efforts)||!n(a.efforts,1,80)||!Number.isInteger(a.held)||!n(a.held,0,a.efforts)||!n(a.ratio,0,3)))bad();feedback.assessment={status:a.status,...(a.status==='uncertain'?{}:{efforts:a.efforts,held:a.held,ratio:a.ratio})};}
 await pace(env,'rhythm2:feedback:'+userId,60,3600e3);
 const result=await D.prepare('UPDATE fx_rhythm2 SET feedback = ?,revision = revision + 1,updated = ? WHERE user_id = ? AND id = ? AND revision = ?').bind(JSON.stringify(feedback),t,userId,b.id,b.revision).run();
 if(!result.meta?.changes)throw new HttpError(409,'This review changed on another device. Refresh it before saving.');
 return unpack(await D.prepare('SELECT * FROM fx_rhythm2 WHERE user_id = ? AND id = ?').bind(userId,b.id).first());
}
export async function deleteTrainingRecords(env,userId){const D=await table(env);await D.prepare('DELETE FROM fx_rhythm2 WHERE user_id = ?').bind(userId).run();}
