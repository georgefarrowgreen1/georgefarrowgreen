// InFlite 3.50: account-owned actions and encrypted draft backup envelopes.
// App content is never copied automatically. Sources are opaque, curated links.
import {HttpError,randomToken,sha256,hex,DAY} from './_pigeon.js';
import {tablesOnce} from './_fitness.js';
import {getFile} from './_files.js';
import {continuitydb,continuationTarget} from './_continuity.js';
const fail=(s,m)=>{throw new HttpError(s,m)};
const ID=/^[A-Za-z0-9_-]{32}$/,DEVICE=/^[a-f0-9]{32}$/;
const owned="EXISTS(SELECT 1 FROM pg_users WHERE id=?1 AND delete_at IS NULL)";
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,n,label)=>{if(typeof v!=='string'||v.length>n||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(v))fail(400,'Check '+label+'.');return v.trim()};
const ref=v=>typeof v==='string'&&ID.test(v)?v:fail(400,'That reference is invalid.');
const device=v=>typeof v==='string'&&DEVICE.test(v)?v:fail(400,'That device reference is invalid.');
const version=v=>Number.isSafeInteger(v)&&v>0?v:fail(400,'Refresh to check the current version.');
const operation=v=>typeof v==='string'&&/^[\w-]{16,80}$/.test(v)?v:fail(400,'Try that action again.');
export function actionSource(v){
 if(v==null)return null;
 if(!object(v)||!['mail','chats','fitness','weather','markets','files','calendar','notes','people'].includes(v.app)||Object.keys(v).some(k=>!['app','id','item'].includes(k)))fail(400,'That source is invalid.');
 const id=v.id==null?null:typeof v.id==='string'&&/^[\w-]{1,64}$/.test(v.id)?v.id:fail(400,'That source is invalid.');
 const item=v.item==null?null:typeof v.item==='string'&&/^[\w-]{1,64}$/.test(v.item)?v.item:fail(400,'That source item is invalid.');
 if(['mail','chats','files','calendar','notes','people'].includes(v.app)&&!id)fail(400,'Choose a source item.');
 return {app:v.app,...(id?{id}:{}),...(item?{item}:{})};
}
export async function systemdb(env){
 if(!env.DB)fail(503,'InFlite could not reach your account.');
 const D=await tablesOnce(env,'system-350-v1',async X=>{await X.batch([
  X.prepare("CREATE TABLE IF NOT EXISTS ifl_actions(user_id TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',due_at INTEGER,notify INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'open',source TEXT,files TEXT NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,modified INTEGER NOT NULL,completed INTEGER,notified INTEGER,operation_id TEXT NOT NULL,signature TEXT NOT NULL,PRIMARY KEY(user_id,id),UNIQUE(user_id,operation_id),CHECK(status IN('open','done','deleted')))"),
  X.prepare('CREATE INDEX IF NOT EXISTS ifl_actions_due ON ifl_actions(status,notify,due_at,notified)'),
  X.prepare('CREATE INDEX IF NOT EXISTS ifl_actions_owner ON ifl_actions(user_id,status,created DESC,id)'),
  X.prepare('CREATE TABLE IF NOT EXISTS ifl_action_repeats(user_id TEXT NOT NULL,action_id TEXT NOT NULL,rule TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,last_completed INTEGER,PRIMARY KEY(user_id,action_id))'),
  X.prepare('CREATE TABLE IF NOT EXISTS ifl_action_operations(user_id TEXT NOT NULL,operation_id TEXT NOT NULL,action_id TEXT NOT NULL,signature TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(user_id,operation_id))'),
  X.prepare('CREATE TABLE IF NOT EXISTS ifl_focus_dismissals(user_id TEXT NOT NULL,id TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(user_id,id))'),
  X.prepare("CREATE TABLE IF NOT EXISTS ifl_draft_backups(user_id TEXT NOT NULL,device_id TEXT NOT NULL,revision INTEGER NOT NULL,cipher TEXT NOT NULL,modified INTEGER NOT NULL,operation_id TEXT NOT NULL,PRIMARY KEY(user_id,device_id))"),
 ])});return D.withSession?D.withSession('first-primary'):D;
}
const repeatSQL="(SELECT rule FROM ifl_action_repeats r WHERE r.user_id=ifl_actions.user_id AND r.action_id=ifl_actions.id) AS recurrence,(SELECT completed FROM ifl_action_repeats r WHERE r.user_id=ifl_actions.user_id AND r.action_id=ifl_actions.id) AS repetitions";
const row=(D,o,id)=>D.prepare('SELECT *, '+repeatSQL+' FROM ifl_actions WHERE user_id=? AND id=?').bind(o,id).first();
const action=r=>({id:r.id,title:r.title,notes:r.notes,dueAt:r.due_at,notify:!!r.notify,status:r.status,source:r.source?JSON.parse(r.source):null,files:JSON.parse(r.files),version:r.version,createdAt:r.created,updatedAt:r.modified,completedAt:r.completed,recurrence:r.recurrence?JSON.parse(r.recurrence):null,repetitions:r.repetitions||0});
export function repeatRule(value,at){
 if(value==null)return null;
 if(!object(value)||Object.keys(value).some(k=>!['frequency','timezone','anchorDay'].includes(k))||!['daily','weekly','monthly','yearly'].includes(value.frequency)||typeof value.timezone!=='string'||value.timezone.length>80||at==null)fail(400,'Choose a date and a valid repeat schedule.');
 try{new Intl.DateTimeFormat('en',{timeZone:value.timezone})}catch(_){fail(400,'Choose a valid repeat time zone.')}
 const rule={frequency:value.frequency,timezone:value.timezone};if(['monthly','yearly'].includes(rule.frequency)){const anchor=value.anchorDay??Number(new Intl.DateTimeFormat('en-GB',{timeZone:rule.timezone,day:'numeric'}).format(at));if(!Number.isInteger(anchor)||anchor<1||anchor>31)fail(400,'Choose a valid repeat day.');rule.anchorDay=anchor}return rule;
}
// Keep local wall time through DST, and clamp month/year anniversaries.
export function nextRepeat(at,rule,now=Date.now()){
 const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:rule.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(t).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const base=parts(at),originalDay=rule.anchorDay||base.day;
 function occurrence(n){const d=new Date(Date.UTC(base.year,base.month-1,1,base.hour,base.minute,base.second));if(rule.frequency==='daily'||rule.frequency==='weekly')d.setUTCDate(originalDay+n*(rule.frequency==='weekly'?7:1));else{rule.frequency==='monthly'?d.setUTCMonth(d.getUTCMonth()+n):d.setUTCFullYear(d.getUTCFullYear()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(originalDay,last))}const wall=+d;let guess=wall;for(let i=0;i<4;i++){const p=parts(guess),offset=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-guess;const next=wall-offset;if(next===guess)break;guess=next}return guess}
 // Binary search skips missed occurrences without a long loop after years away.
 let lo=1,hi=rule.frequency==='daily'?40000:rule.frequency==='weekly'?6000:rule.frequency==='monthly'?1400:120;
 if(occurrence(hi)<=now)fail(400,'Choose a more recent reminder date.');while(lo<hi){const mid=Math.floor((lo+hi)/2);if(occurrence(mid)<=Math.max(now,at))lo=mid+1;else hi=mid}return occurrence(lo);
}
const due=v=>v==null||v===''?null:Number.isSafeInteger(v)&&v>=0&&v<=Date.now()+10*366*DAY?v:fail(400,'Choose a valid reminder date.');
async function attachments(env,owner,values){
 if(!Array.isArray(values)||values.length>5)fail(400,'Attach up to five Drive files.');const out=[],seen=new Set();
 for(const v of values){const id=ref(v?.id),expected=version(v.version);if(seen.has(id))continue;seen.add(id);const value=await getFile(env,owner,id),file=value.item;if(!file||file.kind!=='file'||file.status!=='ready'||file.trashedAt||file.version!==expected)fail(409,'An attached file changed. Choose it again.');out.push({id,version:expected})}return out;
}
export async function createAction(env,owner,input){
 if(!object(input))fail(400,'Check the reminder.');const title=text(input.title,160,'the title');if(!title)fail(400,'Give the reminder a title.');
 const value={title,notes:text(input.notes??'',2000,'the notes'),dueAt:due(input.dueAt),notify:input.notify===true,source:actionSource(input.source),files:await attachments(env,owner,input.files||[])},op=operation(input.operationId);
 if(input.recurrence!==undefined)value.recurrence=repeatRule(input.recurrence,value.dueAt);
 const D=await systemdb(env),signature=hex(await sha256(JSON.stringify(value))),prior=await D.prepare('SELECT * FROM ifl_actions WHERE user_id=? AND operation_id=?').bind(owner,op).first();
 if(prior){if(prior.signature!==signature)fail(409,'That action was used for a different reminder.');if(prior.status==='deleted')fail(410,'That reminder was deleted. Create a new one.');return {action:action(await row(D,owner,prior.id))}}
 await D.prepare("DELETE FROM ifl_actions WHERE user_id=? AND status='deleted' AND modified<?").bind(owner,Date.now()-30*DAY).run();
 await D.prepare('DELETE FROM ifl_action_repeats WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM ifl_actions a WHERE a.user_id=ifl_action_repeats.user_id AND a.id=ifl_action_repeats.action_id)').bind(owner).run();
 const id=randomToken(24),now=Date.now();
 const insert=D.prepare(`INSERT INTO ifl_actions(user_id,id,title,notes,due_at,notify,source,files,created,modified,operation_id,signature) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?9,?10,?11 WHERE ${owned} AND (SELECT COUNT(*) FROM ifl_actions WHERE user_id=?1 AND status='open')<500 AND (SELECT COUNT(*) FROM ifl_actions WHERE user_id=?1)<5000 ON CONFLICT(user_id,operation_id) DO NOTHING`).bind(owner,id,value.title,value.notes,value.dueAt,value.notify?1:0,value.source?JSON.stringify(value.source):null,JSON.stringify(value.files),now,op,signature);
 const writes=[insert];if(value.recurrence)writes.push(D.prepare(`INSERT INTO ifl_action_repeats(user_id,action_id,rule) SELECT ?1,?2,?3 WHERE ${owned} AND EXISTS(SELECT 1 FROM ifl_actions WHERE user_id=?1 AND id=?2 AND operation_id=?4) ON CONFLICT DO NOTHING`).bind(owner,id,JSON.stringify(value.recurrence),op));const [r]=await D.batch(writes);
 if(!r.meta?.changes){const saved=await D.prepare('SELECT * FROM ifl_actions WHERE user_id=? AND operation_id=?').bind(owner,op).first();if(saved&&saved.signature===signature&&saved.status!=='deleted')return {action:action(await row(D,owner,saved.id))};fail(409,'Your reminder list changed or is full. Refresh and try again.')}return {action:action(await row(D,owner,id))};
}
export async function updateAction(env,owner,input){
 const id=ref(input?.id),expected=version(input.version),op=operation(input.operationId),D=await systemdb(env),signature=hex(await sha256(JSON.stringify([id,expected,...['title','notes','dueAt','notify','status','files'].map(k=>input[k]??null),...(Object.hasOwn(input,'recurrence')?[input.recurrence]:[])]))),prior=await D.prepare('SELECT * FROM ifl_action_operations WHERE user_id=? AND operation_id=?').bind(owner,op).first(),before=await row(D,owner,id);if(prior){if(prior.action_id!==id||prior.signature!==signature)fail(409,'That save was used for a different change.');if(!before)fail(410,'That reminder is no longer retained.');return {action:action(before)}}if(!before||before.status==='deleted'&&(input.status!=='open'||Object.keys(input).some(k=>!['id','version','operationId','status'].includes(k))))fail(404,'That reminder is no longer available.');
 if(before.version!==expected)fail(409,'This reminder changed on another device. Refresh to review it.');
 const title=input.title===undefined?before.title:text(input.title,160,'the title');if(!title)fail(400,'Give the reminder a title.');
 const notes=input.notes===undefined?before.notes:text(input.notes,2000,'the notes');let at=input.dueAt===undefined?before.due_at:due(input.dueAt);const notify=input.notify===undefined?!!before.notify:input.notify===true;
 let status=input.status===undefined?before.status:['open','done','deleted'].includes(input.status)?input.status:fail(400,'Check the reminder state.');
 const recurrence=repeatRule(input.recurrence===undefined?(before.recurrence?JSON.parse(before.recurrence):null):input.recurrence,at),advancing=status==='done'&&before.status==='open'&&!!recurrence;
 if(advancing){at=nextRepeat(at,recurrence);status='open'}
 const files=input.files===undefined?JSON.parse(before.files):await attachments(env,owner,input.files),now=Date.now();
 const writes=[D.prepare(`UPDATE ifl_actions SET title=?3,notes=?4,due_at=?5,notify=?6,status=?7,files=?8,modified=?9,version=version+1,completed=?10,notified=CASE WHEN due_at IS NOT ?5 OR notify IS NOT ?6 THEN NULL ELSE notified END WHERE user_id=?1 AND id=?2 AND version=?11 AND (status!='deleted' OR ?7='open') AND (?7!='open' OR status='open' OR (SELECT COUNT(*) FROM ifl_actions WHERE user_id=?1 AND status='open')<500) AND ${owned}`).bind(owner,id,title,notes,at,notify?1:0,status,JSON.stringify(files),now,status==='done'?(before.completed||now):null,expected),D.prepare('INSERT INTO ifl_action_operations(user_id,operation_id,action_id,signature,created) SELECT ?,?,?,?,? WHERE changes()>0').bind(owner,op,id,signature,now)];
 if(recurrence)writes.push(D.prepare(`INSERT INTO ifl_action_repeats(user_id,action_id,rule,completed,last_completed) SELECT ?1,?2,?3,?4,?5 WHERE ${owned} AND EXISTS(SELECT 1 FROM ifl_actions WHERE user_id=?1 AND id=?2 AND version=?6) AND EXISTS(SELECT 1 FROM ifl_action_operations WHERE user_id=?1 AND operation_id=?7 AND action_id=?2) ON CONFLICT(user_id,action_id) DO UPDATE SET rule=excluded.rule,completed=completed+?4,last_completed=CASE WHEN ?4=1 THEN ?5 ELSE last_completed END`).bind(owner,id,JSON.stringify(recurrence),advancing?1:0,advancing?now:null,expected+1,op));else writes.push(D.prepare('DELETE FROM ifl_action_repeats WHERE user_id=? AND action_id=? AND EXISTS(SELECT 1 FROM ifl_actions WHERE user_id=? AND id=? AND version=?) AND EXISTS(SELECT 1 FROM ifl_action_operations WHERE user_id=? AND operation_id=? AND action_id=?)').bind(owner,id,owner,id,expected+1,owner,op,id));
 const changed=await D.batch(writes);
 if(!changed[0].meta?.changes)fail(409,'This reminder changed while saving. Refresh to review it.');return {action:action(await row(D,owner,id))};
}
export async function listActions(env,owner,{status='open',view='',cursor=null,q=''}={}){
 if(!['open','done','all'].includes(status)||!['','today'].includes(view)||typeof q!=='string'||q.length>160)fail(400,'That reminder search is invalid.');
 const D=await systemdb(env),args=[owner],filter=[`user_id=?1`,`status!='deleted'`,owned];
 if(status!=='all'){args.push(status);filter.push('status=?'+args.length)}
 if(q){args.push('%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%');filter.push(`(title LIKE ?${args.length} ESCAPE '\\' OR notes LIKE ?${args.length} ESCAPE '\\')`)}
 if(view==='today'){args.push(Date.now()+2*DAY);filter.push(`(due_at IS NULL OR due_at<=?${args.length})`)}
 if(cursor){const m=/^(\d{1,16}):([\w-]{32})$/.exec(cursor);if(!m||view)fail(400,'Refresh the reminder list.');args.push(Number(m[1]),m[2]);filter.push(`(created<?${args.length-1} OR created=?${args.length-1} AND id<?${args.length})`)}
 const limit=view==='today'?12:100,rows=await D.prepare(`SELECT *,${repeatSQL} FROM ifl_actions WHERE ${filter.join(' AND ')} ORDER BY ${view==='today'?'COALESCE(due_at,9223372036854775807),':''}created DESC,id DESC LIMIT ${limit+1}`).bind(...args).all(),items=rows.results.slice(0,limit);
 const counts=await D.prepare("SELECT SUM(status='open') AS open,SUM(status='done') AS done FROM ifl_actions WHERE user_id=? AND status!='deleted'").bind(owner).first();
 return {actions:items.map(action),counts:{open:counts.open||0,done:counts.done||0},cursor:rows.results.length>limit&&!view?`${items.at(-1).created}:${items.at(-1).id}`:null,more:rows.results.length>limit};
}
export async function getAction(env,owner,id){const D=await systemdb(env),r=await row(D,owner,ref(id));if(!r||r.status==='deleted')fail(404,'That reminder is no longer available.');const value=action(r);value.attachments=await Promise.all(value.files.map(async f=>{try{const {item}=await getFile(env,owner,f.id);return item?.status==='ready'&&!item.trashedAt?{...item,changed:item.version!==f.version}:{id:f.id,unavailable:true}}catch(_){return {id:f.id,unavailable:true}}}));return {action:value}}
export async function focusState(env,owner){const D=await systemdb(env);await D.prepare('DELETE FROM ifl_focus_dismissals WHERE user_id=? AND expires<?').bind(owner,Date.now()).run();return {dismissed:(await D.prepare('SELECT id FROM ifl_focus_dismissals WHERE user_id=? AND expires>? LIMIT 50').bind(owner,Date.now()).all()).results.map(r=>r.id)}}
export async function dismissFocus(env,owner,input){if(typeof input?.id!=='string'||!/^(ride|income|draft|plan):[A-Za-z0-9_-]{1,50}$/.test(input.id))fail(400,'That suggestion is invalid.');const D=await systemdb(env);await D.prepare(`INSERT INTO ifl_focus_dismissals(user_id,id,expires) SELECT ?1,?2,?3 WHERE ${owned} AND (SELECT COUNT(*) FROM ifl_focus_dismissals WHERE user_id=?1)<50 ON CONFLICT(user_id,id) DO UPDATE SET expires=excluded.expires`).bind(owner,input.id,Date.now()+DAY).run();return {ok:true}}
export async function listRemembered(env,owner){const D=await continuitydb(env);return {devices:(await D.prepare(`SELECT device_id AS id,revision,label,modified AS updatedAt FROM ifl_continuity WHERE user_id=?1 AND revoked=0 AND ${owned} ORDER BY modified DESC LIMIT 12`).bind(owner).all()).results}}
export async function forgetDevice(env,owner,input){const id=device(input?.id),expected=version(input.version);const D=await systemdb(env);await continuitydb(env);const changes=await D.batch([
 D.prepare(`UPDATE ifl_continuity SET revoked=1,target='null',label='',revision=revision+1,modified=?4 WHERE user_id=?1 AND device_id=?2 AND revision=?3 AND revoked=0 AND ${owned}`).bind(owner,id,expected,Date.now()),
 D.prepare('DELETE FROM ifl_draft_backups WHERE user_id=? AND device_id=? AND changes()>0').bind(owner,id),
]);if(!changes[0].meta?.changes)fail(409,'That device changed. Refresh before forgetting it.');return {ok:true}}
export async function rememberDevice(env,owner,input){const id=device(input?.id),target=continuationTarget(input.target),label=['Phone','Tablet','Computer'].includes(input.label)?input.label:'Computer',D=await continuitydb(env);await D.prepare(`INSERT INTO ifl_continuity(user_id,device_id,revision,target,label,modified,revoked) SELECT ?1,?2,1,?3,?4,?5,0 WHERE ${owned} AND ((SELECT COUNT(*) FROM ifl_continuity WHERE user_id=?1)<200 OR EXISTS(SELECT 1 FROM ifl_continuity WHERE user_id=?1 AND device_id=?2)) ON CONFLICT(user_id,device_id) DO UPDATE SET revoked=0,target=excluded.target,label=excluded.label,modified=excluded.modified,revision=revision+1 WHERE ${owned}`).bind(owner,id,JSON.stringify(target),label,Date.now()).run();await D.prepare("UPDATE ifl_continuity SET revoked=1,target='null',label='',revision=revision+1 WHERE user_id=?1 AND revoked=0 AND device_id IN (SELECT device_id FROM ifl_continuity WHERE user_id=?1 AND revoked=0 ORDER BY modified DESC,device_id DESC LIMIT -1 OFFSET 12)").bind(owner).run();return listRemembered(env,owner)}
async function knownDevice(D,owner,id){if(!await D.prepare(`SELECT 1 FROM ifl_continuity WHERE user_id=?1 AND device_id=?2 AND revoked=0 AND ${owned}`).bind(owner,id).first())fail(410,'This device is not remembered. Enable it in Remembered devices to back up drafts.');}
export async function draftBackups(env,owner){const D=await systemdb(env);await continuitydb(env);return {backups:(await D.prepare(`SELECT b.device_id AS id,b.revision,b.modified AS updatedAt FROM ifl_draft_backups b JOIN ifl_continuity d ON d.user_id=b.user_id AND d.device_id=b.device_id WHERE b.user_id=?1 AND d.revoked=0 AND b.modified>?2 AND ${owned} ORDER BY b.modified DESC LIMIT 12`).bind(owner,Date.now()-14*DAY).all()).results}}
export async function readDraftBackup(env,owner,id){id=device(id);const D=await systemdb(env);await continuitydb(env);await knownDevice(D,owner,id);const r=await D.prepare('SELECT cipher,revision,modified AS updatedAt FROM ifl_draft_backups WHERE user_id=? AND device_id=? AND modified>?').bind(owner,id,Date.now()-14*DAY).first();if(!r)fail(404,'That encrypted draft copy is no longer available.');return r}
export async function saveDraftBackup(env,owner,input){
 const id=device(input?.id),op=operation(input.operationId);if(!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.cipher!=='string'||new TextEncoder().encode(input.cipher).length>256*1024)fail(400,'That encrypted draft copy is too large or invalid.');
 // Validate envelope shape, never its private contents. Empty is an encrypted
 // tombstone too; the server never receives plaintext or an encryption key.
 let envelope;try{envelope=JSON.parse(input.cipher)}catch(_){fail(400,'That encrypted draft envelope is invalid.')}
 if(!object(envelope)||envelope.v!==2||typeof envelope.iv!=='string'||typeof envelope.s!=='string'||typeof envelope.d!=='string'||![envelope.iv,envelope.s,envelope.d].every(s=>/^[A-Za-z0-9+/_=-]+$/.test(s))||Object.keys(envelope).some(k=>!['iv','s','d','v'].includes(k)))fail(400,'That encrypted draft envelope is invalid.');
 const D=await systemdb(env);await continuitydb(env);await knownDevice(D,owner,id);
 await D.prepare('DELETE FROM ifl_draft_backups WHERE user_id=? AND device_id=? AND modified<?').bind(owner,id,Date.now()-14*DAY).run();
 const prior=await D.prepare('SELECT * FROM ifl_draft_backups WHERE user_id=? AND device_id=?').bind(owner,id).first();
 if(prior?.operation_id===op){if(prior.cipher!==input.cipher)fail(409,'That backup operation was already used.');return {revision:prior.revision,updatedAt:prior.modified}}
 const now=Date.now(),guard=`${owned} AND EXISTS(SELECT 1 FROM ifl_continuity WHERE user_id=?1 AND device_id=?2 AND revoked=0)`;
 const r=input.revision===0?await D.prepare(`INSERT INTO ifl_draft_backups(user_id,device_id,revision,cipher,modified,operation_id) SELECT ?1,?2,1,?3,?4,?5 WHERE ${guard} ON CONFLICT(user_id,device_id) DO NOTHING`).bind(owner,id,input.cipher,now,op).run():await D.prepare(`UPDATE ifl_draft_backups SET revision=revision+1,cipher=?3,modified=?4,operation_id=?5 WHERE user_id=?1 AND device_id=?2 AND revision=?6 AND ${guard}`).bind(owner,id,input.cipher,now,op,input.revision).run();
 if(!r.meta?.changes)fail(409,'This device backed up a newer draft. The local draft is kept.');return {revision:input.revision+1,updatedAt:now};
}
export async function exportSystem(env,owner){return {actions:(await (await systemdb(env)).prepare("SELECT *,"+repeatSQL+" FROM ifl_actions WHERE user_id=? AND status!='deleted' ORDER BY created LIMIT 5000").bind(owner).all()).results.map(action),remembered:(await listRemembered(env,owner)).devices}}
