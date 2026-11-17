// Account-scoped screen references only. Draft content stays inside its app.
import { HttpError } from "./_pigeon.js";
import { tablesOnce } from "./_fitness.js";
const fail=(s,m)=>{throw new HttpError(s,m)};
const device=v=>typeof v==="string"&&/^[a-f0-9]{32}$/.test(v);
export function continuationTarget(v){
 if(!v||typeof v.path!=="string"||v.path.length>180||/[?%\\\s\u0000-\u001f]/.test(v.path))return fail(400,"That continuation is invalid.");
 const allowed=/^\/(?:$|calendar\/#date=\d{4}-\d{2}-\d{2}$|(?:calendar|notes|people)\/(?:#(?:agenda|week|all|contacts|item=[a-f0-9]{32}))?$|fitness\/(?:#(?:today|activities|routes|progress)(?:=[A-Za-z0-9_-]{1,40})?)?$|weather\/(?:#(?:now|days|radar|warnings))?$|markets\/(?:#(?:today|holdings|news))?$|chats\/(?:#(?:chats|friends|open=[A-Za-z0-9_-]{1,40}))?$|mail\/(?:#(?:people|updates|later|done|thread=[A-Za-z0-9_-]{1,40}))?$|#files(?:=[A-Za-z0-9_-]{32})?$)/;
 if(!allowed.test(v.path))return fail(400,"That screen cannot be continued.");
 return {path:v.path,y:Number.isFinite(v.y)?Math.min(1e6,Math.max(0,Math.round(v.y))):0};
}
export async function continuitydb(env){const D=await tablesOnce(env,"continuity-v2",async X=>{
 await X.batch([
  X.prepare("CREATE TABLE IF NOT EXISTS ifl_open_tabs(user_id TEXT NOT NULL,device_id TEXT NOT NULL,tab_id TEXT NOT NULL,seq INTEGER NOT NULL,target TEXT,updated INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(user_id,device_id,tab_id))"),
  X.prepare("CREATE INDEX IF NOT EXISTS ifl_open_tabs_expiry ON ifl_open_tabs(expires)")
 ]);
 await X.prepare("CREATE TABLE IF NOT EXISTS ifl_continuity(user_id TEXT NOT NULL,device_id TEXT NOT NULL,revision INTEGER NOT NULL,target TEXT NOT NULL,label TEXT NOT NULL,modified INTEGER NOT NULL,PRIMARY KEY(user_id,device_id))").run();const cols=await X.prepare("PRAGMA table_info(ifl_continuity)").all();if(!cols.results.some(c=>c.name==="revoked"))try{await X.prepare("ALTER TABLE ifl_continuity ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0").run()}catch(e){const now=await X.prepare("PRAGMA table_info(ifl_continuity)").all();if(!now.results.some(c=>c.name==="revoked"))throw e}});return D.withSession?D.withSession("first-primary"):D}
const live="EXISTS(SELECT 1 FROM pg_users WHERE id=?1 AND delete_at IS NULL)";
export async function readContinuity(env,owner){const D=await continuitydb(env);const result=await D.prepare(`SELECT device_id,revision,target,label,modified FROM ifl_continuity WHERE user_id=?1 AND revoked=0 AND modified>?2 AND ${live} ORDER BY modified DESC LIMIT 12`).bind(owner,Date.now()-30*864e5).all();return {devices:result.results.map(r=>({id:r.device_id,revision:r.revision,target:continuationTarget(JSON.parse(r.target)),label:r.label,updatedAt:r.modified}))}}
export async function writeContinuity(env,owner,v){
 if(!device(v?.id)||!Number.isSafeInteger(v.revision)||v.revision<0||!["Phone","Tablet","Computer"].includes(v.label))return fail(400,"That device reference is invalid.");
 const target=continuationTarget(v.target),D=await continuitydb(env),text=JSON.stringify(target),now=Date.now();
 const old=await D.prepare('SELECT revoked FROM ifl_continuity WHERE user_id=? AND device_id=?').bind(owner,v.id).first();if(old?.revoked)return fail(410,'This device is no longer remembered. Enable it in Remembered devices.');
 await D.prepare('DELETE FROM ifl_continuity WHERE user_id=? AND revoked=1 AND modified<?').bind(owner,now-90*864e5).run();
 const r=v.revision===0?await D.prepare(`INSERT INTO ifl_continuity(user_id,device_id,revision,target,label,modified) SELECT ?1,?2,1,?3,?4,?5 WHERE ${live} AND (SELECT COUNT(*) FROM ifl_continuity WHERE user_id=?1)<200 ON CONFLICT(user_id,device_id) DO NOTHING`).bind(owner,v.id,text,v.label,now).run():await D.prepare(`UPDATE ifl_continuity SET revision=revision+1,target=?3,label=?4,modified=?5 WHERE user_id=?1 AND device_id=?2 AND revision=?6 AND revoked=0 AND ${live}`).bind(owner,v.id,text,v.label,now,v.revision).run();
 if(!r.meta?.changes)return fail(409,"This device changed in another tab. Refresh to continue.");
 await D.prepare("UPDATE ifl_continuity SET revoked=1,target='null',label='',revision=revision+1 WHERE user_id=?1 AND revoked=0 AND device_id NOT IN(SELECT device_id FROM ifl_continuity WHERE user_id=?1 AND revoked=0 ORDER BY modified DESC LIMIT 12)").bind(owner).run();
 return {revision:v.revision+1,updatedAt:now};
}

// A document renews its own entry. Keep a closed entry briefly so a delayed
// heartbeat cannot recreate it, even if the close arrives before the first PUT.
const TAB_LEASE = 150000;
export async function listOpenTabs(env, owner, id) {
 if (!device(id)) return fail(400, 'Invalid device.');
 const D = await continuitydb(env), now = Date.now();
 const {results} = await D.prepare(`SELECT t.device_id AS id,t.tab_id AS tab,t.target,t.updated AS updatedAt,t.expires,d.label
  FROM ifl_open_tabs t JOIN ifl_continuity d USING(user_id,device_id)
  WHERE t.user_id=?1 AND t.device_id<>?2 AND d.revoked=0 AND t.target IS NOT NULL AND t.expires>?3 AND ${live}
  ORDER BY t.updated DESC,t.tab_id LIMIT 24`).bind(owner,id,now).all();
 return {tabs:results.map(({target,expires,...row})=>({...row,target:continuationTarget(JSON.parse(target)),remainingMs:expires-now}))};
}

export async function updateOpenTab(env, owner, input) {
 const {id,tab,seq,label,target} = input || {};
 if (!device(id) || !device(tab) || !Number.isSafeInteger(seq) || seq < 1 || !['Phone','Tablet','Computer'].includes(label)) return fail(400,'Invalid tab.');
 const screen = target === null ? null : continuationTarget(target);
 const D = await continuitydb(env), now = Date.now();
 const remembered = await D.prepare('SELECT revoked FROM ifl_continuity WHERE user_id=? AND device_id=?').bind(owner,id).first();
 if (remembered?.revoked) return fail(410,'This device is no longer remembered.');
 if (screen && !remembered) {
  try { await writeContinuity(env,owner,{id,label,target:screen,revision:0}); }
  catch (error) { if (error.status !== 409) throw error; }
 }
 const serialized = screen && JSON.stringify(screen);
 const allowed = screen ? 'EXISTS(SELECT 1 FROM ifl_continuity WHERE user_id=?1 AND device_id=?2 AND revoked=0)' : '1';
 await D.batch([
  ...(screen ? [D.prepare(`UPDATE ifl_continuity SET modified=?3,target=?4,revision=revision+1
   WHERE user_id=?1 AND device_id=?2 AND revoked=0 AND modified<?5 AND ${live}`).bind(owner,id,now,serialized,now-3600000)] : []),
  D.prepare('DELETE FROM ifl_open_tabs WHERE rowid IN (SELECT rowid FROM ifl_open_tabs WHERE expires<=? ORDER BY expires LIMIT 256)').bind(now),
  D.prepare(`INSERT INTO ifl_open_tabs(user_id,device_id,tab_id,seq,target,updated,expires)
   SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE ${live} AND ${allowed} AND
    ((SELECT COUNT(*) FROM ifl_open_tabs WHERE user_id=?1)<512 OR EXISTS(SELECT 1 FROM ifl_open_tabs WHERE user_id=?1 AND device_id=?2 AND tab_id=?3))
   ON CONFLICT(user_id,device_id,tab_id) DO UPDATE SET seq=excluded.seq,target=excluded.target,
    updated=CASE WHEN ifl_open_tabs.target IS excluded.target THEN ifl_open_tabs.updated ELSE excluded.updated END,expires=excluded.expires
   WHERE excluded.seq>ifl_open_tabs.seq`).bind(owner,id,tab,seq,serialized,now,now+(screen ? TAB_LEASE : 2*TAB_LEASE)),
 ]);
 return {ok:true};
}
