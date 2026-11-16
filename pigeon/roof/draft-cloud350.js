// Worker-only. The account service stores an opaque envelope, never its key or text.
export function connect({owner,idb,locked,live,seal,open,read}){
 const key='draft-cloud:'+owner;let busy=false,again=null;
 const op=()=>crypto.randomUUID().replaceAll('-','');
 async function request(path,method='GET',body){
  if(!live())throw Error('Unlock Chats to continue.');
  const response=await fetch('/api/system/'+path,{method,credentials:'same-origin',mode:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),headers:{'Accept':'application/json','X-Inflite':'1','X-Inflite-Owner':owner,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  if(!live())throw Error('Unlock Chats to continue.');
  const text=await response.text();if(text.length>400000)throw Error('Draft response is too large.');
  let value;try{value=JSON.parse(text)}catch(_){throw Error('Draft copies could not load.')}
  if(!response.ok){const error=Error(value.error||'Draft copies could not load.');error.status=response.status;throw error}return value;
 }
 async function save(device){
  if(!live()||!/^[a-f0-9]{32}$/.test(device))return;
  if(busy){again=device;return}busy=true;
  try{await locked(key,async()=>{
   if(!live())return;
   // Retry the exact operation first after a lost acknowledgement.
   const pending=await idb.get(key);
   if(pending?.id===device){try{await request('draft','PUT',pending);await idb.del(key)}catch(e){if(e.status!==409)throw e;await idb.del(key)}}
   const list=await request('drafts'),revision=(list.backups||[]).find(x=>x.id===device)?.revision||0;
   const values=await read();if(!live())return;
   const cipher=await seal(values);if(new TextEncoder().encode(cipher).length>256*1024)return;
   const value={id:device,revision,cipher,operationId:op()};if(await idb.set(key,value)!==key)return;
   if(!live())return;await request('draft','PUT',value);if(live())await idb.del(key);
  })}catch(_){/* The acknowledged local encrypted draft remains available. */}finally{busy=false;const next=again;again=null;if(next&&live())save(next)}
 }
 async function copies(chat,device){
  const list=await request('drafts'),out=[],here=new Map(await read());
  for(const meta of (list.backups||[]).slice(0,6)){
   try{const copy=await request('draft?device='+encodeURIComponent(meta.id));const values=await open(copy.cipher),text=values.find(([id])=>id===chat)?.[1];if(live()&&text?.trim()&&text!==here.get(chat))out.push({device:meta.id,updatedAt:copy.updatedAt,preview:text.slice(0,180)})}catch(e){if(!live())throw e}
  }return live()?out:[];
 }
 async function restore(device,chat){if(!/^[a-f0-9]{32}$/.test(device))throw Error('Invalid device.');const value=await request('draft?device='+device),values=await open(value.cipher),text=values.find(([id])=>id===chat)?.[1];if(!live()||typeof text!=='string'||text.length>4000)throw Error('That draft copy is unavailable.');return text}
 return {save,copies,restore,async resume(device){if(live()&&(await idb.get(key))?.id===device)return save(device)}};
}
