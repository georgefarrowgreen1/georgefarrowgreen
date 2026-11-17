import {HttpError,pace,hex,sha256} from './_pigeon.js';
import {securityOrigin,securityOwner,PRIVATE_HEADERS} from './_security-core.js';
import {permit,securityEvent} from './_security-store.js';
import {signedIn,body,json} from './_accountapi.js';
import {todayOrigin} from './_sites.js';
import {saveRecord,getRecord,listRecords} from './_organise400.js';
import {calendars,previewCalendar,saveCalendar,disconnectCalendar,refreshCalendar,calendarEvents,lifePrefs} from './_life410.js';
import {searchDocuments} from './_documentsearch410.js';
const SAFE=PRIVATE_HEADERS;
const route=fn=>async({request:r,env:e})=>{
 securityOrigin(r,e);const u=await signedIn(r,e);securityOwner(r,u,'organise');
 await pace(e,'organise400:'+u.id,240,60e3);const v=await fn(r,e,u.id,u),answer=json(v);for(const[k,v]of Object.entries(SAFE))answer.headers.set(k,v);return answer;
};
export const ORGANISE_ROUTES={
 'POST today/organise/document-search':route(async(r,e,o,u)=>{const b=await body(r,2048);await permit(e,u,'files.content-search','',r.headers.get('X-Inflite-Security'));const result=await searchDocuments(e,o,b);await securityEvent(e,u,'content-search','files.content-search').catch(()=>{});return result}),
 'GET today/organise/calendars':route((r,e,o)=>calendars(e,o)),
 'POST today/organise/calendar-preview':route(async(r,e,o,u)=>{const b=await body(r,768*1024);if(b.url&&typeof b.url!=='string')throw new HttpError(400,'Choose a valid calendar link.');if(b.url)await permit(e,u,'calendar.subscription',hex(await sha256(b.url)),r.headers.get('X-Inflite-Security'));return previewCalendar(e,o,b)}),
 'PUT today/organise/calendar':route(async(r,e,o,u)=>{const b=await body(r,768*1024);if(b.url&&typeof b.url!=='string')throw new HttpError(400,'Choose a valid calendar link.');if(b.url)await permit(e,u,'calendar.subscription',hex(await sha256(b.url)),r.headers.get('X-Inflite-Security'));return saveCalendar(e,o,b)}),
 'DELETE today/organise/calendar':route((r,e,o)=>disconnectCalendar(e,o,Object.fromEntries(new URL(r.url).searchParams))),
 'POST today/organise/calendar-refresh':route(async(r,e,o,u)=>{const b=await body(r,2048);await permit(e,u,'calendar.subscription',b.id,r.headers.get('X-Inflite-Security'));return refreshCalendar(e,o,b)}),
 'POST today/organise/calendar-events':route(async(r,e,o)=>calendarEvents(e,o,await body(r,2048))),
 'GET today/organise/preferences':route((r,e,o)=>lifePrefs(e,o)),
 'PUT today/organise/preferences':route(async(r,e,o)=>lifePrefs(e,o,await body(r,2048))),
 'POST today/organise/list':route(async(r,e,o)=>listRecords(e,o,await body(r,2048))),
 'GET today/organise/record':route((r,e,o)=>getRecord(e,o,Object.fromEntries(new URL(r.url).searchParams))),
 'PUT today/organise/record':route(async(r,e,o)=>saveRecord(e,o,await body(r,512*1024)))
};
