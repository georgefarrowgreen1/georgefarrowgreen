// Copy immutable build inputs to/from a private, dedicated R2 bucket. No runtime map downloads.
import {readFile,mkdir,stat,rename} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),mode=process.argv[2]||'restore',token=process.env.CLOUDFLARE_API_TOKEN;
const raw=await readFile(root+'data.lock.json'),lock=JSON.parse(raw),version=lock.date+'-'+createHash('sha256').update(raw).digest('hex').slice(0,12),bucket='inflite-routing-data';
if(!token)throw Error('Cloudflare deployment credentials are required for the owned map snapshot.');
const api=async(path,options={})=>fetch('https://api.cloudflare.com/client/v4/'+path,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(180000)});
let account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!account){const r=await api('accounts'),j=await r.json();if(!r.ok||j.result?.length!==1)throw Error('Select the Cloudflare account.');account=j.result[0].id;}
const base=`accounts/${account}/r2/buckets/${bucket}`;
let r=await api(base);if(r.status===404){if(mode==='restore'){console.log('First snapshot: use the pinned upstream inputs, then mirror them before deployment.');process.exit(0);}r=await api(`accounts/${account}/r2/buckets`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:bucket,locationHint:'weur'})});}
if(!r.ok)throw Error('Owned routing snapshot storage is unavailable (HTTP '+r.status+').');await r.body?.cancel();
const items=[{file:'engine.zip',sha256:lock.engine.sha256,path:root+'.build/engine.zip'},...lock.files.map(f=>({...f,path:root+'.build/segments/'+f.file}))];
for(const item of items){
 const key='uk/'+version+'/'+item.file,url=base+'/objects/'+encodeURIComponent(key);
 if(mode==='restore'){
  const got=await api(url);if(got.status===404){await got.body?.cancel();continue;}if(!got.ok)throw Error('Snapshot read failed (HTTP '+got.status+').');
  await mkdir(item.path.slice(0,item.path.lastIndexOf('/')),{recursive:true});const tmp=item.path+'.part';await pipeline(Readable.fromWeb(got.body),createWriteStream(tmp));
  const hash=createHash('sha256');for await(const b of createReadStream(tmp))hash.update(b);if(hash.digest('hex')!==item.sha256)throw Error('Owned snapshot checksum mismatch: '+item.file);await rename(tmp,item.path);
 }else{
  const existing=await api(url);if(existing.ok){await existing.body?.cancel();continue;}if(existing.status!==404)throw Error('Snapshot availability check failed.');await existing.body?.cancel();
  const size=(await stat(item.path)).size,put=await api(url,{method:'PUT',headers:{'Content-Type':'application/octet-stream','Content-Length':String(size)},body:createReadStream(item.path),duplex:'half'});
  if(!put.ok)throw Error('Snapshot write failed (HTTP '+put.status+').');await put.body?.cancel();
 }
 console.log(JSON.stringify({snapshot:version,file:item.file,action:mode}));
}
