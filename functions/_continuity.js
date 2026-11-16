// Account-scoped screen references only. Draft content stays inside its app.
import { HttpError } from "./_pigeon.js";
import { tablesOnce } from "./_fitness.js";
const fail=(s,m)=>{throw new HttpError(s,m)};
const device=v=>typeof v==="string"&&/^[a-f0-9]{32}$/.test(v);
export function continuationTarget(v){
 if(!v||typeof v.path!=="string"||v.path.length>180||/[?%\\\s\u0000-\u001f]/.test(v.path))return fail(400,"That continuation is invalid.");
 const allowed=/^\/(?:$|fitness\/(?:#(?:today|activities|routes|progress)(?:=[A-Za-z0-9_-]{1,40})?)?$|weather\/(?:#(?:now|days|radar|warnings))?$|markets\/(?:#(?:today|holdings|news))?$|chats\/(?:#(?:chats|friends|open=[A-Za-z0-9_-]{1,40}))?$|mail\/(?:#(?:people|updates|later|done|thread=[A-Za-z0-9_-]{1,40}))?$|#files(?:=[A-Za-z0-9_-]{32})?$)/;
 if(!allowed.test(v.path))return fail(400,"That screen cannot be continued.");
 return {path:v.path,y:Number.isFinite(v.y)?Math.min(1e6,Math.max(0,Math.round(v.y))):0};
}
export async function continuitydb(env){const D=await tablesOnce(env,"continuity-v1",async X=>{await X.prepare("CREATE TABLE IF NOT EXISTS ifl_continuity(user_id TEXT NOT NULL,device_id TEXT NOT NULL,revision INTEGER NOT NULL,target TEXT NOT NULL,label TEXT NOT NULL,modified INTEGER NOT NULL,PRIMARY KEY(user_id,device_id))").run()});return D.withSession?D.withSession("first-primary"):D}
const live="EXISTS(SELECT 1 FROM pg_users WHERE id=?1 AND delete_at IS NULL)";
export async function readContinuity(env,owner){const D=await continuitydb(env);const result=await D.prepare(`SELECT device_id,revision,target,label,modified FROM ifl_continuity WHERE user_id=?1 AND modified>?2 AND ${live} ORDER BY modified DESC LIMIT 12`).bind(owner,Date.now()-30*864e5).all();return {devices:result.results.map(r=>({id:r.device_id,revision:r.revision,target:continuationTarget(JSON.parse(r.target)),label:r.label,updatedAt:r.modified}))}}
export async function writeContinuity(env,owner,v){
 if(!device(v?.id)||!Number.isSafeInteger(v.revision)||v.revision<0||!["Phone","Tablet","Computer"].includes(v.label))return fail(400,"That device reference is invalid.");
 const target=continuationTarget(v.target),D=await continuitydb(env),text=JSON.stringify(target),now=Date.now();
 const r=v.revision===0?await D.prepare(`INSERT INTO ifl_continuity(user_id,device_id,revision,target,label,modified) SELECT ?1,?2,1,?3,?4,?5 WHERE ${live} ON CONFLICT(user_id,device_id) DO NOTHING`).bind(owner,v.id,text,v.label,now).run():await D.prepare(`UPDATE ifl_continuity SET revision=revision+1,target=?3,label=?4,modified=?5 WHERE user_id=?1 AND device_id=?2 AND revision=?6 AND ${live}`).bind(owner,v.id,text,v.label,now,v.revision).run();
 if(!r.meta?.changes)return fail(409,"This device changed in another tab. Refresh to continue.");
 await D.prepare("DELETE FROM ifl_continuity WHERE user_id=?1 AND device_id NOT IN(SELECT device_id FROM ifl_continuity WHERE user_id=?1 ORDER BY modified DESC LIMIT 12)").bind(owner).run();
 return {revision:v.revision+1,updatedAt:now};
}
