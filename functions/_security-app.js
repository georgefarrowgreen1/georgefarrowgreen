import {pace} from './_pigeon.js';
import {signedIn,body,json} from './_accountapi.js';
import {securityOrigin,securityOwner,privateResponse} from './_security-core.js';
import {permissions,setPermission,securityEvent} from './_security-store.js';
import {securitySummary,authorise,confirmation,revokeSessions,approveTransfer} from './_security-service.js';
const route=fn=>async ctx=>{const{request:r,env:e}=ctx;securityOrigin(r,e);const u=await signedIn(r,e);securityOwner(r,u,'security');await pace(e,'security-module:'+u.id,120,60000);return privateResponse(json(await fn(ctx,u)));};
const event=(ctx,u,kind,detail)=>{const p=securityEvent(ctx.env,u,kind,detail).catch(()=>console.error('Security Module event unavailable'));if(ctx.waitUntil)ctx.waitUntil(p);return p;};
export const SECURITY_ROUTES={
 'GET today/security/summary':route((ctx,u)=>securitySummary(ctx.env,u)),
 'GET today/security/permissions':route(async(ctx,u)=>({permissions:await permissions(ctx.env,u.id)})),
 'PUT today/security/permission':route(async(ctx,u)=>{const b=await body(ctx.request,2048),p=await setPermission(ctx.env,u,b);event(ctx,u,'permission-changed',b.key);return{permissions:p}}),
 'POST today/security/authorise':route(async(ctx,u)=>{const b=await body(ctx.request,1024),r=await authorise(ctx.env,u,b);event(ctx,u,'permission-once',b.key);return r}),
 'POST today/security/confirmation':route(async(ctx,u)=>confirmation(ctx.env,u,await body(ctx.request,1024))),
 'POST today/security/sessions/revoke':route(async(ctx,u)=>revokeSessions(ctx.env,u,await body(ctx.request,1024))),
 'POST today/security/file-transfer':route(async(ctx,u)=>{const b=await body(ctx.request,2048),r=await approveTransfer(ctx.env,u,b,ctx.request.headers.get('X-Inflite-Security'));event(ctx,u,'file-transfer',r.key);return{ok:true}})
};
