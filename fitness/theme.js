// ==== InFlite motion: shared lifecycle ====
// Pause presentation motion before first paint and while the page is in the app
// switcher. This does not pause data, requests, navigation or authentication.
(() => {
  const doc = globalThis.document, root = doc?.documentElement;
  if (!root?.toggleAttribute || globalThis.__iflMotionReady) return;
  globalThis.__iflMotionReady = true;
  const sync = () => root.toggleAttribute("data-motion-paused", doc.visibilityState === "hidden");
  doc.addEventListener?.("visibilitychange", sync);
  globalThis.addEventListener?.("pagehide", () => root.toggleAttribute("data-motion-paused", true));
  globalThis.addEventListener?.("pageshow", sync);
  sync();
})();
// ==== End InFlite motion ====
// ==== InFlite page zoom: shared guard ====
// InFlite's page zoom policy. Runs before sign-in and independently of the menu.
// Components such as maps and photo viewers retain their own gesture handling.
(() => {
  if (globalThis.__iflZoomBlocked) return;
  globalThis.__iflZoomBlocked = true;
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (event) => event.preventDefault(), { passive: false });
  }
  document.addEventListener("touchmove", (event) => {
    if (event.touches?.length > 1) event.preventDefault();
  }, { passive: false });
})();
// ==== End InFlite page zoom ====
// Light or Dark, as chosen in Settings (app.js remembers it in this browser), set as the page is read, before it's first
// drawn, and the browser's bar with it. (Automatic needs nothing: the stylesheet follows the device. A file of its own:
// the page's rules run no script written in it)
try {
  const t = localStorage.getItem("fitness:appearance");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", t === "dark" ? "#101210" : "#f8f9f6");
  }
} catch (_) {}
// Back from signing in on the account's page (#signin=…): the page's last picture, its sky and you, from the very first
// frame (styles.css html.arriving), until app.js puts up its own copy of it (arriving), as Chat's does. You: the
// initial and the small copy of your photo the page sent in the # (f, p), the photo made a blob: here
try {
  if (/^#signin=/.test(location.hash)) {
    const root = document.documentElement, q = new URLSearchParams(location.hash.slice(1)), f = q.get("f") || "", p = q.get("p") || "";
    root.classList.add("arriving");
    if (Array.from(f).length === 1 && !/[\s"'\\]/.test(f)) { root.style.setProperty("--arv-i", JSON.stringify(f)); root.classList.add("arv-face"); }
    if (/^[A-Za-z0-9_-]{200,60000}$/.test(p)) {
      const bin = atob(p.replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      window.arvPhoto = URL.createObjectURL(new Blob([u], { type: "image/jpeg" }));
      root.style.setProperty("--arv-p", `url("${window.arvPhoto}")`); root.style.setProperty("--arv-i", '""'); root.classList.add("arv-face");
    }
  }
} catch (_) { /* no picture of you: the sky alone */ }
// What's changed in your account since this phone's copy of it, asked for as the page is read: on its way while the
// app's code loads, not after (account.js me takes it up; app.js keeps the copy's time, fitness:meAt). Not when back
// from signing in: that's asked for otherwise.
try {
  if (!/^#signin=/.test(location.hash)) {
    const k = JSON.parse(localStorage.getItem("fitness:meAt") || "null"), since = k && Number.isFinite(k.at) ? Math.round(k.at) : null;
    // (given up on after 20 seconds: one that hangs mustn't hold up every later sync this session)
    const stop = new AbortController(); setTimeout(() => stop.abort(), 20000);
    // (as account.js meQuery asks it: InFlite Today's own rides among the plans, and the rides' times by this phone's days)
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
    window.fxEarly = { since, today: true, got: fetch(`/api/fitness/me?${since ? `since=${since}&` : ""}today=1${tz ? `&tz=${encodeURIComponent(tz)}` : ""}`, { credentials: "same-origin", signal: stop.signal }) };
    window.fxEarly.got.catch(() => {});   // (offline, or not taken up: no matter, it's asked again)
  }
} catch (_) {}

// ==== Bio arrival ====
// Continue the bio's icon transition over this app's own, already-selected appearance.
// A pseudo-element cover is bounded by CSS as well as script: it can never hold an app behind a failed request.
(() => {
  const root = document.documentElement;
  let source;
  try { source = new URL(document.referrer); } catch (_) { return; }
  if (!/^(www\.)?georgefarrowgreen\.com$/.test(source.hostname) || window.top !== window ||
      performance.getEntriesByType?.('navigation')[0]?.type === 'back_forward' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const icon = document.querySelector('link[rel="apple-touch-icon"]');
  if (icon) root.style.setProperty('--bio-entry-icon', `url(${JSON.stringify(icon.href)})`);
  root.classList.add('bio-arrival');
  let end, safety;
  function clean() {
    clearTimeout(end); clearTimeout(safety);
    root.classList.remove('bio-arrival', 'bio-arrived'); root.style.removeProperty('--bio-entry-icon');
    removeEventListener('pagehide', clean); removeEventListener('pageshow', restored);
    document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', clean);
    document.removeEventListener('pointerdown', clean);
  }
  function ready() { if (!root.classList.contains('bio-arrival')) return; root.classList.add('bio-arrived'); end = setTimeout(clean, 360); }
  function restored(e) { if (e.persisted) clean(); }
  function visibility() { if (document.hidden) clean(); }
  addEventListener('pagehide', clean); addEventListener('pageshow', restored);
  document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', clean);
  document.addEventListener('pointerdown', clean, { passive: true });
  safety = setTimeout(clean, 1400);
  const paint = () => requestAnimationFrame(() => requestAnimationFrame(ready));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint, { once: true }); else paint();
})();
// ==== End Bio arrival ====

// ==== InFlite Appearance: generated by .tools/appearance.mjs ====
// Shared Appearance runtime. Bundled into each early script by appearance.mjs.
// Only curated identifiers enter storage or CSS; no account content is cached.
(() => {
  if (globalThis.InFliteAppearance || !globalThis.document?.documentElement?.style?.setProperty) return;
  const root = document.documentElement, key = 'inflite:appearance:v1';
  // page, panel, inset, text, secondary, line, action, on-action, selection, link
  const palettes = {
    inflite: {name:'InFlite', light:['#f5f6f1','#ffffff','#edf0e7','#20251b','#626a58','#dfe5d7','#afe52c','#192309','#e9f4d3','#3e6710'],dark:['#0d130e','#182019','#222c24','#f1f5ed','#aeb9a7','#344033','#b0ed35','#192309','#2c3c1f','#b0ed35']},
    coast: {name:'Coast',light:['#f2f6fa','#ffffff','#e9f0f7','#19283a','#56667a','#d9e3ef','#2058cd','#ffffff','#e2edff','#2058cd'],dark:['#101720','#1a2533','#243347','#edf4fc','#a8b9cc','#364b62','#88b9ff','#0a2444','#223c60','#88b9ff']},
    iris: {name:'Iris',light:['#f6f3fc','#ffffff','#eee9f8','#282139','#6d617d','#e0d9ec','#6851cb','#ffffff','#ece5ff','#6851cb'],dark:['#16121e','#231d2f','#30273f','#f4effb','#bfb0d1','#473953','#c2a9ff','#291940','#3c2f56','#c2a9ff']},
    ember: {name:'Ember',light:['#faf4ef','#fffdfc','#f2e7df','#35241e','#785e51','#eadacd','#b84323','#ffffff','#fbe5d7','#a2391b'],dark:['#1b1511','#2a211b','#392c22','#faf0e5','#c5ae9b','#514030','#ffad80','#38200f','#4c3021','#ffad80']},
    rose: {name:'Rose',light:['#fbf3f6','#fffcfd','#f5e7ed','#34232c','#785d69','#ebd9e1','#a82c61','#ffffff','#f8deea','#a82c61'],dark:['#1b1218','#2b1d25','#3a2832','#f9eef4','#c8afbc','#523a46','#f5a6c8','#371c2b','#4c2c3d','#f5a6c8']},
    graphite: {name:'Graphite',light:['#f3f5f4','#ffffff','#e9edec','#202725','#5d6863','#dbe1de','#202725','#f6f8f6','#e4eae6','#202725'],dark:['#111615','#1d2421','#29322e','#f0f4f1','#afbcb4','#3c4741','#e7ede8','#18201c','#36433b','#e7ede8']}
  };
  Object.values(palettes).forEach(p => { Object.freeze(p.light); Object.freeze(p.dark); Object.freeze(p); });
  Object.freeze(palettes);
  const modes = ['auto','light','dark'];
  const valid = p => p && typeof p === 'object' && modes.includes(p.appearance) && Object.hasOwn(palettes,p.palette);
  const glassOf=(p,fallback={glass:true,glassStrength:70})=>({glass:typeof p?.glass==='boolean'?p.glass:fallback.glass,glassStrength:Number.isInteger(p?.glassStrength)&&p.glassStrength>=0&&p.glassStrength<=100?p.glassStrength:fallback.glassStrength});
  const read = () => { try { const p=JSON.parse(localStorage.getItem(key)); return valid(p)?p:null; } catch { return null; } };
  const legacy = () => { for(const k of ['acct:appearance','today:appearance','inflight-theme','fitness:appearance','markets:appearance','mail:appearance']){try{const v=localStorage.getItem(k);if(modes.includes(v))return v;}catch{}}return modes.includes(root.dataset.theme)?root.dataset.theme:'auto'; };
  let state=read() || {appearance:legacy(),palette:'inflite'}, revision=0, loading=null, lastSync=0, colourTransition=null, glassPreview=null;
  state={...state,...glassOf(state)};
  const mq=matchMedia('(prefers-color-scheme: dark)'), still=matchMedia('(prefers-reduced-motion: reduce)');
  const hover=matchMedia('(hover: hover) and (pointer: fine)'),transparent=matchMedia('(prefers-reduced-transparency: reduce)'),contrast=matchMedia('(prefers-contrast: more)'),forced=matchMedia('(forced-colors: active)');
  let pointer=null,pointerFrame=0,pointerX=0,pointerY=0;
  const snapshot=()=>Object.freeze({...state});
  function cache(){try{localStorage.setItem(key,JSON.stringify({...state,...(glassPreview||{})}));for(const k of ['acct:appearance','today:appearance','inflight-theme','fitness:appearance','markets:appearance','mail:appearance'])localStorage.setItem(k,state.appearance);}catch{}}
  function bars(){for(const m of document.querySelectorAll('meta[name="theme-color"]')){const dark=state.appearance==='dark'||(state.appearance==='auto'&&m.media?.includes('dark'));const colour=palettes[state.palette][dark?'dark':'light'][0];if(m.getAttribute('content')!==colour)m.setAttribute('content',colour);}}
  function apply(animate=false){
    const draw=()=>{
    const dark=state.appearance==='dark'||(state.appearance==='auto'&&mq.matches), p=palettes[state.palette][dark?'dark':'light'];
    const values={page:p[0],surface:p[1],'surface-2':p[2],raised:p[1],text:p[3],muted:p[4],subtle:p[4],line:p[5],press:`color-mix(in srgb, ${p[3]} 7%, transparent)`,accent:p[9],'accent-ink':p[9],'accent-fill':p[6],'on-accent':p[7],'accent-wash':p[8],'accent-soft':p[8],'accent-gradient':'linear-gradient(110deg, var(--ifl-accent-fill), var(--ifl-accent-fill))',contrast:dark?p[6]:p[3],'on-contrast':dark?p[7]:p[1]};
    // Commit the palette as one style update, preserving unrelated shell geometry.
    const style=document.createElement('span').style;style.cssText=root.style.cssText;
    for(const [k,v]of Object.entries(values))style.setProperty('--ifl-'+k,v);
    style.color=p[3];style.colorScheme=dark?'dark':'light';style.accentColor=p[6];style.caretColor=p[9];
    root.style.cssText=style.cssText;
    if(state.appearance==='auto')delete root.dataset.theme;else root.dataset.theme=state.appearance;
    root.dataset.palette=state.palette;
    applyGlass();bars();
    globalThis.dispatchEvent(new CustomEvent('inflite:appearance',{detail:snapshot()}));
    };
    if(!animate||still.matches||document.hidden||!document.startViewTransition||document.activeViewTransition){draw();return;}
    if(colourTransition){colourTransition.skipTransition();draw();return;}
    root.classList.add('ifl-colour-change');
    try{
      const t=colourTransition=document.startViewTransition(draw);
      t.ready.catch(()=>{});
      t.finished.catch(()=>{}).finally(()=>{if(colourTransition===t){colourTransition=null;root.classList.remove('ifl-colour-change');}});
    }catch{colourTransition=null;root.classList.remove('ifl-colour-change');draw();}
  }
  function accept(p,{animate=false,persist=true}={}){
    if(!valid(p))return false;revision++;const replaced=typeof p.id==='string'&&state.id&&p.id!==state.id;
    const glass=glassOf(p,replaced?undefined:state);if(replaced)clearPointer();
    state={appearance:p.appearance,palette:p.palette,...glass,...(typeof p.id==='string'?{id:p.id}:state.id?{id:state.id}:{})};
    if(replaced||Object.hasOwn(p,'glass')||Object.hasOwn(p,'glassStrength'))glassPreview=null;
    if(persist)cache();apply(animate);return true;
  }
  function applyGlass(){
    const amount=state.glass?state.glassStrength/100:0;
    root.dataset.glass=state.glass?'on':'off';
    const values={'glass-strength':amount,'glass-opacity':(100-14*amount)+'%','glass-strong-opacity':(100-3*amount)+'%','glass-control-opacity':(100-10*amount)+'%','glass-radius':(28*amount)+'px','glass-saturation':(100+50*amount)+'%','glass-rim-opacity':(62*amount)+'%','glass-light-opacity':(3*amount)+'%'};
    for(const[k,v]of Object.entries(values))root.style.setProperty('--ifl-'+k,String(v));
    if(!pointerAllowed())clearPointer();
  }
  function setGlass(change,{preview=false}={}){
    if(!change||typeof change!=='object'||Object.keys(change).some(k=>!['glass','glassStrength'].includes(k))||Object.hasOwn(change,'glass')&&typeof change.glass!=='boolean'||Object.hasOwn(change,'glassStrength')&&(!Number.isInteger(change.glassStrength)||change.glassStrength<0||change.glassStrength>100))return false;
    if(preview&&!glassPreview)glassPreview=glassOf(state);revision++;state={...state,...change};
    if(!preview){glassPreview=null;cache()}applyGlass();globalThis.dispatchEvent(new CustomEvent('inflite:appearance',{detail:snapshot()}));return true;
  }
  function cancelGlassPreview(){if(!glassPreview)return;revision++;state={...state,...glassPreview};glassPreview=null;applyGlass();globalThis.dispatchEvent(new CustomEvent('inflite:appearance',{detail:snapshot()}));}
  function pointerAllowed(){return state.glass&&state.glassStrength>0&&hover.matches&&!still.matches&&!transparent.matches&&!contrast.matches&&!forced.matches&&!document.hidden}
  function clearPointer(){if(pointerFrame)cancelAnimationFrame(pointerFrame);pointerFrame=0;if(pointer){pointer.removeAttribute('data-ifl-pointer');pointer.style.removeProperty('--ifl-pointer-x');pointer.style.removeProperty('--ifl-pointer-y')}pointer=null}
  const surfaces='.ifm-pop,.ifm-grp,.ifm-note,.ifm-card,.ifm-row,.ifh-acts,.ifh-act,.ifl-back,.ifl-tabs,.ifs-btn,.ifa-sheet,.ifb,.ifl-sheet,.glass,.ifl-card,.ifl-list,.ifl-tile,.ws-dock,.ws-dock-button,.ws-launcher button,.pill,.ifl-btn,.ifl-chip.action,.ifl-icon-btn,.appearance-glass-preview-pane,.ch-composer,.ch-field,.mr-bar,.ifx-toolbar,.ifx-sidebar,.ch-attach,.ch-send,.mk-ib,.mv,.ib,.chip-btn,.addb,.tool,.btn:is(.quiet,.ghost),.appearance-palette,.appear,.org-record,.org-date,.ifx-button,.ifx-icon-button,.ifx-action,.ifx-file-main,.ifx-location,button.gbtn,button.c-tool,button.menu-item,.icon-btn,.pill-btn,.row-btn,.acct-btn,.round:not(.me),button.row';
  const excluded='.primary,.destructive,.filled,.on,.selected,.warn,.error,.danger,.is-primary,.is-destructive,:disabled,[aria-disabled=true],[aria-pressed=true],[aria-selected=true],[data-selected=true],[aria-current],[data-glass-static]';
  function surface(target){
    if(!(target instanceof Element))return null;
    for(let node=target.closest(surfaces);node;node=node.parentElement?.closest(surfaces)){
      if(node.matches(excluded)||node.closest('[inert], [hidden], .ibars, .ichart')||node.matches('.ib')&&node.querySelector(':scope > i'))continue;
      if(node===pointer)return node;
      if(node.querySelector('canvas,iframe,video,.map,.chart,.sparkline,[data-map]'))continue;
      const image=getComputedStyle(node).backgroundImage;
      if(image.includes('url(')||node.matches('button,a')&&image!=='none')continue;
      return node;
    }return null;
  }
  function movePointer(e){
    if(e.pointerType!=='mouse'||e.buttons||!pointerAllowed()){clearPointer();return}
    const next=surface(e.target);if(next!==pointer){clearPointer();pointer=next;if(pointer)pointer.setAttribute('data-ifl-pointer','')}
    if(!pointer)return;pointerX=e.clientX;pointerY=e.clientY;
    if(!pointerFrame)pointerFrame=requestAnimationFrame(()=>{pointerFrame=0;if(!pointer?.isConnected||!pointerAllowed()){clearPointer();return}const r=pointer.getBoundingClientRect();if(!r.width||!r.height)return clearPointer();pointer.style.setProperty('--ifl-pointer-x',Math.round(Math.max(0,Math.min(1,(pointerX-r.left)/r.width))*100)+'%');pointer.style.setProperty('--ifl-pointer-y',Math.round(Math.max(0,Math.min(1,(pointerY-r.top)/r.height))*100)+'%')});
  }
  document.addEventListener('pointermove',movePointer,{passive:true});
  document.addEventListener('pointerdown',clearPointer,{passive:true});
  document.addEventListener('pointerout',e=>{if(pointer&&(!(e.relatedTarget instanceof Node)||!pointer.contains(e.relatedTarget)))clearPointer()},{passive:true});
  document.addEventListener('scroll',clearPointer,{passive:true,capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPointer()});
  globalThis.addEventListener('pagehide',clearPointer);
  for(const q of [hover,still,transparent,contrast,forced])q.addEventListener?.('change',clearPointer);
  const canonical=location.hostname==='inflite.ai'||location.hostname==='os.inflite.ai';
  const endpoint=canonical?'/account/api/account/appearance':/^(account|auth)\.inflite\.ai$/.test(location.hostname)?'/api/account/appearance':null;
  async function refresh(){
    if(!endpoint||loading||Date.now()-lastSync<15000||document.hidden)return loading;
    lastSync=Date.now();const mine=revision, controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),8000);
    loading=fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(p=>{if(revision===mine&&p?.signedIn===true)accept(p);}).catch(()=>{}).finally(()=>{clearTimeout(timeout);loading=null;});return loading;
  }
  globalThis.InFliteAppearance=Object.freeze({palettes,snapshot,accept,setGlass,cancelGlassPreview,refresh,fromApp:p=>{if(!endpoint&&p?.palette)accept({...p,appearance:p.appearance||'auto'});}});
  apply();
  // Old app-specific appearance readers cannot replace the unified account mode.
  new MutationObserver(()=>{const expected=state.appearance==='auto'?undefined:state.appearance;if(root.dataset.theme!==expected)apply();}).observe(root,{attributes:true,attributeFilter:['data-theme']});
  for(const m of document.querySelectorAll('meta[name="theme-color"]'))new MutationObserver(bars).observe(m,{attributes:true,attributeFilter:['content']});
  mq.addEventListener?.('change',()=>{if(state.appearance==='auto')apply();});
  globalThis.addEventListener('storage',e=>{if(e.key!==key)return;const p=read();if(p&&(!state.id||!p.id||p.id===state.id))accept(p,{animate:true,persist:false});});
  globalThis.addEventListener('pageshow',refresh);
  globalThis.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})();
// ==== End InFlite Appearance ====
