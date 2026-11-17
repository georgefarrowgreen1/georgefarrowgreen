import {HttpError} from './_pigeon.js';
import {todayOrigin} from './_sites.js';
import {SECURITY_POLICIES} from './_security-policy.js';
export const PRIVATE_HEADERS = Object.freeze({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"});
export function securityOrigin(request, env) {
  if(request.headers.get('Origin') !== todayOrigin(env,request) || request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') throw new HttpError(403,'That request did not come from InFlite.');
}
export function securityOwner(request,user,family) {
  const policy=SECURITY_POLICIES[family];if(!policy)throw new HttpError(403,'That action has no Security Module policy.');
  const expected=request.headers.get(policy.captured);
  const native=policy.nativeDownload && /^(GET|HEAD)$/.test(request.method) && new URL(request.url).pathname===policy.nativeDownload;
  if(!(native&&expected===null)&&(!/^[A-Za-z0-9_-]{1,128}$/.test(expected||'')||expected!==user.id))throw new HttpError(401,'Your account changed. Refresh before continuing.','session');
  return Object.freeze({owner:user.id,session:user.sessionHash,family});
}
export function privateResponse(response){for(const[k,v]of Object.entries(PRIVATE_HEADERS))response.headers.set(k,v);return response;}
