const {Store, Policy, Engine} = require('./engine.js');
let HOUR = 4;
const clock = () => HOUR;
const seed = () => {
  const s = new Store();
  s.workspace = [{id:'cottages',name:'Cottages'},{id:'biz2',name:'Business two'},
                 {id:'biz3',name:'Business three'},{id:'personal',name:'Personal'}];
  s.trust = [
    {workspace_id:'cottages',category:'availability_reply',clean:19,edited:1,rejected:0,threshold:20,auto:0,pinned_manual:0},
    {workspace_id:'cottages',category:'rate_change',clean:4,edited:9,rejected:2,threshold:20,auto:0,pinned_manual:0},
    {workspace_id:'cottages',category:'access_question',clean:0,edited:0,rejected:0,threshold:20,auto:0,pinned_manual:1},
    {workspace_id:'biz2',category:'invoice_chase',clean:19,edited:0,rejected:0,threshold:20,auto:0,pinned_manual:0}];
  return s;
};
let fails=0;
const ok=(l,c)=>{ if(!c) fails++; console.log((c?'  PASS  ':'  FAIL  ')+l); };

// 1 — sweep
let s=seed(), p=new Policy(s), e=new Engine(s,p,clock);
s.workspace.forEach(w=>e.start(w.id));
const open = s.approval.filter(a=>!a.decision);
ok(`sweep queues ${open.length} approvals across 4 workspaces`, open.length===4);
ok('quarantine flagged the injected email', s.run.find(r=>r.workspace_id==='cottages').result.flagged===1);
ok('the flagged email got no draft', !s.approval.some(a=>/forward/i.test(a.body)));

// 2 — journal + write marking
const cid = s.run.find(r=>r.workspace_id==='cottages').id;
const j = s.journal.filter(x=>x.run_id===cid);
const writes = j.filter(x=>x.side_effect);
ok(`journal has ${j.length} steps, ${writes.length} marked as writes with idem keys`,
   writes.length===3 && writes.every(w=>w.idem_key));
ok('run is suspended on the approval signal', s.run.find(r=>r.id===cid).status==='suspended');

// 3 — CRASH & REPLAY (the headline claim)
s=seed(); p=new Policy(s); e=new Engine(s,p,clock);
e.crashAt='draft';
e.start('cottages');
const crashed = s.run[0];
const beforeSteps = s.journal.filter(x=>x.run_id===crashed.id).length;
const beforeWrites = s.journal.filter(x=>x.run_id===crashed.id && x.side_effect).length;
ok(`crashed mid-run: status=${crashed.status}, ${beforeSteps} steps journalled, ${beforeWrites} write(s) already fired`,
   crashed.status==='failed' && beforeWrites>=1);
e.crashAt=null;
e.resumeAll();
const after = s.run[0];
const afterWrites = s.journal.filter(x=>x.run_id===after.id && x.side_effect);
const dupes = afterWrites.length - new Set(afterWrites.map(w=>w.idem_key)).size;
ok(`resumed: ${after.replayed} steps replayed, ${after.executed} executed`, after.replayed>=beforeSteps);
ok(`ZERO duplicate sends (idem keys unique: ${afterWrites.map(w=>w.idem_key.split(':')[1]).join(',')})`, dupes===0);
ok(`${(after.saved/1000).toFixed(0)}k tokens not re-spent on replay`, after.saved>0);

// 4 — trust
s=seed(); p=new Policy(s); e=new Engine(s,p,clock);
e.start('cottages');
let a=s.approval.find(x=>x.category==='availability_reply');
p.record('cottages','availability_reply','approve');
ok('19+1 clean approvals graduates availability_reply', p.mayAct('cottages','availability_reply')[0]===true);
for(let i=0;i<25;i++) p.record('cottages','access_question','approve');
ok('pinned access_question never graduates (25 clean approvals)', p.mayAct('cottages','access_question')[0]===false);
p.record('cottages','rate_change','reject');
ok('reject resets the clean counter to 0', p.row('cottages','rate_change').clean===0);

// 5 — autonomy actually skips the queue on the next sweep
s=seed(); p=new Policy(s); e=new Engine(s,p,clock);
p.record('cottages','availability_reply','approve');            // 19 -> 20, graduates
e.start('cottages');
const stillQueued = s.approval.filter(a=>!a.decision).map(a=>a.category);
ok(`graduated category acts alone next sweep (queue now: ${stillQueued.join(', ')})`,
   !stillQueued.includes('availability_reply'));

// 6 — consolidation reads the diff
const {model} = require('./engine.js');
const facts = model.deriveFacts([
  {id:'e1',category:'availability_reply',before:'The week is free.',after:'The week is free. The £25 dog charge applies.'},
  {id:'e2',category:'availability_reply',before:'August is open.',after:'August is open. Dog charge is £25.'},
  {id:'e3',category:'availability_reply',before:'Free that week.',after:'Free that week. Plus the dog charge.'}]);
ok(`consolidation derived ${facts.length} fact(s) from 3 edits: "${facts[0]&&facts[0].text}"`, facts.length>=1);

// A FAIL line that leaves the exit code at 0 is invisible to test.sh.
process.exit(fails?1:0);
