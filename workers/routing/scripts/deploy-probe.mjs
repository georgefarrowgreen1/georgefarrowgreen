// Separate bounded checks expose the failed stage without retrying whole heavy loop batches.
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {PROBES,LOOP_CHECKS} from '../src/probes.js';
const token=randomBytes(32).toString('hex');console.log('::add-mask::'+token);
await new Promise((resolve,reject)=>{const p=spawn('./node_modules/.bin/wrangler',['secret','put','ROUTING_PROBE_TOKEN','--config','wrangler.toml'],{stdio:['pipe','inherit','inherit']});p.stdin.end(token+'\n');p.on('exit',code=>code===0?resolve():reject(Error('Probe secret could not be set.')));p.on('error',reject);});
const base=process.env.ROUTING_SITE||'https://inflite-routing.georgefarrowgreen.workers.dev';
for(const mode of ['release',...PROBES.map(p=>p.name),...Object.keys(LOOP_CHECKS)]){
 const isLoop=Object.hasOwn(LOOP_CHECKS,mode);let ready=false;
 for(let attempt=0;attempt<(mode==='release'?8:isLoop?1:3);attempt++){
  try{
   const r=await fetch(base+'/probe',{method:'POST',headers:{Authorization:'Bearer '+token,'X-Routing-Check':mode},signal:AbortSignal.timeout(isLoop||mode==='release'?95000:45000)}),j=await r.json();
   console.log(JSON.stringify({check:mode,attempt:attempt+1,status:r.status,...j}));
   if(r.ok&&j.ready){ready=true;break;}
  }catch(e){console.log(JSON.stringify({check:mode,attempt:attempt+1,ready:false,error:e.name}));}
  if(!isLoop)await new Promise(r=>setTimeout(r,10000));
 }
 if(!ready)throw Error('The dedicated UK router failed '+mode+'. The site must not be switched to it.');
}
console.log('Owned UK router is ready for the site binding.');
