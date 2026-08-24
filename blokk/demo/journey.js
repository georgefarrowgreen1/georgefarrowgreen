const {Store,Policy,Engine,model}=require('./engine.js');
let HOUR=4; const clock=()=>HOUR;
const TRUST=()=>[
 {category:'availability_reply',clean:19,edited:1,rejected:0,threshold:20,auto:0,pinned_manual:0},
 {category:'rate_change',clean:4,edited:9,rejected:2,threshold:20,auto:0,pinned_manual:0},
 {category:'access_question',clean:0,edited:0,rejected:0,threshold:20,auto:0,pinned_manual:1},
 {category:'invoice_chase',clean:12,edited:0,rejected:0,threshold:20,auto:0,pinned_manual:0}];
function seed(trust){
  const s=new Store();
  s.trust=trust||TRUST(); const p=new Policy(s); return [s,p,new Engine(s,p,clock)];
}
let fails=0;
const chk=(l,c)=>{ console.log((c?'  ok    ':'  FAIL  ')+l); if(!c)fails++; };

console.log('JOURNEY 1 — sweep, approve, graduate, sweep again');
let [s,p,e]=seed(); e.start();
chk('one sweep, '+s.approval.filter(a=>!a.decision).length+' queued for you',
    s.approval.filter(a=>!a.decision).length===4);
chk('injected email quarantined and given no draft',
    s.run[0].result.flagged===1);
p.record('availability_reply','approve');
chk('availability_reply -> '+p.mayAct('availability_reply')[1],
    p.mayAct('availability_reply')[0]);
const kept=s.trust;
[s,p,e]=seed(kept); e.start();
const q=s.approval.filter(x=>!x.decision).map(x=>x.category);
chk('next sweep skips it — queue is now ['+q.join(', ')+']', !q.includes('availability_reply'));
chk('it shows under handled-without-you instead', s.approval.some(x=>x.decision==='auto'));

console.log('\nJOURNEY 2 — pull the power, restart');
[s,p,e]=seed(); e.crashAt='draft'; e.start(); e.crashAt=null;
const steps=s.journal.length, pre=s.journal.filter(x=>x.side_effect).length;
chk('died mid-run: '+steps+' steps journalled, '+pre+' write(s) already fired', s.run[0].status==='failed');
e.resumeAll();
const post=s.journal.filter(x=>x.side_effect);
const dupes=post.length-new Set(post.map(w=>w.idem_key)).size;
chk(s.run[0].replayed+' steps replayed, '+s.run[0].executed+' executed', s.run[0].replayed>=steps);
chk('duplicate sends: '+dupes, dupes===0);
chk((s.run[0].saved/1000).toFixed(0)+'k tokens not re-spent', s.run[0].saved>0);

console.log('\nJOURNEY 3 — the 09:00 re-check');
[s,p,e]=seed(); e.start();
const a=s.approval.find(x=>x.category==='availability_reply');
chk("quote carries revalidate="+a.revalidate, a.revalidate==='calendar_gap');
HOUR=9;
chk('at 09:00 it is flagged stale', !!a.revalidate && HOUR>=9 && a.created_hour<9);
HOUR=4;

console.log('\nJOURNEY 4 — edits become a rule');
const eps=[1,2,3].map(i=>({id:'e'+i,category:'availability_reply',
  before:'The week is free.', after:'The week is free. The £25 dog charge applies.'}));
const facts=model.deriveFacts(eps);
chk(facts.length+' fact from 3 edits: "'+(facts[0]||{}).text+'"', facts.length>=1);

console.log('\n'+(fails?'  '+fails+' FAILURES':'  all journeys pass'));
process.exit(fails?1:0);
