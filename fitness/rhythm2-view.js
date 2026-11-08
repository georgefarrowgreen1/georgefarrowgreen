// Shared sheet content for standalone Fitness and InFlite's native web module.
export function createRhythm2View({h,section,row,coach,prefs,setPrefs,today,acts,loadPower,refresh,notify,setup}){
 let busy=false,selected=null,message='',draft=null;
 const run=async fn=>{if(busy)return;busy=true;message='';refresh();try{await fn();}catch(e){message=e.message;}finally{busy=false;refresh();}};
 const field=(label,node)=>h('label.row.plain',{},h('span.tx',{},h('b',{text:label})),h('span.pick.r2-control',{},node,node.tagName==='SELECT'?h('span.r2-caret',{'aria-hidden':'true',text:'⌄'}):null));
 const select=(label,options,value,set)=>{const s=h('select',{'aria-label':label,disabled:busy,onchange:e=>set(e.target.value)},options.map(([v,t])=>h('option',{value:v,text:t})));s.value=String(value);return s;};
 return function view(){
  const p=prefs(),enabled=p?.engine===2,state=coach.state(),plan=state.ready?coach.plan():null,unsupported=!!(p?.run||p?.swim||p?.event?.date>=today()-7*86400e3),records=[...state.records].sort((a,b)=>b.created-a.created);
  const toggle=h('input',{type:'checkbox',role:'switch','aria-label':'Use Rhythm 2.0 beta',checked:enabled,disabled:busy||!p||(unsupported&&!enabled),onchange:e=>run(async()=>{await coach.load();setPrefs({...prefs(),engine:e.target.checked?2:1});notify(e.target.checked?'Rhythm 2.0 beta is on':'Back to classic Rhythm');})});
  const body=[h('p.rh-note',{text:'Beta · Cycling that learns from your rides'}),
   h('p.rh-note',{text:'Choose a purpose, build a manageable session, then use your feedback to guide the next one.'}),
   h('div.group.glass',{},h('label.row.plain',{},h('span.tx',{},h('b',{text:'Use Rhythm 2.0'}),h('small',{text:enabled?'Personal progression is on':'Classic Rhythm stays available'})),h('span.r2-switch',{},toggle,h('span.r2-track',{'aria-hidden':'true'}))))];
  if(!p)body.push(h('button.btn',{type:'button',onclick:setup},'Set up your riding week'));
  if(unsupported)body.push(h('p.rh-note',{text:'This first beta supports ongoing cycling plans. Keep classic Rhythm for a dated event, running or swimming.'}));
  if(p&&!unsupported){const choices=[['balanced','All-round riding'],['endurance','Longer rides'],['threshold','Sustained power'],['topend','Hard efforts']];body.push(h('div.group.glass',{},field('Training focus',select('Training focus',choices,p.objective||'balanced',v=>{setPrefs({...prefs(),objective:v});refresh();}))));}
  if(plan?.model){body.push(h('details.group.glass.r2-model',{},h('summary.row.plain',{},h('span.tx',{},h('b',{text:'Your training profile'}),h('small',{text:'Five abilities · confidence grows with evidence'}))),plan.model.profile.map(x=>row({title:x.name,sub:x.value,value:x.confidence==='limited'?'Learning':x.confidence==='developing'?'Developing':'Established',chev:false}))));
   body.push(h('p.rh-note',{text:'These are observations, not test results. Missing recent efforts reduce certainty; they do not automatically lower your FTP.'}));
   body.push(h('details.group.glass',{},h('summary.row.plain',{},h('b',{text:'How Rhythm plans'})),
    row({title:'Mostly easy riding',sub:`Up to ${plan.weekly.maxHard} focused sessions in any seven days, with easy riding around them.`,chev:false}),
    row({title:'Work that fits your week',sub:`Up to ${plan.weekly.workMinutes} minutes of interval work within about ${plan.weekly.minutes} minutes of riding. These are planning limits, not measured physiological zones.`,chev:false}),
    row({title:'Recovery in context',sub:plan.recovery.why,chev:false}),
    row({title:'Small, bounded progression',sub:'Recent, controlled reviews support one change at a time. Hard aerobic efforts can feel harder than threshold work; one unusual reading does not rewrite your fitness.',chev:false})));
   if(enabled){const d=plan.today,w=d?.id&&plan.workouts[d.id];if(w&&!d.done)body.push(section('Today’s session',h('div.card.glass',{},h('h2',{text:w.name}),h('p',{text:d.why}),h('p.rh-note',{text:w.capturedFtp?`Targets recorded at FTP ${w.capturedFtp} W`:`${Math.round(d.mins)} min · ${d.tss} training stress`}),h('button.btn',{type:'button',disabled:busy||!!d.prescriptionId||w.engine!=='rhythm-2.0',onclick:()=>run(async()=>{await coach.record(today());message='Session recorded. Its original targets will be preserved.';})},d.prescriptionId?'Session recorded':w.engine!=='rhythm-2.0'?'Your manual workout':busy?'Saving…':'Use this session'))));
    body.push(h('details.group.glass',{},h('summary.row.plain',{},h('b',{text:'The next seven days'})),plan.days.filter(d=>d.date>=today()).slice(0,7).map(d=>row({title:new Date(d.date).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'}),sub:d.id?`${plan.workouts[d.id]?.name||'Your session'} · ${Math.round(d.mins)} min`:'Rest',value:d.done?'Ridden':d.prescriptionId?'Recorded':'',chev:false}))));
   }
  }
  const eligible=records.filter(r=>r.day<=new Date(today()+12*3600e3).toISOString().slice(0,10));
  if(eligible.length){if(!eligible.some(r=>r.id===selected)){selected=eligible[0].id;draft=null;}const record=eligible.find(r=>r.id===selected);
   if(!draft)draft={revision:record.revision,completion:record.feedback?.completion||'completed',reason:record.feedback?.reason||'none',effort:record.feedback?.effort||6,activityId:record.feedback?.activityId||''};
   const sameDay=acts().filter(a=>a.sport==='ride'&&Math.abs(a.start-Date.parse(record.day+'T12:00:00Z'))<36*3600e3);
   const fields=[field('Session',select('Session to review',eligible.slice(0,30).map(r=>[r.id,`${r.day} · ${r.workout.name}`]),selected,v=>{selected=v;draft=null;refresh();})),
    field('How did it go?',select('Session completion',[['completed','Completed'],['reduced','Reduced the work'],['skipped','Did not ride']],draft.completion,v=>{draft.completion=v;})),
    field('Effort, 1–10',h('input',{type:'number',min:1,max:10,step:1,value:draft.effort,'aria-label':'Perceived effort',disabled:busy,oninput:e=>{draft.effort=Number(e.target.value);}})),
    field('Anything affecting it?',select('Reason',[['none','Nothing to add'],['fatigue','Fatigue'],['traffic','Traffic or stops'],['time','Short of time'],['equipment','Equipment or recording'],['other','Something else']],draft.reason,v=>{draft.reason=v;})),
    field('Recorded ride',select('Link an activity',[['','Feedback only'],...sameDay.map(a=>[a.id,a.name])],draft.activityId,v=>{draft.activityId=v;}))];
   body.push(section('Review a session',h('div.group.glass',{},fields)),h('p.rh-note',{text:'Rate the whole session: 1 very easy, 7 very hard, 10 maximal. Traffic and recording problems are kept separate from difficulty. Two controlled reviews can support a small progression; repeated fatigue prompts easier riding.'}),h('button.btn',{type:'button',disabled:busy,onclick:()=>run(async()=>{if(!Number.isInteger(draft.effort)||draft.effort<1||draft.effort>10)throw Error('Choose an effort from 1 to 10.');let power;if(draft.activityId){try{power=await loadPower(draft.activityId);}catch{message='Power data could not be read; your feedback was saved on its own.';}}await coach.feedback(record,{...draft,...(!draft.activityId?{activityId:undefined}:{})},{power});draft=null;message=message||'Review saved. Rhythm will use it for future sessions.';})},busy?'Saving…':record.feedback?'Update review':'Save review'));
  }else if(enabled)body.push(h('p.rh-note',{text:'Record a session before riding it. Afterwards, return here to tell Rhythm how it felt.'}));
  body.push(h('button.pill',{type:'button',disabled:busy,onclick:()=>run(async()=>{await coach.load({refresh:true});draft=null;message='Your sessions are up to date.';})},'Refresh sessions'));
  if(plan?.research)body.push(h('details.group.glass',{},h('summary.row.plain',{},h('b',{text:'Research behind Rhythm'})),h('p.rh-note',{text:'Evidence informs these beta rules; it does not validate this planner or guarantee a result.'}),plan.research.map(p=>row({title:p.title,href:p.url}))));
  if(message)body.push(h('p.rh-note',{role:'status',text:message}));
  return {title:'Rhythm 2.0',body:h('div.r2-content',{},body)};
 };
}
