// Immutable, quota-charged file revisions. A replacement never hides the current
// file; the account CAS commits bytes + history + quota in one transaction.
import { HttpError, randomToken } from './_pigeon.js';
import { filesdb, mutate, putExact, fileId, itemOf, FILE_LIMITS } from './_files.js';
const fail=(s,m)=>{throw new HttpError(s,m)};
const op=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{16,80}$/.test(v)?v:fail(400,'That upload reference is invalid.');
const node=(D,o,id)=>D.prepare('SELECT * FROM ifl_files_nodes WHERE user_id=? AND id=?').bind(o,id).first();
const reservation=(D,o,id)=>D.prepare('SELECT * FROM ifl_files_replacements WHERE user_id=? AND operation_id=?').bind(o,id).first();
const ready=r=>{if(!r||r.kind!=='file'||r.state!=='ready'||r.trash_at)fail(404,'That file is no longer available.');return r};
export async function fileHistory(env,owner,id){
 const D=await filesdb(env),r=ready(await node(D,owner,fileId(id)));
 const rows=await D.prepare('SELECT id,size,mime,created,version FROM ifl_files_history WHERE user_id=? AND file_id=? ORDER BY version DESC LIMIT 20').bind(owner,id).all();
 return {item:itemOf(r),versions:rows.results.map(v=>({id:v.id,size:v.size,mime:v.mime,createdAt:v.created,version:v.version}))};
}
export async function reserveReplacement(env,owner,input){
 const id=fileId(input.id),operationId=op(input.operationId),size=input.size,mime=typeof input.mime==='string'&&input.mime.length<=100&&/^[\w.+-]+\/[\w.+-]+$/.test(input.mime)?input.mime:'application/octet-stream';
 if(!Number.isSafeInteger(size)||size<0||size>FILE_LIMITS.file||!Number.isSafeInteger(input.version)||input.version<1)fail(400,'Check the file size and version.');
 return mutate(env,owner,async D=>{
  const prior=await reservation(D,owner,operationId);
  if(prior){if(prior.file_id!==id||prior.expected!==input.version||prior.size!==size||prior.mime!==mime)fail(409,'That upload was used for different contents.');return {done:true,value:{uploadId:operationId,committed:prior.state==='committed'}}}
  const row=ready(await node(D,owner,id));if(row.version!==input.version)fail(409,'This file changed on another device. Refresh before replacing it.');
  const count=await D.prepare("SELECT COUNT(*) AS n FROM ifl_files_replacements WHERE user_id=? AND state!='committed'").bind(owner).first();if(count.n>=20)fail(429,'Finish or cancel earlier replacements first.');
  return {reserved:size,statement:X=>X.prepare("INSERT INTO ifl_files_replacements(user_id,operation_id,file_id,expected,size,mime,state,expires) SELECT ?,?,?,?,?,?,'pending',? WHERE changes()>0").bind(owner,operationId,id,input.version,size,mime,Date.now()+FILE_LIMITS.uploadMs),result:()=>({uploadId:operationId,committed:false})};
 });
}
export async function uploadReplacement(env,owner,uploadId,request){
 uploadId=op(uploadId);const key=`files/${owner}/revisions/${randomToken(24)}`;
 const claim=await mutate(env,owner,async D=>{
  const r=await reservation(D,owner,uploadId);if(!r)fail(404,'That replacement is no longer available.');
  if(r.state==='committed')return {done:true,value:{item:itemOf(ready(await node(D,owner,r.file_id))),committed:true}};
  if(r.expires<=Date.now())fail(410,'That replacement expired. Choose the file again.');
  if(r.state==='uploading')fail(409,'This upload is still finishing. Retry in a few minutes.');
  const current=ready(await node(D,owner,r.file_id));if(current.version!==r.expected)fail(409,'This file changed. Your current file was kept.');
  return {statement:X=>X.prepare("UPDATE ifl_files_replacements SET state='uploading',storage_key=?,expires=? WHERE user_id=? AND operation_id=? AND changes()>0").bind(key,Date.now()+5*60e3,owner,uploadId),result:()=>r};
 });
 if(claim.committed){request.body?.cancel().catch(()=>{});return claim}
 try{
  await putExact(env,key,request,claim.size);
  const result=await mutate(env,owner,async D=>{
   const r=await reservation(D,owner,uploadId),current=ready(await node(D,owner,claim.file_id));
   if(r?.state==='committed')return {done:true,value:{item:itemOf(current)}};
   if(r?.state!=='uploading'||r.storage_key!==key||current.version!==claim.expected||request.signal.aborted)fail(409,'This file changed. Your current file was kept.');
   const old=await D.prepare('SELECT id,storage_key,size FROM ifl_files_history WHERE user_id=? AND file_id=? ORDER BY version DESC LIMIT -1 OFFSET 19').bind(owner,current.id).all();
   // Each archived revision owns different bytes. Restores stream a fresh copy,
   // so pruning never removes bytes still referenced by the current file.
   const prune=old.results,historyId=randomToken(24),stamp=Date.now();
   return {used:claim.size-prune.reduce((n,v)=>n+v.size,0),reserved:-claim.size,
    statement:X=>X.prepare('INSERT INTO ifl_files_history(user_id,file_id,id,storage_key,size,mime,created,version) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(owner,current.id,historyId,current.storage_key,current.size,current.mime,current.modified,current.version),
    after:[X=>X.prepare("UPDATE ifl_files_nodes SET storage_key=?,size=?,mime=?,modified=?,version=version+1 WHERE user_id=? AND id=? AND changes()>0").bind(key,claim.size,claim.mime,stamp,owner,current.id),X=>X.prepare("UPDATE ifl_files_replacements SET state='committed',expires=? WHERE user_id=? AND operation_id=? AND changes()>0").bind(stamp+864e5,owner,uploadId),...(prune.length?[X=>X.prepare(`DELETE FROM ifl_files_history WHERE user_id=? AND file_id=? AND id IN(${prune.map(()=>'?').join(',')}) AND changes()>0`).bind(owner,current.id,...prune.map(v=>v.id))]:[])],changes:[1,1,1,...(prune.length?[prune.length]:[])],
    result:async X=>({item:itemOf(await node(X,owner,current.id)),pruned:prune.map(v=>v.storage_key)})};
  });
  if(result.pruned?.length)await env.FILES_R2.delete(result.pruned).catch(()=>{});
  return {item:result.item};
 }catch(error){
  const D=await filesdb(env),r=await reservation(D,owner,uploadId);
  if(r?.state==='committed'&&r.storage_key===key)return {item:itemOf(ready(await node(D,owner,r.file_id)))};
  // Keep the durable intent retryable. An old writer cannot reset a newer lease.
  await D.prepare("UPDATE ifl_files_replacements SET state='pending',storage_key=NULL,expires=? WHERE user_id=? AND operation_id=? AND storage_key=? AND state='uploading'").bind(Date.now()+FILE_LIMITS.uploadMs,owner,uploadId,key).run();
  await env.FILES_R2.delete(key).catch(()=>{});throw error;
 }
}
export async function historicalContent(env,owner,id,versionId){
 const D=await filesdb(env),current=ready(await node(D,owner,fileId(id)));
 const r=await D.prepare('SELECT * FROM ifl_files_history WHERE user_id=? AND file_id=? AND id=?').bind(owner,id,fileId(versionId)).first();if(!r)fail(404,'That version is no longer available.');
 const object=await env.FILES_R2.get(r.storage_key);if(!object||object.size!==r.size)fail(404,'That version is no longer available.');return {row:{...current,size:r.size,mime:r.mime},object,range:null};
}
export async function restoreVersion(env,owner,input,request){
 const previous=await historicalContent(env,owner,input.id,input.versionId);
 const reserved=await reserveReplacement(env,owner,{id:input.id,version:input.version,operationId:input.operationId,size:previous.row.size,mime:previous.row.mime});
 if(reserved.committed){previous.object.body?.cancel().catch(()=>{});return {item:itemOf(ready(await node(await filesdb(env),owner,input.id)))}}
 return uploadReplacement(env,owner,reserved.uploadId,new Request(request.url,{method:'PUT',body:previous.object.body,signal:request.signal}));
}
export async function sweepReplacements(env,now=Date.now()){
 const D=await filesdb(env),rows=await D.prepare("SELECT * FROM ifl_files_replacements WHERE expires<? AND state!='committed' LIMIT 50").bind(now).all();
 for(const row of rows.results)await mutate(env,row.user_id,async X=>{
  const current=await reservation(X,row.user_id,row.operation_id);if(!current||current.state==='committed'||current.expires>=now)return {done:true,value:null};
  return {reserved:-current.size,statement:Y=>Y.prepare('DELETE FROM ifl_files_replacements WHERE user_id=? AND operation_id=? AND changes()>0').bind(row.user_id,row.operation_id)};
 },{deleting:true});
 // A terminated stream's immutable object is reclaimed by the normal orphan scan.
 await D.prepare("DELETE FROM ifl_files_replacements WHERE state='committed' AND expires<?").bind(now).run();
}

export async function cancelReplacement(env,owner,uploadId){
 uploadId=op(uploadId);return mutate(env,owner,async D=>{const r=await reservation(D,owner,uploadId);if(!r||r.state==='committed')return {done:true,value:{ok:true}};return {reserved:-r.size,statement:X=>X.prepare('DELETE FROM ifl_files_replacements WHERE user_id=? AND operation_id=? AND changes()>0').bind(owner,uploadId)}});
}
