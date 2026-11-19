// Private Calendar, Notes and People. One versioned record contract; no copied
// app messages, external URLs, public reads or implicit invitations.
import {HttpError,sha256,hex,DAY} from './_pigeon.js';
import {tablesOnce} from './_fitness.js';
import {getFile} from './_files.js';
const fail=(n,s)=>{throw new HttpError(n,s)},ID=/^[a-f0-9]{32}$/;
const owned="EXISTS(SELECT 1 FROM pg_users WHERE id=?1 AND delete_at IS NULL)";
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>{if(!obj(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail(400,'Check the fields in this item.');};
const str=(v,max,label,required=false)=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(v))fail(400,'Check '+label+'.');if(required&&!v.trim())fail(400,'Enter '+label+'.');return v;};
const id=v=>typeof v==='string'&&ID.test(v)?v:fail(400,'That reference is invalid.');
const kind=v=>['calendar','notes','people'].includes(v)?v:fail(400,'Choose an InFlite app.');
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v?v:fail(400,'Choose a valid date.');
const stamp=v=>Number.isSafeInteger(v)&&v>=0&&v<=Date.parse('2100-01-01')?v:fail(400,'Choose a valid time.');
export async function organisedb(env){
 const D=await tablesOnce(env,'organise-400-v1',async D=>D.batch([
  D.prepare("CREATE TABLE IF NOT EXISTS ifl_records(user_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,payload TEXT NOT NULL,version INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL,modified INTEGER NOT NULL,PRIMARY KEY(user_id,kind,id),CHECK(kind IN('calendar','notes','people')))"),
  D.prepare('CREATE INDEX IF NOT EXISTS ifl_records_list ON ifl_records(user_id,kind,deleted,modified DESC,id DESC)'),
  D.prepare('CREATE TABLE IF NOT EXISTS ifl_record_operations(user_id TEXT NOT NULL,id TEXT NOT NULL,signature TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(user_id,id))')
 ]));return D.withSession?D.withSession('first-primary'):D;
}
const record=r=>({id:r.id,kind:r.kind,title:r.title,...JSON.parse(r.payload),version:r.version,deleted:!!r.deleted,createdAt:r.created,updatedAt:r.modified});
const find=(D,o,k,i)=>D.prepare(`SELECT * FROM ifl_records WHERE user_id=?1 AND kind=?2 AND id=?3 AND ${owned}`).bind(o,k,i).first();
async function references(env,o,values,D){
 if(!Array.isArray(values)||values.length>12)fail(400,'Link up to twelve items.');const refs=[],seen=new Set();
 for(const v of values){keys(v,['app','id','item']);if(!['calendar','notes','people','files','fitness','weather','markets','chats','mail'].includes(v.app))fail(400,'That source is invalid.');
  const r={app:v.app};if(v.id!=null)r.id=str(v.id,64,'the source',true);if(r.id&&!/^[\w-]{1,64}$/.test(r.id))fail(400,'That source is invalid.');if(v.item!=null){r.item=str(v.item,64,'the source item');if(!/^[\w-]{1,64}$/.test(r.item))fail(400,'That source item is invalid.');}
  if(['calendar','notes','people','files','chats','mail'].includes(r.app)&&!r.id)fail(400,'Choose a source item.');
  if(['calendar','notes','people'].includes(r.app)){const x=await find(D,o,r.app,id(r.id));if(!x||x.deleted)fail(404,'That linked item is no longer available.');}
  if(r.app==='files'){const {item}=await getFile(env,o,/^[A-Za-z0-9_-]{32}$/.test(r.id)?r.id:fail(400,'That file reference is invalid.'));if(!item||item.trashedAt||item.status!=='ready'||item.kind!=='file')fail(404,'That file is no longer available.');}
  const key=JSON.stringify(r);if(!seen.has(key)){refs.push(r);seen.add(key)}
 }return refs;
}
async function clean(env,o,k,v,D){
 const fields=['title','links',...(k==='calendar'?['description','start','end','allDay','startDate','endDate','timezone']:k==='notes'?['text','checklist']:['email','phone','organisation','details'])];keys(v,fields);
 const title=str(v.title,160,k==='people'?'a name':'a title',true).trim(),links=await references(env,o,v.links||[],D);
 if(k==='notes'){
  const list=v.checklist||[];if(!Array.isArray(list)||list.length>200)fail(400,'Use up to 200 checklist items.');
  const seen=new Set(),checklist=list.map(x=>{keys(x,['id','text','done']);const i=id(x.id);if(seen.has(i)||typeof x.done!=='boolean')fail(400,'Check the checklist.');seen.add(i);return{id:i,text:str(x.text,500,'the checklist item'),done:x.done}});
  return {title,text:str(v.text??'',64000,'the note'),checklist,links};
 }
 if(k==='people'){
  const email=str(v.email??'',254,'the email address').trim(),phone=str(v.phone??'',40,'the phone number').trim();if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||phone&&!/^[+\d ()#.*-]+$/.test(phone))fail(400,'Check the contact details.');
  return{title,email,phone,organisation:str(v.organisation??'',160,'the organisation'),details:str(v.details??'',4000,'the contact notes'),links};
 }
 if(typeof v.allDay!=='boolean')fail(400,'Choose an event type.');const timezone=str(v.timezone,80,'the time zone',true);try{new Intl.DateTimeFormat('en',{timeZone:timezone})}catch(_){fail(400,'Choose a valid time zone.')}
 const out={title,description:str(v.description??'',4000,'the description'),allDay:v.allDay,timezone,links};
 if(v.allDay){out.startDate=day(v.startDate);out.endDate=day(v.endDate);if(out.endDate<=out.startDate||Date.parse(out.endDate)-Date.parse(out.startDate)>366*DAY)fail(400,'The end date must follow the start date, within a year.');}
 else{out.start=stamp(v.start);out.end=stamp(v.end);if(out.end<=out.start||out.end-out.start>31*DAY)fail(400,'The end time must follow the start time, within 31 days.');}
 return out;
}
export async function saveRecord(env,o,input){
 keys(input,['kind','id','version','operationId','value','deleted']);const k=kind(input.kind),i=id(input.id),op=id(input.operationId),v=input.version;
 if(!Number.isSafeInteger(v)||v<0||typeof input.deleted!=='boolean')fail(400,'Refresh to check the version.');
 const D=await organisedb(env),signature=hex(await sha256(JSON.stringify(input))),previous=await D.prepare(`SELECT * FROM ifl_record_operations WHERE user_id=?1 AND id=?2 AND ${owned}`).bind(o,op).first();
 if(previous){if(previous.signature!==signature)fail(409,'This save was used for another change.');if((await find(D,o,k,i))?.deleted&&!input.deleted)fail(410,'This item was deleted. Save your work as a new copy.');return{record:JSON.parse(previous.result)}}
 const before=await find(D,o,k,i);if(before?.deleted&&!input.deleted)fail(410,'This item was deleted. Save your work as a new copy.');if((before?.version||0)!==v||!before&&input.deleted)fail(409,'This item changed on another device. Review it before saving.');
 const value=input.deleted?{title:'',links:[]}:await clean(env,o,k,input.value,D),{title,...payload}=value,now=Date.now();
 const result={id:i,kind:k,title,...payload,version:v+1,deleted:input.deleted,createdAt:before?.created||now,updatedAt:now};
 const write=v===0?D.prepare(`INSERT INTO ifl_records(user_id,kind,id,title,payload,version,created,modified) SELECT ?1,?2,?3,?4,?5,1,?6,?6 WHERE ${owned} AND (SELECT COUNT(*) FROM ifl_records WHERE user_id=?1 AND kind=?2 AND deleted=0)<2000 ON CONFLICT DO NOTHING`).bind(o,k,i,title,JSON.stringify(payload),now):D.prepare(`UPDATE ifl_records SET title=?4,payload=?5,version=version+1,deleted=?6,modified=?7 WHERE user_id=?1 AND kind=?2 AND id=?3 AND version=?8 AND deleted=0 AND ${owned}`).bind(o,k,i,title,JSON.stringify(payload),input.deleted?1:0,now,v);
 let changes;try{changes=await D.batch([write,D.prepare('INSERT INTO ifl_record_operations(user_id,id,signature,result,created) SELECT ?,?,?,?,? WHERE changes()>0').bind(o,op,signature,JSON.stringify(result),now)])}catch(error){const prior=await D.prepare('SELECT signature FROM ifl_record_operations WHERE user_id=? AND id=?').bind(o,op).first();if(prior&&prior.signature!==signature)fail(409,'This save was used for another change.');throw error}

 if(!changes[0].meta?.changes){const retry=await D.prepare('SELECT * FROM ifl_record_operations WHERE user_id=? AND id=?').bind(o,op).first();if(retry?.signature===signature)return{record:JSON.parse(retry.result)};fail(409,'This item changed or your app is full. Review before saving.');}
 // Bounded retention. A retry outside this window remains fenced by its version.
 await D.prepare('DELETE FROM ifl_record_operations WHERE user_id=?1 AND (created<?2 OR id NOT IN(SELECT id FROM ifl_record_operations WHERE user_id=?1 ORDER BY created DESC,id DESC LIMIT 500))').bind(o,now-30*DAY).run();
 return {record:result};
}
export async function getRecord(env,o,{kind:k,id:i}){const D=await organisedb(env),r=await find(D,o,kind(k),id(i));if(!r||r.deleted)fail(404,'This item is no longer available.');const value=record(r);value.linkedLabels=await Promise.all(value.links.map(async ref=>{let title=null,unavailable=false;if(['calendar','notes','people'].includes(ref.app)){const linked=await find(D,o,ref.app,ref.id);title=linked&&!linked.deleted?linked.title:null;unavailable=!title}else if(ref.app==='files'){try{const {item}=await getFile(env,o,ref.id);if(item&&!item.trashedAt)title=item.name;else unavailable=true}catch(error){if([404,410].includes(error.status))unavailable=true;else throw error}}return{...ref,...(title?{title}:{}),...(unavailable?{unavailable:true}:{})}}));return{record:value}}

export async function listRecords(env,o,input={}){
 keys(input,['kind','cursor','q','limit','fromDate','toDate','from','to','related']);const k=kind(input.kind),D=await organisedb(env),q=str(input.q??'',160,'the search'),args=[o,k],where=['user_id=?1','kind=?2','deleted=0',owned],limit=input.limit===undefined?60:input.limit;
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'Check the page size.');
 if(input.related!==undefined){
  keys(input.related,['app','id']);
  const chat=k==='people'&&input.related.app==='chats';
  const app=chat?'chats':kind(input.related.app);
  const i=chat?str(input.related.id,40,'the Chat friend',true):id(input.related.id);
  if(chat&&!/^[\w-]+$/.test(i))fail(400,'That Chat friend is invalid.');
  args.push(app,i);where.push(`EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.links')) link WHERE json_extract(link.value,'$.app')=?${args.length-1} AND json_extract(link.value,'$.id')=?${args.length})`);
 }
 if(input.fromDate!==undefined){if(k!=='calendar')fail(400,'Choose a calendar range.');const a=day(input.fromDate),b=day(input.toDate),from=stamp(input.from),to=stamp(input.to);if(b<=a||Date.parse(b)-Date.parse(a)>366*DAY||to<=from||to-from>367*DAY)fail(400,'Choose a smaller date range.');args.push(a,b,from,to);const n=args.length;where.push(`((json_extract(payload,'$.allDay')=1 AND json_extract(payload,'$.startDate')<?${n-2} AND json_extract(payload,'$.endDate')>?${n-3}) OR (json_extract(payload,'$.allDay')=0 AND json_extract(payload,'$.start')<?${n} AND json_extract(payload,'$.end')>?${n-1}))`)}
 if(q){args.push('%'+q.replace(/[\\%_]/g,c=>'\\'+c)+'%');where.push(`(title LIKE ?${args.length} ESCAPE '\\' OR json_extract(payload,'$.text') LIKE ?${args.length} ESCAPE '\\' OR json_extract(payload,'$.description') LIKE ?${args.length} ESCAPE '\\' OR json_extract(payload,'$.details') LIKE ?${args.length} ESCAPE '\\' OR json_extract(payload,'$.email') LIKE ?${args.length} ESCAPE '\\' OR json_extract(payload,'$.organisation') LIKE ?${args.length} ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(json_extract(payload,'$.checklist')) c WHERE json_extract(c.value,'$.text') LIKE ?${args.length} ESCAPE '\\'))`)}
 const chronological=k==='calendar'&&input.fromDate!==undefined,sort=chronological?"COALESCE(json_extract(payload,'$.start'),CAST(strftime('%s',json_extract(payload,'$.startDate')) AS INTEGER)*1000)":'modified',direction=chronological?'ASC':'DESC',compare=chronological?'>':'<';
 if(input.cursor){const m=/^(\d{1,16}):([a-f0-9]{32})$/.exec(input.cursor);if(!m)fail(400,'Refresh the list.');args.push(Number(m[1]),m[2]);where.push(`(${sort}${compare}?${args.length-1} OR ${sort}=?${args.length-1} AND id${compare}?${args.length})`)}
 const rows=(await D.prepare(`SELECT *,${sort} AS sort_at FROM ifl_records WHERE ${where.join(' AND ')} ORDER BY sort_at ${direction},id ${direction} LIMIT ${limit+1}`).bind(...args).all()).results,items=rows.slice(0,limit);

 // Lists intentionally omit large note bodies; detail requests fetch one record.
 return{records:items.map(r=>{const v=record(r);if(q){const content=[v.text,...(v.checklist||[]).map(c=>c.text),v.description,v.details,v.email,v.organisation].filter(Boolean).join(' · '),at=content.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());if(at>=0)v.matchPreview=(at>60?'…':'')+content.slice(Math.max(0,at-60),at+q.length+100)}delete v.description;delete v.details;if(k==='notes'){v.preview=v.text.slice(0,180);delete v.text;v.checkCount=v.checklist.length;v.doneCount=v.checklist.filter(x=>x.done).length;delete v.checklist;}return v}),cursor:rows.length>limit?`${items.at(-1).sort_at}:${items.at(-1).id}`:null};
}
export async function streamOrganiseExport(env,o,base){
 const D=await organisedb(env),encoder=new TextEncoder();let begun=false,done=false,cursorKind='',cursorId='',first=true;
 return new ReadableStream({async pull(controller){if(done)return;try{if(!begun){begun=true;controller.enqueue(encoder.encode(JSON.stringify(base).slice(0,-1)+',"organise":['));return}const rows=(await D.prepare(`SELECT * FROM ifl_records WHERE user_id=?1 AND deleted=0 AND (kind>?2 OR kind=?2 AND id>?3) AND ${owned} ORDER BY kind,id LIMIT 5`).bind(o,cursorKind,cursorId).all()).results;if(done)return;if(!rows.length){done=true;controller.enqueue(encoder.encode(']}'));controller.close();return}for(const r of rows){controller.enqueue(encoder.encode((first?'':',')+JSON.stringify(record(r))));first=false}cursorKind=rows.at(-1).kind;cursorId=rows.at(-1).id}catch(error){done=true;controller.error(error)}},cancel(){done=true}});
}
