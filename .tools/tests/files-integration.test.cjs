// Real Root boot, Frame, Files host/service/Explorer/Drive client and real
// workerd Files routes, cookie sessions, D1 and R2. Only account bootstrap and
// browser-to-Worker transport are fixtures; no domain, editor or UI is replaced.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,mkdtempSync,rmSync,mkdirSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {execFileSync}=require('node:child_process');
const {createServer}=require('node:https');
const {createServer:createProxy}=require('node:http');
const {connect}=require('node:net');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const {Module}=require('node:module');
const ROOT=resolve(__dirname,'../..'),IFL=resolve(ROOT,'../inflite');
const ORIGIN='https://os.inflite.ai';
const BROWSER=process.env.WEB_UI_BROWSER||process.env.WORKSPACE_UI_BROWSER||'chromium';
process.env.WORKSPACE_UI_BROWSER=BROWSER;
let backend,accounts,filesAPI,os,startOS,downloadServer,downloadProxy,proxyURL,certificateDir,chatIDs;
const proxySockets=new Set();
const fileStates=new Map(), nativeRequests=[];
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
before(async()=>{
  const {createFilesBackend}=await import('./fixtures/files-backend.mjs');
  backend=await createFilesBackend();
  const {UID}=await import('./mocks/fitnessmock.mjs');({IDS:chatIDs}=await import('./unit/fixtures/chats.mjs'));
  accounts={a:await backend.session(UID),b:await backend.session('files_browser_owner_b')};
  ({filesAPI}=await import(pathToFileURL(resolve(IFL,'today/src/files.js'))));
  // Native browser downloads can bypass Playwright's request interception. A
  // real private HTTPS listener therefore serves every unmodified Root proxy
  // response, including ordinary fetch/XHR with genuine browser Cookie headers.
  certificateDir=mkdtempSync(resolve(tmpdir(),'inflite-files-tls-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',resolve(certificateDir,'key.pem'),'-out',resolve(certificateDir,'cert.pem'),'-subj','/CN=os.inflite.ai','-addext','subjectAltName=DNS:os.inflite.ai','-days','1'],{stdio:'ignore'});
  downloadServer=createServer({key:readFileSync(resolve(certificateDir,'key.pem')),cert:readFileSync(resolve(certificateDir,'cert.pem'))},async(req,res)=>{
    const nativeRecord={url:req.url,cookie:!!req.headers.cookie};nativeRequests.push(nativeRecord);
    const state=fileStates.get(req.headers.cookie?.match(/__Secure-account=([^;]+)/)?.[1]);
    if(!req.url.startsWith('/api/files/')||!state){nativeRecord.status=404;res.writeHead(404);res.end();return;}
    const controller=new AbortController(),url=new URL(req.url,ORIGIN);
    const record={url:url.href,action:url.pathname.slice('/api/files/'.length),method:req.method,owner:req.headers.cookie?.includes(accounts.b.cookie)?accounts.b.owner:accounts.a.owner,expectedOwner:req.headers['x-inflite-files-owner']||null,controller,status:null,cookiePresent:!!req.headers.cookie,bytes:0};state.fileRequests.push(record);state.fileControllers.set(req,controller);
    req.on('aborted',()=>controller.abort());res.on('close',()=>{if(!res.writableFinished)controller.abort();});
    try{
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?Buffer.concat(chunks):null;record.bytes=body?.length||0;
      if(req.headers['content-type']?.startsWith('application/json'))try{record.json=JSON.parse(body?.toString('utf8')||'{}');}catch{}
      await state.gateAt(record,'request');
      const response=await filesAPI(new Request(url,{method:req.method,headers:req.headers,signal:controller.signal,...(body?{body}:{})}),proxyEnv());
      const bytes=Buffer.from(await response.arrayBuffer());record.status=response.status;
      if(response.headers.get('content-type')?.startsWith('application/json'))try{record.answer=JSON.parse(bytes.toString('utf8'));}catch{}
      await state.gateAt(record,'response');res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
    }catch(error){if(!controller.signal.aborted)state.fileBridgeErrors.push(error.message);res.destroy();}
    finally{state.fileControllers.delete(req);}
  });
  await new Promise(resolve=>downloadServer.listen(0,'127.0.0.1',resolve));
  downloadProxy=createProxy((_req,res)=>{res.writeHead(403);res.end();});
  downloadProxy.on('connect',(req,socket,head)=>{
    if(req.url!=='os.inflite.ai:443'){socket.destroy();return;}
    const upstream=connect(downloadServer.address().port,'127.0.0.1',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);});
    for(const peer of [socket,upstream]){proxySockets.add(peer);peer.on('close',()=>proxySockets.delete(peer));peer.on('error',()=>{socket.destroy();upstream.destroy();});}
  });
  await new Promise(resolve=>downloadProxy.listen(0,'127.0.0.1',resolve));proxyURL='http://127.0.0.1:'+downloadProxy.address().port;
});
after(async()=>{await os?.stop();await backend?.dispose();for(const socket of proxySockets)socket.destroy();if(downloadProxy)await new Promise(resolve=>downloadProxy.close(resolve));if(downloadServer)await new Promise(resolve=>downloadServer.close(resolve));if(certificateDir)rmSync(certificateDir,{recursive:true,force:true});});
function proxyRequest(account,method,path,body,type='application/json',signal){
  return new Request(ORIGIN+'/api/files/'+path,{method,signal,headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','X-Inflite':'1','X-Inflite-Files-Owner':account.owner,Cookie:account.cookie,'Content-Type':type},...(body==null?{}:{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)})});
}
const proxyEnv=()=>({ACCOUNT_ORIGIN:'https://account.inflite.ai',TODAY_AS:'https://inflite.ai',APPS:backend.serviceBinding()});
async function setupOS(){
  if(startOS)return startOS;
  startOS=(async()=>{
    const filename=resolve(__dirname,'os-v2-integration.test.cjs'),m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);
    const requireOriginal=m.require.bind(m);let start,stop;
    m.require=id=>id==='node:test'?{test(){},before(fn){start=fn;},after(fn){stop=fn;}}:requireOriginal(id);
    m.augmentFiles=augmentFiles;
    m.rewriteHarness=source=>source.replace("colorScheme: width === 390 ? 'light' : 'dark'","colorScheme: mode.filesTheme || (width === 390 ? 'light' : 'dark')").replace('acceptDownloads: true',`acceptDownloads: true, ignoreHTTPSErrors: true, proxy: {server:${JSON.stringify(proxyURL)}}`).replace("args: ['--no-sandbox']","args: ['--no-sandbox', '--ignore-certificate-errors']");
    const source=readFileSync(filename,'utf8').replaceAll('http://os.ifl.test:8788',ORIGIN).replaceAll('http://email.ifl.test:8788','https://email.inflite.ai').replace('async function augment(ctx, state, json) {','async function augment(ctx, state, json) { await module.augmentFiles(ctx,state,json);').replace('m._compile(source +','m._compile(module.rewriteHarness(source) +');
    m._compile(source+'\nmodule.exports={open:(...args)=>env.open(...args),createAll};',filename);
    os={open:m.exports.open,createAll:m.exports.createAll,stop:()=>stop()};await start();
  })();return startOS;
}
async function augmentFiles(ctx,state){
  state.workerTransport=[];
  const workerAsset=request=>/\/(?:chats\/roof\/core\.js|kit\/fixtures\/chats\.mjs)/.test(request.url());
  ctx.on('request',request=>{if(workerAsset(request))state.workerTransport.push({event:'request',url:request.url(),headers:{origin:request.headers().origin,site:request.headers()['sec-fetch-site'],mode:request.headers()['sec-fetch-mode']},type:request.resourceType()});});
  ctx.on('response',response=>{if(workerAsset(response.request()))state.workerTransport.push({event:'response',url:response.url(),status:response.status(),headers:response.headers()});});
  ctx.on('requestfailed',request=>{if(workerAsset(request))state.workerTransport.push({event:'failed',url:request.url(),failure:request.failure()});});
  ctx.on('page',page=>{page.on('pageerror',error=>state.workerTransport.push({event:'pageerror',name:error.name,message:error.message,stack:error.stack,page:page.url()}));page.on('worker',worker=>{state.workerTransport.push({event:'worker',url:worker.url(),page:page.url()});worker.on('close',()=>state.workerTransport.push({event:'worker-closed',url:worker.url(),page:page.url()}));});});
  state.account=accounts.a;fileStates.set(accounts.a.cookie.split('=')[1],state);state.fileRequests=[];state.fileBridgeErrors=[];state.gates=[];state.fileControllers=new Map();
  const split=accounts.a.cookie.indexOf('=');
  await ctx.addCookies([{name:accounts.a.cookie.slice(0,split),value:accounts.a.cookie.slice(split+1),url:ORIGIN,secure:true,httpOnly:true,sameSite:'Lax'}]);
  state.hold=(predicate,phase='request')=>{const entered=deferred(),release=deferred();const gate={predicate,phase,reached:entered.promise,enter:entered.resolve,release:release.resolve,waiting:release.promise,used:false};state.gates.push(gate);return gate;};
  state.gateAt=async(record,phase)=>{const gate=state.gates.find(g=>!g.used&&g.phase===phase&&g.predicate(record));if(gate){gate.used=true;gate.record=record;gate.enter(record);await gate.waiting;}};
  // Browser fetch, XHR and native download all traverse real TLS/HTTP, Cookie
  // handling and exact binary request bodies. Only account/bootstrap fixtures
  // and the Node-to-workerd service-binding translation remain artificial.
  await ctx.route(ORIGIN+'/api/files/**',route=>route.continue());
  state.releaseFiles=()=>{for(const gate of state.gates)gate.release();for(const controller of state.fileControllers.values())controller.abort();};
}
async function openFiles({width=1440,colorScheme}={}){
  await setupOS();const t=await os.open({width,mode:{filesTheme:colorScheme},initialPath:'/?os=1#workspace',ready:'home'});
  if(width>=960)await t.page.getByRole('button',{name:'Files',exact:true}).click();
  else{await t.page.getByRole('button',{name:'All apps',exact:true}).click();await t.page.locator('dialog[data-sheet=workspace-apps][open]').getByRole('button',{name:'Files',exact:true}).click();}
  await t.page.locator('.ifl-files-explorer:visible').waitFor();
  try{await t.page.getByRole('button',{name:'New folder',exact:true}).waitFor();}catch(error){console.log('FILES OPEN DIAGNOSTIC',JSON.stringify({body:await t.page.locator('body').innerText(),requests:t.state.fileRequests.map(({controller,...r})=>r),bridge:t.state.fileBridgeErrors,errors:t.errors,csp:await t.page.evaluate(()=>[__osCsp,__osRejected]),unknown:t.state.unknown}));t.state.releaseFiles();await t.ctx.close();throw error;}
  return{...t,clean:async()=>{assert.deepEqual(t.state.fileBridgeErrors,[]);try{await t.clean();}catch(error){console.log('FILES TRANSPORT DIAGNOSTIC',JSON.stringify({nativeRequests,workers:t.state.workerTransport,security:await t.page.evaluate(()=>({url:location.href,origin:location.origin,domain:document.domain,secure:isSecureContext,base:document.baseURI})),errors:t.errors,unknown:t.state.unknown}));throw error;}},close:async()=>{t.state.releaseFiles();for(const [key,value]of fileStates)if(value===t.state)fileStates.delete(key);await t.ctx.close();}};
}
async function gateReached(t,gate){let timer;try{return await Promise.race([gate.reached,new Promise((_,reject)=>{timer=setTimeout(async()=>{console.log('FILES GATE DIAGNOSTIC',JSON.stringify({body:await t.page.locator('body').innerText().catch(()=>'<closed>'),requests:t.state.fileRequests.map(({controller,...r})=>r)}));reject(new Error('Expected Files transport gate was not reached'));},15000);})]);}finally{clearTimeout(timer);}}
async function goFiles(page){
  const direct=page.getByRole('button',{name:'Files',exact:true}),launcher=page.getByRole('button',{name:'All apps',exact:true});
  if(await direct.isVisible())await direct.click();
  else if(await launcher.isVisible()){await launcher.click();await page.locator('dialog[data-sheet=workspace-apps][open]').getByRole('button',{name:'Files',exact:true}).click();}
  else{await page.locator('.ws-dock').getByRole('button',{name:'Today',exact:true}).click();await direct.click();}
  await page.locator('.ifl-files-explorer:visible').waitFor();
}

const select=(page,name)=>page.getByRole('button',{name:'Select '+name,exact:true});
async function folderUI(page,name){await page.getByRole('button',{name:'New folder',exact:true}).click();const d=page.locator('dialog[data-sheet=files-new-folder][open]');await d.getByRole('textbox',{name:'Folder name',exact:true}).fill(name);await d.getByRole('button',{name:'Create folder',exact:true}).click();await d.waitFor({state:'detached'});await select(page,name).waitFor();}
async function action(page,name,label){await page.getByRole('button',{name:'Actions for '+name,exact:true}).click();await page.locator('dialog[data-sheet=files-actions][open]').getByRole('button',{name:label,exact:true}).click();}
async function uploadUI(page,name,bytes,mime='application/octet-stream'){
  const finished=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files/content'&&r.request().method()==='PUT'&&r.status()===200);
  const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload',exact:true}).click();await(await choosing).setFiles({name,mimeType:mime,buffer:bytes});await finished;await select(page,name).waitFor();
}

test('real Root Files proxy and real D1/R2 preserve binary bytes and private response headers',async()=>{
  const response=await filesAPI(proxyRequest(accounts.a,'POST','uploads',{name:'Proxy bytes.bin',parentId:null,mime:'application/octet-stream',size:6,operationId:'browser_proxy_operation_0001'}),proxyEnv());
  assert.equal(response.status,201);const {item}=await response.json(),bytes=new Uint8Array([0,255,128,13,10,42]);
  const put=await filesAPI(proxyRequest(accounts.a,'PUT','content?id='+item.id,bytes,'application/octet-stream'),proxyEnv());assert.equal(put.status,200,await put.clone().text());
  const get=await filesAPI(proxyRequest(accounts.a,'GET','content?id='+item.id),proxyEnv());assert.equal(get.status,200);assert.deepEqual(new Uint8Array(await get.arrayBuffer()),bytes);
  assert.equal(get.headers.get('cache-control'),'private, no-store');assert.equal(get.headers.get('content-security-policy'),"sandbox; default-src 'none'; frame-ancestors 'none'");
  const foreign=await filesAPI(proxyRequest(accounts.b,'GET','content?id='+item.id),proxyEnv());assert.equal(foreign.status,404);
});

test('actual Explorer uploads/downloads exact bytes, renames, moves and deletes real Drive objects',async()=>{
  const t=await openFiles();const{page}=t;try{
    await folderUI(page,'Browser CRUD');await select(page,'Browser CRUD').dblclick();await page.getByRole('searchbox',{name:'Search Browser CRUD',exact:true}).waitFor();
    await folderUI(page,'Destination');const bytes=Buffer.from([0,255,128,0,13,10,42]);await uploadUI(page,'Roundtrip.bin',bytes);
    await select(page,'Roundtrip.bin').click();const download=page.waitForEvent('download');await page.locator('.ifx-inspector').getByRole('button',{name:'Download',exact:true}).click();const file=await download;try{assert.deepEqual(readFileSync(await file.path()),bytes);}catch(error){console.log('FILES DOWNLOAD DIAGNOSTIC',JSON.stringify({failure:await file.failure(),downloadURL:file.url(),nativeRequests,unknown:t.state.unknown,requests:t.state.fileRequests.map(({controller,...r})=>r),bridge:t.state.fileBridgeErrors,errors:t.errors,csp:await page.evaluate(()=>[__osCsp,__osRejected])}));throw error;}
    await action(page,'Roundtrip.bin','Rename');const rename=page.locator('dialog[data-sheet=files-rename][open]');await rename.getByRole('textbox',{name:'File name',exact:true}).fill('Renamed.bin');await rename.getByRole('button',{name:'Save name',exact:true}).click();await select(page,'Renamed.bin').waitFor();
    await action(page,'Renamed.bin','Move');const move=page.locator('dialog[data-sheet=files-move][open]');await move.getByRole('button',{name:'Browser CRUD',exact:true}).click();await move.getByRole('button',{name:'Destination',exact:true}).click();await move.getByRole('button',{name:'Move here',exact:true}).click();await move.waitFor({state:'detached'});await select(page,'Renamed.bin').waitFor({state:'detached'});
    await select(page,'Destination').dblclick();await select(page,'Renamed.bin').waitFor();await action(page,'Renamed.bin','Delete');const remove=page.locator('dialog[data-sheet=files-delete][open]');await remove.getByRole('button',{name:'Delete',exact:true}).click();await remove.waitFor({state:'detached'});await select(page,'Renamed.bin').waitFor({state:'detached'});
    const committed=t.state.fileRequests.find(r=>r.action==='content'&&r.method==='PUT'&&r.status===200)?.answer?.item;assert.ok(committed);assert.equal((await backend.api(accounts.a,'GET','item',undefined,{query:'?id='+committed.id})).status,404);
    const metadata=await page.evaluate(()=>JSON.stringify({url:location.href,state:history.state,storage:{...localStorage,...sessionStorage}}));assert.doesNotMatch(metadata,/Browser CRUD|Destination|Roundtrip|Renamed|Proxy bytes/);await t.clean();
  }finally{await t.close();}
});

test('real server pages beyond100 retain focus, keep search private and recover a stale revision',async()=>{
  const parent=await backend.folder(accounts.a,'Browser pages');
  for(let i=0;i<105;i++)await backend.folder(accounts.a,'Page '+String(i).padStart(3,'0'),parent.id);
  const t=await openFiles();const{page}=t;try{
    await select(page,'Browser pages').dblclick();await select(page,'Page 099').waitFor();
    assert.equal(await page.locator('.ifx-items [data-file-key]').count(),100);
    assert.equal(await page.locator('.ifx-breadcrumbs').getByText('Browser pages',{exact:true}).count(),1,'the current folder appears once in its path');
    await select(page,'Page 099').click();await page.getByRole('button',{name:'Next page',exact:true}).click();await select(page,'Page 104').waitFor();assert.equal(await page.locator('.ifx-items [data-file-key]').count(),5);
    await page.getByRole('button',{name:'Previous page',exact:true}).click();await select(page,'Page 099').waitFor();assert.equal(await select(page,'Page 099').evaluate(n=>document.activeElement===n),true);
    const search=page.getByRole('searchbox',{name:'Search Browser pages',exact:true});await search.fill('Page 104');await select(page,'Page 104').waitFor();assert.equal(await page.locator('.ifx-items [data-file-key]').count(),1);
    const query=t.state.fileRequests.find(r=>r.action==='search'&&r.json?.q==='Page 104');assert.ok(query);assert.equal(query.method,'POST');assert.equal(query.url.includes('Page'),false);
    await search.fill('');await select(page,'Page 099').waitFor();
    await backend.folder(accounts.a,'Late insertion',parent.id);await page.getByRole('button',{name:'Next page',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.ifx-page-number')?.textContent==='Page 1');await select(page,'Late insertion').waitFor();
    assert.ok(t.state.fileRequests.some(r=>r.action==='list'&&r.status===409),'actual D1 revision changes invalidate the old page cursor');
    await page.goBack();await select(page,'Browser pages').waitFor();assert.equal(new URL(page.url()).hash,'#files');
    await page.goForward();await select(page,'Late insertion').waitFor();
    await page.reload();await select(page,'Late insertion').waitFor();
    assert.equal(new URL(page.url()).hash,'#files='+parent.id);
    const history=await page.evaluate(()=>JSON.stringify({url:location.href,state:history.state,storage:{...localStorage,...sessionStorage}}));assert.doesNotMatch(history,/Browser pages|Page 104|Late insertion/);await t.clean();
  }finally{await t.close();}
});

test('actual Drive sorting and version conflicts never overwrite a newer file',async()=>{
  const parent=await backend.folder(accounts.a,'Browser sorting');
  await backend.uploaded(accounts.a,'Alpha.txt','12345',{parentId:parent.id});
  const stale=await backend.uploaded(accounts.a,'Conflict.txt','12345678901234567890123456789012',{parentId:parent.id});
  await backend.uploaded(accounts.a,'Zebra.txt','x',{parentId:parent.id});
  const t=await openFiles();const{page}=t;try{
    await select(page,'Browser sorting').dblclick();await select(page,'Alpha.txt').waitFor();
    const names=()=>page.locator('.ifx-items .ifx-file-main').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label')));
    assert.deepEqual(await names(),['Select Alpha.txt','Select Conflict.txt','Select Zebra.txt']);
    await page.getByRole('combobox',{name:'Sort files',exact:true}).selectOption('size');await page.waitForFunction(()=>document.querySelector('.ifx-items button[aria-label^="Select "]')?.getAttribute('aria-label')==='Select Conflict.txt');
    await action(page,'Conflict.txt','Rename');const dialog=page.locator('dialog[data-sheet=files-rename][open]');
    const remote=await backend.api(accounts.a,'PATCH','item',{id:stale.id,version:stale.version,name:'Changed elsewhere.txt'});assert.equal(remote.status,200);
    await dialog.getByRole('textbox',{name:'File name',exact:true}).fill('Must not overwrite.txt');await dialog.getByRole('button',{name:'Save name',exact:true}).click();
    await dialog.getByRole('status').filter({hasText:/changed|refresh|updated|again/i}).waitFor();
    const current=await backend.api(accounts.a,'GET','item',undefined,{query:'?id='+stale.id});assert.equal(current.value.item.name,'Changed elsewhere.txt');assert.equal(current.value.item.version,remote.value.item.version);
    assert.ok(t.state.fileRequests.filter(r=>r.method==='PATCH'&&r.json?.id===stale.id).length<=1,'an uncertain stale write is never retried automatically');await dialog.locator('[data-close]').click();await t.clean();
  }finally{await t.close();}
});


test('real Files on a narrow phone preserves form focus and safely previews untrusted text',async()=>{
  const parent=await backend.folder(accounts.a,'Phone files');
  const name='Note <img onerror=x>.txt',text='<script>window.__fileScriptRan=true</script>\nPrivate text & unicode ☁';
  await backend.uploaded(accounts.a,name,text,{parentId:parent.id,mime:'text/plain'});
  const t=await openFiles({width:320});const{page}=t;try{
    await select(page,'Phone files').click();await select(page,name).waitFor();
    const search=page.getByRole('searchbox',{name:'Search Phone files',exact:true});await search.fill('Note');
    await page.waitForFunction(()=>document.querySelector('.ifx-status')?.textContent?.startsWith('1 item'));
    assert.equal(await search.evaluate(n=>n===document.activeElement),true,'refresh keeps the search caret');
    await search.fill('');await select(page,name).waitFor();
    await page.getByRole('button',{name:'New folder',exact:true}).click();
    const form=page.locator('dialog[data-sheet=files-new-folder][open]'),field=form.getByRole('textbox',{name:'Folder name',exact:true});
    await field.fill('Phone Enter folder');await page.setViewportSize({width:320,height:540});
    assert.equal(await field.evaluate(n=>n===document.activeElement),true);
    const box=await field.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=321,'name field fits a keyboard-sized viewport');
    await field.press('Enter');await form.waitFor({state:'detached'});await select(page,'Phone Enter folder').waitFor();
    await page.evaluate(()=>{window.__filesClickState=[];document.addEventListener('click',event=>{const row=event.target.closest?.('.ifx-file-main');if(row)__filesClickState.push({name:row.getAttribute('aria-label'),busy:row.closest('.ifx-results')?.getAttribute('aria-busy'),disabled:row.disabled,ariaDisabled:row.getAttribute('aria-disabled'),status:document.querySelector('.ifx-status')?.textContent});},true);});
    await select(page,name).click();const details=page.locator('dialog[data-sheet=files-details][open]');
    try{await details.getByRole('button',{name:'Preview',exact:true}).click();}catch(error){console.log('PHONE DETAILS DIAGNOSTIC',JSON.stringify({clicks:await page.evaluate(()=>__filesClickState),body:await page.locator('body').innerText(),requests:t.state.fileRequests.map(({controller,...r})=>r)}));throw error;}
await details.locator('.ifx-preview pre').waitFor();
    assert.equal(await details.locator('.ifx-preview pre').textContent(),text);
    assert.equal(await details.locator('script,img[onerror]').count(),0);assert.equal(await page.evaluate(()=>window.__fileScriptRan),undefined);
    await details.locator('[data-close]').click();await details.waitFor({state:'detached'});
    assert.equal(await select(page,name).evaluate(n=>n===document.activeElement),true,'closing details restores the selected row');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await t.clean();
  }finally{await t.close();}
});

test('Drive uploads survive Files navigation with their captured destination and explicit cancel reclaims a reservation',async()=>{
  const parent=await backend.folder(accounts.a,'Uploads captured');
  const t=await openFiles();const{page}=t;try{
    await select(page,'Uploads captured').dblclick();await page.getByRole('searchbox',{name:'Search Uploads captured',exact:true}).waitFor();
    const gate=t.state.hold(r=>r.action==='content'&&r.method==='PUT');
    const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload',exact:true}).click();await(await choosing).setFiles({name:'Across navigation.bin',mimeType:'application/octet-stream',buffer:Buffer.from([1,0,255,7])});
    await gateReached(t,gate);
    await page.locator('.ws-sidebar').getByRole('button',{name:'Today',exact:true}).click();
    await page.getByRole('heading',{name:'Today',exact:true}).waitFor();gate.release();
    await page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files/content'&&r.request().method()==='PUT'&&r.status()===200);
    await goFiles(page);await select(page,'Uploads captured').dblclick();await select(page,'Across navigation.bin').waitFor();
    const ready=t.state.fileRequests.find(r=>r.action==='content'&&r.method==='PUT'&&r.status===200)?.answer?.item;
    assert.equal(ready.parentId,parent.id);assert.equal((await backend.api(accounts.a,'GET','content',undefined,{query:'?id='+ready.id})).status,200);
    const cancel=t.state.hold(r=>r.action==='content'&&r.method==='PUT');
    const picker=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload',exact:true}).click();await(await picker).setFiles({name:'Cancel this.bin',mimeType:'application/octet-stream',buffer:Buffer.from([2,3,4])});
    await gateReached(t,cancel);
    const reserved=t.state.fileRequests.find(r=>r.action==='uploads'&&r.json?.name==='Cancel this.bin').answer.item;
    const removed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files/item'&&r.request().method()==='DELETE'&&r.status()===200);
    const aborted=t.ctx.waitForEvent('requestfailed',r=>r.method()==='PUT'&&r.url().includes(reserved.id));
    await page.getByRole('button',{name:'Cancel upload of Cancel this.bin',exact:true}).click();await aborted;cancel.release();try{await removed;}catch(error){console.log('CANCEL CLEANUP',JSON.stringify(t.state.fileRequests.map(({controller,...r})=>r)));throw error;}
    assert.equal((await backend.api(accounts.a,'GET','item',undefined,{query:'?id='+reserved.id})).status,404);
    assert.equal(t.state.fileRequests.find(r=>r.action==='content'&&r.method==='PUT'&&r.url.includes(reserved.id)).controller.signal.aborted,true);
    await t.clean();
  }finally{await t.close();}
});


test('real account replacement retires pending private previews, old actions and uploads',async()=>{
  const parent=await backend.folder(accounts.a,'Retired private folder');
  const old=await backend.uploaded(accounts.a,'Retired private note.txt','Secret owner A preview',{parentId:parent.id,mime:'text/plain'});
  await backend.folder(accounts.b,'Owner B folder');
  const t=await openFiles();const{page}=t;try{
    await select(page,'Retired private folder').dblclick();await select(page,'Retired private note.txt').click();
    await page.locator('.ifx-inspector').getByRole('button',{name:'Download',exact:true}).evaluate(n=>window.__retiredDownload=n);
    const preview=t.state.hold(r=>r.action==='content'&&r.method==='GET'&&r.url.includes(old.id),'response');
    await page.locator('.ifx-inspector').getByRole('button',{name:'Preview',exact:true}).click();await gateReached(t,preview);
    const upload=t.state.hold(r=>r.action==='content'&&r.method==='PUT');
    const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload',exact:true}).click();await(await choosing).setFiles({name:'Retired upload.bin',mimeType:'application/octet-stream',buffer:Buffer.from([3,0,128,255])});await gateReached(t,upload);
    const reserved=t.state.fileRequests.find(r=>r.action==='uploads'&&r.json?.name==='Retired upload.bin').answer.item;
    // The transport's authoritative session changes, then the ordinary service
    // worker hint makes Root revalidate and execute its actual sign-out path.
    t.state.view.signedIn=false;
    await page.evaluate(()=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{ifl:'signedout'}})));
    await page.locator('#out:not([hidden])').getByRole('link',{name:'Sign in',exact:true}).waitFor();
    const requests=t.state.fileRequests.length;await page.evaluate(()=>window.__retiredDownload.click());assert.equal(t.state.fileRequests.length,requests);
    const split=accounts.b.cookie.indexOf('=');await t.ctx.addCookies([{name:accounts.b.cookie.slice(0,split),value:accounts.b.cookie.slice(split+1),url:ORIGIN,secure:true,httpOnly:true,sameSite:'Lax'}]);
    t.state.account=accounts.b;fileStates.set(accounts.b.cookie.slice(split+1),t.state);t.state.view.signedIn=true;t.state.view.user={...t.state.view.user,id:accounts.b.owner,name:'Owner B',first:'Owner B'};
    t.state.view.apps={weather:false,fitness:false,markets:false,chats:false,mail:false};
    await page.evaluate(()=>{history.replaceState(null,'','/?os=1#files');dispatchEvent(new Event('online'));});
    await select(page,'Owner B folder').waitFor();preview.release();upload.release();
    await page.waitForFunction(()=>document.querySelector('.ifx-status')?.textContent?.startsWith('1 item'));
    assert.doesNotMatch(await page.locator('body').innerText(),/Retired private|Secret owner A|Retired upload/);
    assert.equal(await page.locator('.ifx-preview').count(),0);
    assert.equal((await backend.api(accounts.a,'GET','content',undefined,{query:'?id='+reserved.id})).status,404,'aborted old-account bytes were never published');
    assert.equal((await backend.api(accounts.b,'GET','item',undefined,{query:'?id='+old.id})).status,404);
    await t.clean();
  }finally{await t.close();}
});


test('full Files app collections use real Fitness exports and Mail metadata without exposing Drive writes',async()=>{
  const t=await openFiles();const{page}=t;try{
    await os.createAll(page,t.state);
    await goFiles(page);await page.locator('.ifl-files-explorer:visible').waitFor();
    await page.locator('.ifx-location-list').getByRole('button',{name:'From apps',exact:true}).click();
    await select(page,'Fitness').dblclick();
    const gpx=page.getByRole('button',{name:'Select inflite-r-workspace-fixture.gpx',exact:true});await gpx.waitFor();await gpx.click();
    assert.equal(await page.getByRole('button',{name:'New folder',exact:true}).isVisible(),false);
    assert.equal(await page.locator('.ifx-inspector').getByRole('button',{name:'Rename',exact:true}).count(),0);
    const routeDownload=page.waitForEvent('download');await page.locator('.ifx-inspector').getByRole('button',{name:'Download',exact:true}).click();
    const routeFile=await routeDownload,routeText=readFileSync(await routeFile.path(),'utf8');assert.match(routeText,/<gpx /);assert.equal((routeText.match(/<trkpt /g)||[]).length,t.state.plan.route.coords.length);
    // Native actions focus the owning app. Return through the actual Files
    // source navigation before requesting the independently generated FIT.
    await goFiles(page);await page.locator('.ifx-location-list').getByRole('button',{name:'Fitness',exact:true}).click();
    const fit=page.getByRole('button',{name:/^Select .*\.fit$/}).first();await fit.waitFor();await fit.click();
    const fitDownload=page.waitForEvent('download');await page.locator('.ifx-inspector').getByRole('button',{name:'Download',exact:true}).click();const fitFile=await fitDownload,fitBytes=readFileSync(await fitFile.path());assert.equal(fitBytes.subarray(8,12).toString('ascii'),'.FIT');assert.ok(fitBytes.length>100);
    await goFiles(page);await page.locator('.ifx-location-list').getByRole('button',{name:'Mail',exact:true}).click();
    await select(page,'October-update-notes.pdf').waitFor();
    assert.ok(t.state.mail.log.some(r=>r.path==='/api/threads/search'));
    assert.equal(t.state.mail.log.some(r=>/^\/api\/messages\/[^/]+$/.test(r.path)&&!r.navigate),false,'the shared Files index requests attachment metadata only');
    assert.equal(t.state.mail.log.some(r=>/^\/api\/attachments\//.test(r.path)),false,'listing does not read private attachment content');
    await select(page,'October-update-notes.pdf').click();await page.locator('.ifx-inspector').getByRole('button',{name:'Open',exact:true}).click();
    const native=page.getByRole('link',{name:'Open in Mail',exact:true});await native.waitFor();assert.equal(new URL(await native.getAttribute('href')).origin,'https://email.inflite.ai');
    assert.equal(t.state.mail.log.some(r=>/^\/api\/attachments\//.test(r.path)&&!r.navigate),false);
    await page.locator('dialog[open] [data-close]').click();
    await page.locator('.ws-dock').getByRole('button',{name:'Chats',exact:true}).click();
    try{await page.locator('#m-chats .ch-row[data-id=\"'+chatIDs.pat+'\"]').click();}catch(error){console.log('CHAT FILES STATE',JSON.stringify({url:page.url(),body:await page.locator('body').innerText(),unknown:t.state.unknown,errors:t.errors}));throw error;}await page.locator('#m-chats .ch-input').waitFor();await page.locator('#m-chats .ch-input').fill('A private unsent Files draft');
    await page.locator('#m-chats').evaluate(n=>window.__filesChatRoot=n);
    await page.getByRole('button',{name:'Back to Chats',exact:true}).click();
    await goFiles(page);await page.locator('.ifx-location-list').getByRole('button',{name:'Chats',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.ifx-status')?.textContent==='0 items');
    assert.equal(await page.locator('.ifx-items [data-file-key]').count(),0,'hidden Chats retires its current-conversation media rather than indexing private history');
    await page.locator('.ws-dock').getByRole('button',{name:'Chats',exact:true}).click();await page.locator('#m-chats .ch-row[data-id=\"'+chatIDs.pat+'\"]').click();await page.locator('#m-chats .ch-input').waitFor();
    assert.equal(await page.locator('#m-chats .ch-input').inputValue(),'A private unsent Files draft');assert.equal(await page.locator('#m-chats').evaluate(n=>n===window.__filesChatRoot),true);
    const workers=page.workers().filter(w=>new URL(w.url()).pathname==='/chats/roof/core.js');assert.equal(workers.length,1);const calls=await workers[0].evaluate(()=>self.kitCalls);for(const method of ['sendText','sendBlob','sendRun'])assert.equal(calls[method]||0,0);
    assert.equal(t.state.mail.sends.length,0);assert.deepEqual(t.state.routeWrites,[]);await t.clean();
  }finally{await t.close();}
});


test('actual private Files desktop and phone screenshots have no overflow or new accessibility violations',async()=>{
  const parent=await backend.folder(accounts.a,'Ride archive');await backend.folder(accounts.a,'Weekend routes',parent.id);
  await backend.uploaded(accounts.a,'Coast route notes.txt','Coast loop\nMeet at the café at09:00.\nBring lights and a spare tube.',{parentId:parent.id,mime:'text/plain'});
  const dir=resolve(process.env.FILES_SCREENSHOTS||'/tmp/inflite-files-20261111/all-app-qa',BROWSER),report=[];
  const axeSource=readFileSync(require.resolve('axe-core/axe.min.js',{paths:[__dirname,IFL]}),'utf8');mkdirSync(dir,{recursive:true});
  // Initial contexts exercise each real preferred theme. WebKit's emulateMedia
  // override can leave inherited custom-property colors stale until a resize.
  for(const theme of ['dark','light']){
    const t=await openFiles({colorScheme:theme}),{page}=t,auditorCsp=[];
    try{
      await select(page,'Ride archive').dblclick();await select(page,'Coast route notes.txt').click();await page.locator('.ifx-inspector').getByRole('button',{name:'Preview',exact:true}).click();await page.locator('.ifx-preview pre').waitFor();await t.clean();
      async function capture(name){
        assert.deepEqual(await page.evaluate(()=>__osCsp),auditorCsp,'product transitions remain CSP clean before an audit scan');
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth+1,items:[...document.querySelectorAll('.ifl-files-explorer button,.ifl-files-explorer input,dialog[open] input,dialog[open] button')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&(r.left<-.9||r.right>innerWidth+1);}).map(n=>n.getAttribute('aria-label')||n.textContent)}));
        await page.evaluate(axeSource);
        const violations=await page.evaluate(async()=>{const r=await axe.run(document,{preload:false,runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const probes=await page.evaluate(count=>__osCsp.slice(count),auditorCsp.length);
        assert.ok(probes.length<=2&&probes.every(value=>value==='style-src-elem inline'),'only known axe CSS probes may violate the policy');auditorCsp.push(...probes);
        // WebKit's screenshot driver itself injects an inline animation-sync
        // style. Keep its scan strict; Chromium supplies the shareable PNGs.
        if(BROWSER!=='webkit')await page.screenshot({path:resolve(dir,name+'.png'),fullPage:false,caret:'initial'});
        report.push({name,theme,viewport:page.viewportSize(),overflow,violations,auditorCsp:probes,screenshot:BROWSER!=='webkit'?name+'.png':null});
      }
      await capture('desktop-'+theme+'-preview');
      if(theme==='light'){
        await page.setViewportSize({width:390,height:844});await select(page,'Coast route notes.txt').click();await page.locator('dialog[data-sheet=files-details][open]').waitFor();await capture('phone390-light-details');
        await page.setViewportSize({width:320,height:740});await capture('phone320-light-details');
        await page.locator('dialog[data-sheet=files-details][open] [data-close]').click();
      }else await page.setViewportSize({width:320,height:540});
      await page.getByRole('button',{name:'New folder',exact:true}).click();await page.locator('dialog[data-sheet=files-new-folder][open]').getByRole('textbox',{name:'Folder name',exact:true}).fill('Winter rides');await capture('phone320-'+theme+'-folder');
      assert.deepEqual(t.errors,[]);assert.deepEqual(t.state.unknown,[]);assert.deepEqual(t.state.fileBridgeErrors,[]);assert.deepEqual(await page.evaluate(()=>[__osCsp,__osRejected]),[auditorCsp,[]]);
    }finally{await t.close();writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2));}
  }
  for(const shot of report){assert.equal(shot.overflow.page,false,shot.name);assert.deepEqual(shot.overflow.items,[],shot.name);
    // Retain the owner-approved historical zoom-clamp finding in the report.
    assert.deepEqual(shot.violations.filter(v=>v.id!=='meta-viewport'),[],shot.name);
  }
});


test('canceling a committed reservation before its acknowledgement reclaims the same idempotent operation',async()=>{
  const before=await backend.api(accounts.a,'GET','list'),t=await openFiles();const{page}=t;
  try{
    const gate=t.state.hold(r=>r.action==='uploads'&&r.method==='POST','response');
    const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload',exact:true}).click();await(await choosing).setFiles({name:'Cancel reservation acknowledgement.bin',mimeType:'application/octet-stream',buffer:Buffer.from([4,0,128,255,7])});
    const committed=await gateReached(t,gate),reserved=committed.answer.item;
    assert.equal(reserved.status,'pending');
    const aborted=t.ctx.waitForEvent('requestfailed',r=>r.method()==='POST'&&new URL(r.url()).pathname==='/api/files/uploads');
    const removed=page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname==='/api/files/item'&&r.url().includes(reserved.id)&&r.status()===200);
    await page.getByRole('button',{name:'Cancel upload of Cancel reservation acknowledgement.bin',exact:true}).click();await aborted;gate.release();await removed;
    const attempts=t.state.fileRequests.filter(r=>r.action==='uploads'&&r.json?.name==='Cancel reservation acknowledgement.bin');assert.equal(attempts.length,2);assert.deepEqual(attempts[1].json,attempts[0].json,'cancel reconciliation replays the exact operation and destination');
    assert.equal(attempts[1].answer.item.id,reserved.id);assert.equal(t.state.fileRequests.some(r=>r.method==='PUT'&&r.url.includes(reserved.id)),false);
    assert.equal((await backend.api(accounts.a,'GET','item',undefined,{query:'?id='+reserved.id})).status,404);
    const after=await backend.api(accounts.a,'GET','list');assert.equal(after.value.usage.reserved,before.value.usage.reserved);assert.equal(after.value.usage.nodes,before.value.usage.nodes);await t.clean();
  }finally{await t.close();}
});


test('a cookie-only account swap cannot redirect an old Frame reader or writer into the replacement account',async()=>{
  await backend.folder(accounts.b,'Cookie replacement private folder');
  const before=await backend.api(accounts.b,'GET','list'),t=await openFiles();const{page}=t;
  try{
    const formReady=page.getByRole('button',{name:'New folder',exact:true});await formReady.click();
    const form=page.locator('dialog[data-sheet=files-new-folder][open]');await form.getByRole('textbox',{name:'Folder name',exact:true}).fill('Must stay out of owner B');
    // Only the browser's authenticated cookie changes. Root's session response,
    // existing Frame, service and Drive client all still belong to owner A.
    const split=accounts.b.cookie.indexOf('=');fileStates.set(accounts.b.cookie.slice(split+1),t.state);
    await t.ctx.addCookies([{name:accounts.b.cookie.slice(0,split),value:accounts.b.cookie.slice(split+1),url:ORIGIN,secure:true,httpOnly:true,sameSite:'Lax'}]);
    const rejectedWrite=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/files/folders'&&r.status()===401);
    await form.getByRole('button',{name:'Create folder',exact:true}).click();await rejectedWrite;
    await form.getByRole('status').filter({hasText:/account|sign|changed|session/i}).waitFor();
    assert.equal(t.state.view.user.id,accounts.a.owner);assert.notEqual(t.state.view.signedIn,false,'fixture deliberately makes no session replacement');
    const write=t.state.fileRequests.find(r=>r.action==='folders'&&r.json?.name==='Must stay out of owner B');assert.equal(write.owner,accounts.b.owner);assert.equal(write.expectedOwner,accounts.a.owner);assert.equal(write.status,401);
    await form.locator('[data-close]').click();
    const rejectedRead=page.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/files/list'&&r.status()===401);
    await page.locator('.ifx-location-list').getByRole('button',{name:'Recent',exact:true}).click();await rejectedRead;
    assert.doesNotMatch(await page.locator('body').innerText(),/Cookie replacement private folder/);
    const read=t.state.fileRequests.find(r=>r.action==='list'&&r.status===401);assert.equal(read.owner,accounts.b.owner);assert.equal(read.expectedOwner,accounts.a.owner);
    const after=await backend.api(accounts.b,'GET','list');assert.equal(after.value.usage.nodes,before.value.usage.nodes);assert.equal(after.value.items.some(item=>item.name==='Must stay out of owner B'),false);await t.clean();
  }finally{await t.close();}
});
