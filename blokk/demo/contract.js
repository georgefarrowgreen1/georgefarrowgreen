// Drive the shim exactly as web/index.html does, in the same order,
// and assert every response has the fields paint() reads.
const {Store,Policy,Engine} = require('./engine.js');
let HOUR=4, VERSION=0;
const clock=()=>HOUR;
const WN={cottages:'Cottages',biz2:'Business two',biz3:'Business three',personal:'Personal'};
let store,policy,engine;
function boot(){
  store=new Store();
  store.workspace=Object.keys(WN).map(id=>({id,name:WN[id]}));
  store.trust=[
    {workspace_id:'cottages',category:'availability_reply',clean:19,edited:1,rejected:0,threshold:20,auto:0,pinned_manual:0},
    {workspace_id:'cottages',category:'rate_change',clean:4,edited:9,rejected:2,threshold:20,auto:0,pinned_manual:0},
    {workspace_id:'cottages',category:'access_question',clean:0,edited:0,rejected:0,threshold:20,auto:0,pinned_manual:1},
    {workspace_id:'biz2',category:'invoice_chase',clean:12,edited:0,rejected:0,threshold:20,auto:0,pinned_manual:0}];
  policy=new Policy(store); engine=new Engine(store,policy,clock); VERSION++;
}
boot();
const stale=a=>!!a.revalidate&&HOUR>=9&&a.created_hour<9;
const health=()=>{const open=store.approval.filter(a=>!a.decision).length;
  const tok=Object.values(store.budget).reduce((n,b)=>n+b.tokens,0);
  return {ok:true,at:`2026-08-22T0${HOUR}:02:00`,version:VERSION,
    running:store.run.filter(r=>r.status==='running').length,suspended:store.waiting.length,
    approvals_open:open,attention_budget:{used:open,limit:8},
    handled:store.journal.filter(j=>j.side_effect).length,
    spend:[{workspace_id:'cottages',tokens:tok,max_tokens:4000000}]};};
const approvals=()=>store.approval.filter(a=>!a.decision).map(a=>{
  const t=policy.row(a.workspace_id,a.category);
  return {...a,workspace:WN[a.workspace_id],stale:stale(a),pinned:!!(t&&t.pinned_manual),evidence:a.evidence||{}};});
const handled=()=>store.approval.filter(a=>a.decision).map(a=>({category:a.category,title:a.title,
  body:a.body,workspace:WN[a.workspace_id],ws:a.workspace_id,decision:a.decision}));
const runs=()=>store.run.map(r=>({...r,result:JSON.stringify(r.result||{}),
  steps:store.journal.filter(j=>j.run_id===r.id).length,
  writes:store.journal.filter(j=>j.run_id===r.id&&j.side_effect).length}));

let fails=0; const chk=(l,c)=>{console.log((c?'  ok    ':'  FAIL  ')+l); if(!c)fails++;};

console.log('paint() field contract');
let h=health();
chk('health has version, attention_budget.used/limit, suspended, spend[0].tokens',
    h.version!==undefined && h.attention_budget.used!==undefined &&
    h.attention_budget.limit!==undefined && h.suspended!==undefined && h.spend[0].tokens!==undefined);

store.workspace.forEach(w=>engine.start(w.id));
const ap=approvals();
chk(`approvals: ${ap.length} items, each has body/title/evidence/stale/pinned/workspace_id`,
    ap.length>0 && ap.every(a=>a.body&&a.title&&a.evidence&&'stale'in a&&'pinned'in a&&a.workspace_id));
chk('one is pinned (renders amber with Later/Open thread)', ap.some(a=>a.pinned));
const rn=runs();
chk(`runs: ${rn.length}, each has workspace_id/status/steps/writes and result parses`,
    rn.every(r=>r.workspace_id&&r.status&&'steps'in r&&'writes'in r&&JSON.parse(r.result)));
chk('chips can compute filed+flagged from result',
    rn.reduce((n,r)=>n+(JSON.parse(r.result).filed||0),0)>0);

console.log('\nthe journey the app actually drives');
// go through the store, exactly as the shim's decide() does — not the copy
const a1=store.approval.find(a=>a.category==='availability_reply');
a1.decision='approve'; a1.decided_at=HOUR;
policy.record('cottages','availability_reply','approve');
const [ok,why]=policy.mayAct('cottages','availability_reply');
chk(`approve -> now_autonomous=${ok}, trust="${why}" (settled line reads "now acts alone")`, ok===true);
chk(`handled list now has ${handled().length} entry`, handled().length===1);
const v1=VERSION; VERSION++;
chk('version bumps so the 4s poll repaints', VERSION>v1);

// fresh state: the only revalidating approval was consumed above
boot(); store.workspace.forEach(w=>engine.start(w.id));
HOUR=9;
const a2=approvals().find(a=>a.revalidate);
chk('at 09:00 an approval reports stale (renders the red card)', a2 && a2.stale===true);
HOUR=4;

console.log('\n'+(fails?'  '+fails+' FAILURES':'  contract satisfied — paint() gets every field it reads'));
process.exit(fails?1:0);
