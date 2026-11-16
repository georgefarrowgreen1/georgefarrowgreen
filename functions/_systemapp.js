import {HttpError,pace} from './_pigeon.js';
import {signedIn,body,json} from './_accountapi.js';
import {todayOrigin} from './_sites.js';
import {createAction,updateAction,listActions,getAction,focusState,dismissFocus,listRemembered,forgetDevice,rememberDevice,draftBackups,readDraftBackup,saveDraftBackup} from './_system350.js';
const SAFE={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
function route(write,fn){return async({request,env})=>{
 if(request.headers.get('Origin')!==todayOrigin(env,request)||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')throw new HttpError(403,'That request did not come from InFlite.');
 const user=await signedIn(request,env),owner=request.headers.get('X-Inflite-Owner');if(!/^[\w-]{1,80}$/.test(owner||'')||owner!==user.id)throw new HttpError(401,'Your account changed. Refresh before continuing.','session');
 await pace(env,'system350:'+user.id,240,60e3);const value=await fn(request,env,user.id),r=json(value);for(const[k,v]of Object.entries(SAFE))r.headers.set(k,v);return r;
}}
const query=r=>new URL(r.url).searchParams;
export const SYSTEM_ROUTES={
 'GET today/system/actions':route(false,(r,e,o)=>listActions(e,o,Object.fromEntries(query(r)))),
 'GET today/system/action':route(false,(r,e,o)=>getAction(e,o,query(r).get('id'))),
 'POST today/system/actions':route(true,async(r,e,o)=>createAction(e,o,await body(r,8192))),
 'PATCH today/system/action':route(true,async(r,e,o)=>updateAction(e,o,await body(r,8192))),
 'DELETE today/system/action':route(true,(r,e,o)=>updateAction(e,o,{id:query(r).get('id'),version:Number(query(r).get('version')),operationId:query(r).get('operation'),status:'deleted'})),
 'POST today/system/search':route(true,async(r,e,o)=>{const b=await body(r,1024);return listActions(e,o,{status:'all',q:b.q})}),
 'GET today/system/focus':route(false,(r,e,o)=>focusState(e,o)),
 'POST today/system/focus-dismiss':route(true,async(r,e,o)=>dismissFocus(e,o,await body(r,1024))),
 'GET today/system/devices':route(false,(r,e,o)=>listRemembered(e,o)),
 'DELETE today/system/device':route(true,(r,e,o)=>forgetDevice(e,o,{id:query(r).get('id'),version:Number(query(r).get('version'))})),
 'POST today/system/device-remember':route(true,async(r,e,o)=>rememberDevice(e,o,await body(r,2048))),
 'GET today/system/drafts':route(false,(r,e,o)=>draftBackups(e,o)),
 'GET today/system/draft':route(false,(r,e,o)=>readDraftBackup(e,o,query(r).get('device'))),
 'PUT today/system/draft':route(true,async(r,e,o)=>saveDraftBackup(e,o,await body(r,384*1024))),
};
