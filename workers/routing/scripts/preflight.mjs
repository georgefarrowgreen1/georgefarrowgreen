// Read-only hosting check. Never print tokens, account names or raw API responses.
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token){console.log(JSON.stringify({hosting:'unavailable',reason:'missing_deploy_token'}));process.exitCode=1;}else{
 const get=async path=>{const r=await fetch('https://api.cloudflare.com/client/v4/'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});const j=await r.json().catch(()=>({}));return {status:r.status,ok:r.ok&&j.success!==false,data:j.result};};
 let account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(!account){const r=await get('accounts');if(r.ok&&r.data?.length===1)account=r.data[0].id;}
 if(!account){console.log(JSON.stringify({hosting:'unavailable',reason:'account_not_selected'}));process.exitCode=1;}else{
  const r=await get(`accounts/${account}/containers/me`);
  console.log(JSON.stringify({hosting:r.ok?'containers_accessible':'unavailable',http:r.status,reason:r.ok?'preflight_ok':r.status===403?'container_permission_missing':'containers_not_ready'}));
  if(!r.ok)process.exitCode=1;
 }
}
