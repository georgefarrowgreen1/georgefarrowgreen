// Standalone renderer regressions: grouped recalls and sealed envelopes, on the real source functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../../../pigeon/app.js', import.meta.url), 'utf8');
const between = (start, end) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));
const realBubble = between('function bubble(', "\n// A friend's pigeon");
const me = { id: 'me' }, f = { id: 'friend', name: 'Reuben' }, HOUR = 3600000, t = Date.UTC(2026,10,8,9);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function env(list) {
 return { S: { me, chat:f.id, msgs:new Map([[f.id,list]]), fresh:new Set(), plain:new Map(), photoGone:new Set(), notes:new Map(), outbox:[], lines:new Map() },
  I:{homing:'',lock:'LOCK',bird:'BIRD',clock:''}, KIND:{standard:{name:'Standard'}}, now:()=>t,HOUR,DAY:24*HOUR,MIN:60000,TIME_GAP:HOUR,
  esc,first:s=>s.split(' ')[0],kindOf:()=> 'standard',pigeonsOn:()=>true,group:()=>null,friend:()=>f,
  fmtTime:ts=>new Date(ts).toISOString().slice(11,16),fmtDur:()=> '3h 56m',atWhen:()=> '12:56',atTime:()=> '12:56',
  sameDay:(a,b)=>new Date(a).toDateString()===new Date(b).toDateString(),dayLabel:ts=>new Date(ts).toISOString().slice(0,10),
  chatMoments:()=>[],flyLines:()=>[],wayLines:()=>[],momRun:()=>'',inbound:()=>false,liveSoon:()=>{},myKeyWarn:()=>'',
  backBtn:()=>'',avatar:()=>'',chatSub:()=>'',wayPill:()=>'',nbtn:()=>'',vanishLine:()=>'',typingHtml:()=>'',outboxBubbles:()=>'',
  runEnds:()=>true,runMeta:()=>'',stampHtml:ts=>`<div class="stamp">${new Date(ts).toISOString().slice(0,10)}</div>`,
  wasVerified:()=>false,flockCount:()=>({landed:0}),member:()=>f,airTrack:()=>'<span class="trk"></span>' };
}
function run(code,E,expression){return new Function('E',`with(E){let runN=0,tsN=0,ltagOn=false;${code};return ${expression};}`)(E);}
const recalls = between('const recallOnly =', 'const letterTimeHtml =');
test('standalone sealed letter returns before touching readable contents',()=>{
 const E=env([]), m={id:'sealed',from:'friend',sentAt:t-HOUR,deliverAt:t+HOUR,flying:true};
 E.S.plain.get=()=>{throw Error('sealed contents must never be read');};
 E.m=m;
 const html=run(realBubble,E,'bubble(friend(),m,false)');
 assert.match(html,/Sealed letter/);assert.match(html,/data-act="map"/);assert.match(html,/data-eta=/);
 assert.doesNotMatch(html,/data-act="viewonce"|SECRET/);
});
test('consecutive recalls collapse together with every original time retained; dates group messages once per day',()=>{
 const list=[1,2,3].map((n)=>({id:'r'+n,from:'me',sentAt:t-(5-n)*24*HOUR,deliverAt:t-(5-n)*24*HOUR,recalled:true}));
 list.push({id:'text1',from:'friend',sentAt:t-60000,deliverAt:t-60000,instant:true},{id:'text2',from:'friend',sentAt:t,deliverAt:t,instant:true});
 const E=env(list);E.bubble=(f,m)=>`<div data-id="${m.id}">Called back</div>`;
 const code=recalls+between('const letterTimeHtml =','function bubble(')+between('function vChat()', '\nconst ferr =');
 const html=run(code,E,'vChat()');
 assert.match(html,/3 messages called back/);
 for(const m of list.slice(0,3)) assert.ok(html.includes(`data-id="${m.id}"`));
 assert.equal((html.match(/class="stamp"/g)||[]).length,2,'one date for recalled run and one for today');
 assert.match(html,/<details class="recall-run"/);
});
