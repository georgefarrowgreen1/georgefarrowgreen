const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{resolve}=require('node:path'),{existsSync}=require('node:fs');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');let browser,serveKit,KIT;
before(async()=>{({serveKit,KIT}=await import('./roofkit/serve.mjs'));browser=await chromium.launch({executablePath:process.env.CHROMIUM||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});});
after(async()=>browser?.close());
for(const width of [320,390,1440])for(const app of ['chat','mail'])for(const hosted of [false,true])test(`${app} ${hosted?'Today':'standalone'} inbox at ${width}px`,async()=>{
 const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:width===390?'dark':'light',reducedMotion:'reduce'});await serveKit(ctx,{main:ROOT+'/',ifl:IFL+'/'});
 const css=hosted?`/app.css,/roof/roof.css,/${app==='chat'?'chats/roof/chats':'mail/roof/mail'}.css`:`/${app==='chat'?'chats/styles':'native-mail'}.css`;
 if(app==='mail'&&!hosted)await ctx.route('**/native-mail.css',r=>r.fulfill({path:IFL+'/email/public/app.css',contentType:'text/css'}));
 await ctx.route('**/density.css',r=>r.fulfill({contentType:'text/css',body:'.fixture{width:100%;max-width:640px;margin:24px auto;padding:0 8px;box-sizing:border-box}.fixture *{box-sizing:border-box}.fixture .mlist{margin:0}.fixture .avatar,.fixture .av{flex:none}.fixture .row{border:0;color:inherit;font:inherit}'}));
 await ctx.route('**/inbox-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${css.split(',').map(h=>`<link rel="stylesheet" href="${h}">`).join('')}<link rel="stylesheet" href="/density.css"></head><body><main class="fixture ${hosted?(app==='chat'?'m-chats':'m-mail'):''}"></main></body></html>`}));
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{await p.goto(KIT+'/inbox-fixture');await p.evaluate(async({app,hosted})=>{
  const root=document.querySelector('main'),ui=await import('/roof/ui.js');window.opened=[];
  if(hosted&&app==='chat'){
   const {view}=await import('/chats/roof/list.js');const state={rows:[{id:'read',name:'A very long cycling group name that must fit a narrow phone',kind:'group',unread:0,at:Date.now(),line:'A pigeon is in flight · lands in 1h 35m'},{id:'unread',name:'Reuben',unread:3,at:Date.now()-864e5,line:'Security key changed',keyChanged:true}],air:[],requests:[],friends:[],me:{}};
   const fw={ui,nav:{href:(_,id)=>'/chats/#open='+id,go:p=>opened.push(p)},visible:()=>false,on:()=>()=>{}};
   window.fixture=view(root,{fw,store:{get:k=>state[k],on:()=>()=>{}},svc:{call:async()=>[]},open:{}});fixture.show();
  }else if(hosted){
   const {threadRow,swipes}=await import('/mail/roof/rows.js'),logic=await import('/mail/roof/logic.js');
   const ctx={fw:{ui},logic,icon:()=>ui.el('span',{text:'•'}),store:{get:()=>({layout:'phone',lens:'inbox'})}};
   for(const unread of [false,true])root.append(threadRow({id:unread?'unread':'read',unread,date:Date.now(),people:[{name:'A very long sender name that must fit a narrow phone',email:'hello@example.com'}],from:{name:'Alex'},subject:'A long subject that should stay on one line',snippet:'Details of the next ride and the meeting place. '.repeat(3),hasAttachments:true,count:4},ctx));
   window.fixture=swipes(root,ctx,{done:id=>opened.push('done:'+id),later:id=>opened.push('later:'+id)});
  }else if(app==='chat'){
   const box=ui.el('div',{class:'mlist'});root.append(box);
   for(const unread of [false,true]){const row=ui.el('button',{class:'mrow',type:'button'},unread&&ui.el('span',{class:'dot'}),ui.el('span',{class:'av',text:'R'}),ui.el('span',{class:'mtext'},ui.el('span',{class:'mtop'},ui.el('span',{class:'mname one',text:unread?'Reuben':'A very long cycling group name that must fit'}),ui.el('time',{text:'Yesterday'})),ui.el('span',{class:'mprev'},ui.el('span',{class:'mpt',text:unread?'Security key changed':'Pigeon in flight · lands in 1h 35m'}))));row.onclick=()=>opened.push('chat');box.append(row);}
  }else{
   for(const unread of [false,true])root.append(ui.el('div',{class:'row-wrap'},ui.el('button',{class:'row'+(unread?' unread':''),type:'button'},ui.el('span',{class:'dot'}),ui.el('span',{class:'avatar',text:'A'}),ui.el('span',{class:'body'},ui.el('span',{class:'top'},ui.el('span',{class:'from',text:'A very long sender name that must fit a narrow phone'}),ui.el('span',{class:'date',text:'Yesterday'})),ui.el('span',{class:'subject'},ui.el('span',{class:'subj-t',text:'A long subject that should stay on one line'})),ui.el('span',{class:'preview',text:'Details of the next ride and the meeting place. '.repeat(3)})))));
  }
 },{app,hosted});
 const row=app==='chat'?(hosted?'.ch-row':'.mrow'):(hosted?'.ml-row':'.row');assert.equal(await p.locator(row).count(),2);
 const result=await p.evaluate(({row,app,hosted})=>{const rows=[...document.querySelectorAll(row)],name=app==='chat'?(hosted?'.ch-rname':'.mname'):(hosted?'.ml-from':'.from');return {overflow:document.documentElement.scrollWidth>innerWidth+1,weights:rows.map(r=>+getComputedStyle(r.querySelector(name)).fontWeight),heights:rows.map(r=>r.getBoundingClientRect().height),times:rows.map(r=>{const t=r.querySelector('time,.ml-date,.date'),b=t.getBoundingClientRect(),a=r.getBoundingClientRect();return b.right<=a.right+1&&b.left>=a.left;}),text:document.body.textContent};},{row,app,hosted});
 assert.equal(result.overflow,false);assert.ok(result.weights[1]>result.weights[0]);assert.ok(result.heights.every(h=>h>=44));assert.ok(result.times.every(Boolean));if(app==='chat')assert.match(result.text,/Security key changed/);
 await p.locator(row).first().focus();assert.ok(await p.locator(row).first().evaluate(el=>el===document.activeElement));
 if(app==='chat'){await p.locator(row).last().click();assert.equal(await p.evaluate(()=>opened.length),1);}
 if(app==='mail'&&hosted){const b=await p.locator(row).first().boundingBox();await p.mouse.move(b.x+40,b.y+22);await p.mouse.down();await p.mouse.move(b.x+b.width-12,b.y+22,{steps:10});await p.mouse.up();assert.deepEqual(await p.evaluate(()=>opened),['done:read']);}
 assert.deepEqual(errors,[]);
 }finally{await ctx.close();}
});
