// Due reminders use Today's existing registered devices and quiet-hours rules.
// CAS claims avoid duplicate concurrent sends; stable tags coalesce push retries.
import {systemdb} from './_system350.js';
import {todayDevices} from './_today.js';
import {prefsOf,isQuiet,pushToSub} from './_notify.js';
export async function reminderTick(env,now=Date.now(),{push=pushToSub,devices:registered=todayDevices}={}){
 const D=await systemdb(env),until=Date.now()+8000;
 const {results}=await D.prepare("SELECT a.*,u.notify_prefs FROM ifl_actions a JOIN pg_users u ON u.id=a.user_id WHERE a.status='open' AND a.notify=1 AND a.due_at<=? AND a.due_at>? AND a.notified IS NULL AND u.delete_at IS NULL ORDER BY a.due_at LIMIT 50").bind(now,now-7*864e5).all();
 let sent=0,waiting=0;const perOwner=new Map();
 for(const a of results){
  if(Date.now()>=until)break;
  const prefs=prefsOf(a);if(isQuiet(prefs,now)||(perOwner.get(a.user_id)||0)>=3){waiting++;continue}
  const devices=await registered(env,a.user_id);if(!devices.length){waiting++;continue}
  const claim=await D.prepare("UPDATE ifl_actions SET notified=? WHERE user_id=? AND id=? AND version=? AND status='open' AND notified IS NULL AND EXISTS(SELECT 1 FROM pg_users WHERE id=? AND delete_at IS NULL)").bind(now,a.user_id,a.id,a.version,a.user_id).run();if(!claim.meta?.changes)continue;
  const note={app:'today',title:prefs.names?a.title:'Reminder due',body:prefs.names?'Open Today to continue.':'You have a reminder waiting in InFlite.',url:'/#you=action-'+a.id,tag:'ifl-reminder-'+a.id+'-'+a.due_at};
  const result=await Promise.allSettled(devices.map(d=>push(env,d,note)));if(result.some(r=>r.status==='fulfilled'&&r.value==='sent')){sent++;perOwner.set(a.user_id,(perOwner.get(a.user_id)||0)+1)}else{await D.prepare("UPDATE ifl_actions SET notified=NULL WHERE user_id=? AND id=? AND version=? AND notified=?").bind(a.user_id,a.id,a.version,now).run();waiting++}
 }
 await D.prepare('DELETE FROM ifl_action_operations WHERE rowid IN(SELECT rowid FROM ifl_action_operations WHERE created<? ORDER BY created LIMIT 100)').bind(now-30*864e5).run();
 await D.prepare('DELETE FROM ifl_draft_backups WHERE rowid IN(SELECT rowid FROM ifl_draft_backups WHERE modified<? ORDER BY modified LIMIT 100)').bind(now-14*864e5).run();
 return {sent,waiting};
}
