// Bounded iCalendar reader. Text only: no HTML, alarms, attachments or network links.
import {HttpError} from './_pigeon.js';
const fail=m=>{throw new HttpError(400,m)};
const DAY=864e5,stamp=s=>{if(!/^\d{8}T\d{6}Z$/.test(s))return NaN;const n=Date.parse(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(9,11)+':'+s.slice(11,13)+':'+s.slice(13,15)+'Z');return Number.isFinite(n)&&new Date(n).toISOString().replace(/[-:]/g,'').replace('.000Z','Z')===s?n:NaN};
const date=s=>{if(!/^\d{8}$/.test(s))return null;const v=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);const n=Date.parse(v+'T00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v?v:null};
const text=s=>String(s||'').replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'');
function wall(s,tz){
 if(s.endsWith('Z'))return stamp(s);
 if(!/^\d{8}T\d{6}$/.test(s))return NaN;
 const target=stamp(s+'Z');let guess=target;
 try{const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:tz||'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});for(let i=0;i<4;i++){const p=Object.fromEntries(fmt.formatToParts(guess).filter(x=>x.type!=='literal').map(x=>[x.type,+x.value])),off=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-guess,n=target-off;if(n===guess)break;guess=n}return guess}catch(_){return NaN}
}
export function parseCalendar(contents,{from=Date.now()-31*DAY,to=Date.now()+366*DAY,timezone='UTC'}={}){
 if(typeof contents!=='string'||new TextEncoder().encode(contents).length>512*1024||(!contents.includes('BEGIN:VCALENDAR')||!contents.includes('END:VCALENDAR'))||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>4*366*DAY)fail('Choose an iCalendar file up to 512 KB.');
 const lines=contents.replace(/\r\n[ \t]|\n[ \t]/g,'').split(/\r?\n/);if(lines.length>30000)fail('This calendar contains too many lines.');
 const events=[],warnings=new Set(),raw=[];let e=null,depth=0;
 for(const line of lines){if(line==='BEGIN:VEVENT'){if(e)fail('This calendar is malformed.');e={};depth=0;continue}if(!e)continue;if(line==='END:VEVENT'){raw.push(e);e=null;if(raw.length>1000)fail('Use a calendar with up to 1,000 events.');continue}if(line.startsWith('BEGIN:')){depth++;continue}if(line.startsWith('END:')){depth--;continue}if(depth)continue;const at=line.indexOf(':');if(at<1)continue;const [name,...params]=line.slice(0,at).split(';'),value=line.slice(at+1);if(!/^[A-Z-]+$/.test(name))continue;const p=Object.fromEntries(params.map(x=>{const i=x.indexOf('=');return[x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')]}));if(['DTSTART','DTEND','SUMMARY','DESCRIPTION','UID','STATUS','RRULE','DURATION','RDATE','RECURRENCE-ID'].includes(name))e[name]={value,params:p};if(name==='EXDATE')(e.EXDATE||=[]).push({value,params:p})}
 if(e)fail('This calendar ended before an event was complete.');
 const replacements=new Set(raw.filter(v=>v['RECURRENCE-ID']).map(v=>v.UID?.value+':'+v['RECURRENCE-ID'].value));
 let expansionBudget=20000;
 for(const v of raw){if(v.STATUS?.value==='CANCELLED')continue;if(v.RDATE)warnings.add('Some explicit repeat dates require a calendar exported as individual occurrences.');const start=v.DTSTART;if(!start){warnings.add('Events without a start were skipped.');continue}const allDay=start.params.VALUE==='DATE'||/^\d{8}$/.test(start.value),zone=start.params.TZID||timezone;
  let a=allDay?Date.parse((date(start.value)||'invalid')+'T00:00Z'):wall(start.value,zone),b=v.DTEND?(allDay?Date.parse((date(v.DTEND.value)||'invalid')+'T00:00Z'):wall(v.DTEND.value,v.DTEND.params.TZID||zone)):a+(allDay?DAY:3600000);
  if(v.DURATION&&!v.DTEND){const m=/^P(?:(\d{1,3})D)?(?:T(?:(\d{1,3})H)?(?:(\d{1,3})M)?(?:(\d{1,3})S)?)?$/.exec(v.DURATION.value);if(!m){warnings.add('An unsupported event duration was skipped.');continue}b=a+(Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0))*1000}
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b-a>366*DAY){warnings.add('Events with unsupported dates or time zones were skipped.');continue}
  const uid=text(v.UID?.value||'event-'+raw.indexOf(v)).slice(0,255),title=text(v.SUMMARY?.value||'Untitled event').slice(0,160),description=text(v.DESCRIPTION?.value).slice(0,4000),excluded=new Set((v.EXDATE||[]).flatMap(x=>x.value.split(',')));
  const push=(at,local)=>{if(excluded.has(local)||!v['RECURRENCE-ID']&&replacements.has(v.UID?.value+':'+local))return;if(at>=to||at+(b-a)<=from)return;events.push({uid:uid+':'+local,title,description,allDay,timezone:zone,...(allDay?{startDate:new Date(at).toISOString().slice(0,10),endDate:new Date(at+(b-a)).toISOString().slice(0,10)}:{start:at,end:at+(b-a)}),links:[]});if(events.length>1000)fail('Choose a smaller calendar or date range.');};
  const r=v.RRULE?Object.fromEntries(v.RRULE.value.split(';').map(s=>s.split('='))):null;
  if(!r){push(a,start.value);continue}
  if(!['DAILY','WEEKLY','MONTHLY','YEARLY'].includes(r.FREQ)||Object.keys(r).some(k=>!['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','WKST'].includes(k))||r.BYDAY&&r.FREQ!=='WEEKLY'){warnings.add('Some advanced repeating events need a calendar exported as individual occurrences.');continue}
  const interval=r.INTERVAL===undefined?1:Number(r.INTERVAL),count=r.COUNT===undefined?Infinity:Number(r.COUNT),until=r.UNTIL?(allDay?Date.parse((date(r.UNTIL.slice(0,8))||'invalid')+'T23:59:59Z'):wall(r.UNTIL,zone)):Infinity;if(!Number.isInteger(interval)||interval<1||interval>366||!(count===Infinity||Number.isInteger(count)&&count>0)||Number.isNaN(until)){warnings.add('An unsupported repeat rule was skipped.');continue}
  const localStart=stamp(start.value.slice(0,15)+(allDay?'T000000Z':'Z')),base=new Date(allDay?a:localStart),byday=r.BYDAY?r.BYDAY.split(',').map(x=>['SU','MO','TU','WE','TH','FR','SA'].indexOf(x)):null;if(byday?.some(x=>x<0)){warnings.add('An unsupported repeat rule was skipped.');continue}
  if(until<from)continue;const advance=count===Infinity&&(r.FREQ==='DAILY'||r.FREQ==='WEEKLY')?Math.max(0,Math.floor((from-a)/DAY/(r.FREQ==='DAILY'?interval:1))-14):0;
  let occurrence=0;for(let n=advance;n<advance+20000;n++){if(--expansionBudget<0){warnings.add('The repeat expansion limit was reached. Use a smaller calendar.');break}
   const d=new Date(base);if(r.FREQ==='DAILY'||r.FREQ==='WEEKLY')d.setUTCDate(d.getUTCDate()+n*(r.FREQ==='DAILY'?interval:1));else{const day=d.getUTCDate();d.setUTCDate(1);r.FREQ==='MONTHLY'?d.setUTCMonth(d.getUTCMonth()+n*interval):d.setUTCFullYear(d.getUTCFullYear()+n*interval);d.setUTCDate(day);if(d.getUTCDate()!==day)continue}
   if(r.FREQ==='WEEKLY'){const delta=Math.round((+d-+base)/DAY),week=Math.floor((delta+(base.getUTCDay()+6)%7)/7);if(week%interval||!(byday||[base.getUTCDay()]).includes(d.getUTCDay()))continue}
   const local=d.toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'');const key=allDay?local.slice(0,8):local+(start.value.endsWith('Z')?'Z':'');const at=allDay?+d:wall(key,zone);if(!Number.isFinite(at))break;if(at>until||at>=to||occurrence>=count)break;occurrence++;push(at,key);
  }
 }
 const seen=new Map();for(const v of events)seen.set(v.uid,v);return{events:[...seen.values()].sort((a,b)=>(a.start||Date.parse(a.startDate))-(b.start||Date.parse(b.startDate))),warnings:[...warnings]};
}
