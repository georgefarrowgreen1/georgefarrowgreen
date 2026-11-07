// Verify the deployed site's private binding and exact planner without creating user data.
if(!process.env.TICK_SECRET)throw Error('INFLIGHT_TICK_SECRET is required for the protected deployed-site routing check.');
const base=process.env.SITE||'https://inflite-apps.georgefarrowgreen.workers.dev';
const r=await fetch(base+'/api/routing-check',{method:'POST',headers:{Authorization:'Bearer '+process.env.TICK_SECRET},signal:AbortSignal.timeout(95000)}),j=await r.json();
console.log(JSON.stringify({status:r.status,...j}));
if(!r.ok||!j.ready||!j.count)throw Error('The deployed site did not generate a real UK cycling loop through its private service binding.');
