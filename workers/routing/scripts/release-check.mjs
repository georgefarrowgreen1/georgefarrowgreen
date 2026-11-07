// A merge with an identical source tree rechecks the deployed router without restarting it.
const expected=process.argv[2];
let current=false;
try {const r=await fetch((process.env.ROUTING_SITE||'https://inflite-routing.georgefarrowgreen.workers.dev')+'/health',{signal:AbortSignal.timeout(10000)});const j=await r.json();current=r.ok&&j.release===expected;}catch{}
console.log('current='+current);
