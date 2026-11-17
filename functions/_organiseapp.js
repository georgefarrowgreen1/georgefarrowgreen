import {HttpError,pace} from './_pigeon.js';
import {signedIn,body,json} from './_accountapi.js';
import {todayOrigin} from './_sites.js';
import {saveRecord,getRecord,listRecords} from './_organise400.js';
import {calendars,previewCalendar,saveCalendar,disconnectCalendar,refreshCalendar,calendarEvents,lifePrefs} from './_life410.js';
import {searchDocuments} from './_documentsearch410.js';
const SAFE={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"};
const route=fn=>async({request:r,env:e})=>{
 if(r.headers.get('Origin')!==todayOrigin(e,r)||r.headers.has('Sec-Fetch-Site')&&r.headers.get('Sec-Fetch-Site')!=='same-origin')throw new HttpError(403,'That request did not come from InFlite.');
 const u=await signedIn(r,e);if(r.headers.get('X-Inflite-Owner')!==u.id)throw new HttpError(401,'Your account changed. Refresh before continuing.','session');
 await pace(e,'organise400:'+u.id,240,60e3);const v=await fn(r,e,u.id),answer=json(v);for(const[k,v]of Object.entries(SAFE))answer.headers.set(k,v);return answer;
};
export const ORGANISE_ROUTES={
 'POST today/organise/document-search':route(async(r,e,o)=>searchDocuments(e,o,await body(r,2048))),
 'GET today/organise/calendars':route((r,e,o)=>calendars(e,o)),
 'POST today/organise/calendar-preview':route(async(r,e,o)=>previewCalendar(e,o,await body(r,768*1024))),
 'PUT today/organise/calendar':route(async(r,e,o)=>saveCalendar(e,o,await body(r,768*1024))),
 'DELETE today/organise/calendar':route((r,e,o)=>disconnectCalendar(e,o,Object.fromEntries(new URL(r.url).searchParams))),
 'POST today/organise/calendar-refresh':route(async(r,e,o)=>refreshCalendar(e,o,await body(r,2048))),
 'POST today/organise/calendar-events':route(async(r,e,o)=>calendarEvents(e,o,await body(r,2048))),
 'GET today/organise/preferences':route((r,e,o)=>lifePrefs(e,o)),
 'PUT today/organise/preferences':route(async(r,e,o)=>lifePrefs(e,o,await body(r,2048))),
 'POST today/organise/list':route(async(r,e,o)=>listRecords(e,o,await body(r,2048))),
 'GET today/organise/record':route((r,e,o)=>getRecord(e,o,Object.fromEntries(new URL(r.url).searchParams))),
 'PUT today/organise/record':route(async(r,e,o)=>saveRecord(e,o,await body(r,512*1024)))
};
