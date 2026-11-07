// Set a probe-only secret and verify fixed public UK routes after the service rollout.
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
const token=randomBytes(32).toString('hex');console.log('::add-mask::'+token);
await new Promise((resolve,reject)=>{const p=spawn('./node_modules/.bin/wrangler',['secret','put','ROUTING_PROBE_TOKEN','--config','wrangler.toml'],{stdio:['pipe','inherit','inherit']});p.stdin.end(token+'\n');p.on('exit',code=>code===0?resolve():reject(Error('Probe secret could not be set.')));p.on('error',reject);});
const base=process.env.ROUTING_SITE||'https://inflite-routing.georgefarrowgreen.workers.dev';
for(let attempt=0;attempt<8;attempt++){
 try {
  const r=await fetch(base+'/probe',{method:'POST',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(180000)}),j=await r.json();
  if(r.ok&&j.ready){console.log(JSON.stringify(j));console.log('Owned UK router is ready for the site binding.');process.exit(0);}
  console.log(JSON.stringify({attempt:attempt+1,status:r.status,...j}));
 }catch{console.log(JSON.stringify({attempt:attempt+1,ready:false}));}
 await new Promise(r=>setTimeout(r,10000));
}
throw Error('The dedicated UK routing service did not pass its UK-region readiness checks. The site must not be switched to it.');
