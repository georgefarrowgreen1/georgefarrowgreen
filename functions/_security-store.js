import {HttpError,DAY,randomToken,hex,sha256,requireFresh} from './_pigeon.js';
import {tablesOnce} from './_fitness.js';
export const CAPABILITIES=Object.freeze({
 'files.content-search':{title:'Search inside documents',detail:'Read owned text documents to return matching excerpts.'},
 'calendar.subscription':{title:'Calendar subscriptions',detail:'Fetch read-only Google Calendar or Outlook feeds you choose.'},
 'files.transfer.chats':{title:'Files to Chats',detail:'Prepare an encrypted attachment copy for a conversation you review.'},
 'files.transfer.mail':{title:'Files to Mail',detail:'Prepare an attachment in an unsent email draft.'},
 'files.transfer.fitness':{title:'Files to Fitness',detail:'Prepare a chosen training or route file for import.'},
});
export const ownerExists='EXISTS(SELECT 1 FROM pg_users WHERE id=?1 AND delete_at IS NULL)';
export async function securitydb(env){const D=await tablesOnce(env,'security-module-v1',X=>X.batch([
 X.prepare('CREATE TABLE IF NOT EXISTS ifl_security_permissions(user_id TEXT NOT NULL,capability TEXT NOT NULL,mode TEXT NOT NULL,version INTEGER NOT NULL,modified INTEGER NOT NULL,PRIMARY KEY(user_id,capability))'),
 // Approvals use session_hash and deliberately never follow session hand-back/repointing.
 X.prepare('CREATE TABLE IF NOT EXISTS ifl_security_tickets(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_hash TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,expires INTEGER NOT NULL,remaining INTEGER NOT NULL DEFAULT 1,policy_version INTEGER NOT NULL DEFAULT -1)'),
 X.prepare('CREATE INDEX IF NOT EXISTS ifl_security_tickets_owner ON ifl_security_tickets(user_id,expires)')
 ]));return D.withSession?D.withSession('first-primary'):D;}
export function fields(b,allowed){if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k)))throw new HttpError(400,'Check the Security Module request.');}
export function capability(key){if(typeof key!=='string'||!Object.hasOwn(CAPABILITIES,key))throw new HttpError(400,'Choose a supported permission.');return key;}
export function targetFor(key,value=''){capability(key);if(typeof value!=='string')throw new HttpError(400,'Choose a valid resource.');if(key.startsWith('files.transfer.')){if(!/^[A-Za-z0-9_-]{1,80}$/.test(value))throw new HttpError(400,'Choose a valid file.');return value;}if(key==='calendar.subscription'){if(!/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(value))throw new HttpError(400,'Choose a calendar connection.');return value;}if(value!=='')throw new HttpError(400,'That permission does not take a file.');return '';}
export const hashToken=async token=>{if(typeof token!=='string'||!/^[A-Za-z0-9_-]{40,100}$/.test(token))throw new HttpError(403,'Review this action again.','confirmation');return hex(await sha256(token));};
export async function permissions(env,o){const D=await securitydb(env),r=await D.prepare(`SELECT capability,mode,version,modified FROM ifl_security_permissions WHERE user_id=?1 AND ${ownerExists}`).bind(o).all();return Object.entries(CAPABILITIES).map(([key,copy])=>{const row=r.results.find(v=>v.capability===key);return{key,...copy,mode:row?.mode||'allow',version:row?.version||0,updatedAt:row?.modified||null,inherited:!row}});}
export async function issueTicket(env,u,action,target,uses=1,policyVersion=-1){const D=await securitydb(env),token=randomToken(32),hash=hex(await sha256(token)),now=Date.now();const r=await D.batch([
 D.prepare(`INSERT INTO ifl_security_tickets(hash,user_id,session_hash,action,target,expires,remaining,policy_version) SELECT ?2,?1,?3,?4,?5,?6,?7,?9 WHERE ${ownerExists} AND EXISTS(SELECT 1 FROM pg_sessions WHERE hash=?3 AND user_id=?1) AND (?9=-1 OR COALESCE((SELECT version FROM ifl_security_permissions WHERE user_id=?1 AND capability=?4),0)=?9) AND (SELECT COUNT(*) FROM ifl_security_tickets WHERE user_id=?1 AND expires>?8 AND remaining>0)<40`).bind(u.id,hash,u.sessionHash,action,target,now+120000,uses,now,policyVersion),
 D.prepare('DELETE FROM ifl_security_tickets WHERE user_id=? AND expires<=?').bind(u.id,now)
 ]);if(!r[0].meta?.changes)throw new HttpError(409,'Refresh your session or wait before reviewing another action.');return{token,expiresAt:now+120000};}
export async function permit(env,u,key,target,token){capability(key);targetFor(key,target);const D=await securitydb(env),r=await D.prepare(`SELECT mode,version FROM ifl_security_permissions WHERE user_id=?1 AND capability=?2 AND ${ownerExists}`).bind(u.id,key).first();if(!r||r.mode==='allow')return;
 if(r.mode==='block')throw new HttpError(403,'This connection is blocked in Security Module.','security-blocked');
 if(!token)throw new HttpError(403,'Review this access in Security Module.','security:'+key);
 const hash=await hashToken(token),used=await D.prepare(`UPDATE ifl_security_tickets SET remaining=remaining-1 WHERE hash=?2 AND user_id=?1 AND session_hash=?3 AND action=?4 AND target=?5 AND expires>?6 AND remaining>0 AND policy_version=?7 AND EXISTS(SELECT 1 FROM ifl_security_permissions WHERE user_id=?1 AND capability=?4 AND mode='ask' AND version=?7) AND ${ownerExists} AND EXISTS(SELECT 1 FROM pg_sessions WHERE hash=?3 AND user_id=?1) RETURNING hash`).bind(u.id,hash,u.sessionHash,key,target,Date.now(),r.version).first();if(!used)throw new HttpError(403,'Review this access again. The approval expired or was already used.','security:'+key);
}
export async function setPermission(env,u,b){fields(b,['key','mode','version','ticket']);const key=capability(b.key);if(!['ask','allow','block'].includes(b.mode)||!Number.isSafeInteger(b.version)||b.version<0)throw new HttpError(400,'Check the permission and its current version.');const D=await securitydb(env);let proof=' AND EXISTS(SELECT 1 FROM pg_sessions WHERE hash=?6 AND user_id=?1)',args=[u.sessionHash];
 if(b.mode==='allow'){requireFresh(u);const hash=await hashToken(b.ticket);proof+=' AND EXISTS(SELECT 1 FROM ifl_security_tickets WHERE user_id=?1 AND hash=?7 AND session_hash=?6 AND action=\'permissions-allow\' AND target=?8 AND expires>?5 AND remaining=1)';args.push(hash,key+':'+b.version);}
 const params=[u.id,key,b.mode,b.version,Date.now(),...args];
 const statement=b.version===0?`INSERT INTO ifl_security_permissions(user_id,capability,mode,version,modified) SELECT ?1,?2,?3,1,?5 WHERE ${ownerExists}${proof} ON CONFLICT DO NOTHING`:`UPDATE ifl_security_permissions SET mode=?3,version=version+1,modified=?5 WHERE user_id=?1 AND capability=?2 AND version=?4 AND ${ownerExists}${proof}`;
 const r=await D.batch([D.prepare(statement).bind(...params),D.prepare('DELETE FROM ifl_security_tickets WHERE user_id=? AND changes()>0 AND (action=? OR (action=? AND target LIKE ?))').bind(u.id,key,'permissions-allow',key+':%')]);if(!r[0].meta?.changes)throw new HttpError(409,'This permission changed or the confirmation expired. Reopen it to review.');return permissions(env,u.id);
}
const EVENT_KINDS=new Set(['permission-changed','permission-once','file-transfer','content-search','calendar-access','sessions-revoked']);
export async function securityEvent(env,u,kind,detail=null){if(!EVENT_KINDS.has(kind)||detail!==null&&!Object.hasOwn(CAPABILITIES,detail)&&detail!=='others'&&detail!=='device')throw new Error('Unregistered Security Module event');const D=await securitydb(env),now=Date.now();await D.batch([
 D.prepare(`INSERT INTO pg_events(user_id,at,kind,app,device,place,detail) SELECT ?1,?2,?3,'Security Module',NULL,NULL,?4 WHERE ${ownerExists}`).bind(u.id,now,kind,detail),
 D.prepare('DELETE FROM pg_events WHERE user_id=? AND at<?').bind(u.id,now-30*DAY)
 ]);}
export async function exportSecurity(env,o){return{permissions:await permissions(env,o)};}

export async function consumeConfirmation(env,u,token,action,target){requireFresh(u);const hash=await hashToken(token),D=await securitydb(env);const r=await D.prepare(`DELETE FROM ifl_security_tickets WHERE hash=?2 AND user_id=?1 AND session_hash=?3 AND action=?4 AND target=?5 AND expires>?6 AND remaining=1 AND ${ownerExists} AND EXISTS(SELECT 1 FROM pg_sessions WHERE hash=?3 AND user_id=?1) RETURNING hash`).bind(u.id,hash,u.sessionHash,action,target,Date.now()).first();if(!r)throw new HttpError(403,'Reopen this action to confirm it again.','confirmation');}

export async function purgeSecurityTickets(env,now=Date.now()){const D=await securitydb(env);return D.prepare('DELETE FROM ifl_security_tickets WHERE hash IN (SELECT hash FROM ifl_security_tickets WHERE expires<=? LIMIT 2000)').bind(now).run()}
