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
// Applies this phone's appearance (Account → Appearance) before the page is
// drawn, so it never flashes the wrong colours. Light unless chosen otherwise.
(function () {
  // (at InFlite's hub, nothing chosen follows the phone, as Today does, so the hub's tab bar is one bar on every page)
  var dflt = document.querySelector('meta[name="ifl-hub"]') ? "auto" : "light";
  var t = dflt;
  try { t = localStorage.getItem("inflight-theme") || dflt; } catch (e) { /* storage blocked: the default */ }
  if (t !== "dark" && t !== "auto" && t !== "light") t = dflt;
  var root = document.documentElement;
  root.setAttribute("data-theme", t);
  // InFlite's hub: Chat as its engine, in a frame of another of the hub's own pages (app.js ENGINE), is see-through from
  // the first frame, with nothing of its own on show but its send sheet (styles.css html.engine)
  try {
    if (document.querySelector('meta[name="ifl-hub"]') && /[?&]engine(?:[=&]|$)/.test(location.search) && window.parent !== window && window.parent.location.origin === location.origin) root.classList.add("engine");
  } catch (e) { /* framed by another site: never the engine */ }
  // the browser bar matches the page
  var dark = t === "dark" || (t === "auto" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", dark ? "#101210" : "#f8f9f6");
  // Chat is for phones and iPads. An iPad asks for desktop sites, calling
  // itself a Mac, but a Mac has no touchscreen. Anything else (a computer) is
  // shown a page saying Chat isn't available, and the app never starts.
  var ua = navigator.userAgent || "";
  // (an iPad with a trackpad or a mouse says its pointer is a fine one, but it's still touched: a Mac never is. And a big
  // Android tablet asking for the desktop site, as Chrome does on them: a Linux that's touched, and mostly by finger,
  // unlike a laptop with a touchscreen)
  var touched = navigator.maxTouchPoints > 1;
  var mobile = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && touched) || (/Linux/.test(ua) && touched && matchMedia("(pointer: coarse)").matches);
  // OS uses the existing key page on its own origin. This exception starts only
  // that first-party unlock page; standalone desktop Chat keeps its handoff.
  var osUnlock = location.hostname === "os.inflite.ai" && !!document.querySelector('meta[name="ifl-hub"]') && ["/chats/in/", "/chats/in/index.html"].includes(location.pathname);
  if (!mobile && !osUnlock) root.setAttribute("data-device", "computer");
  // back from signing in on the account's page (#signin=…): the page's last picture, its sky, its dawn and you, from
  // the very first frame (styles.css html.arriving), until app.js puts up its own copy (arriving). You: the initial
  // and a small copy of your photo the page sent in the # (f, p), the photo made a blob: here, as images are only ever
  // this site's or the phone's own
  else if (/^#signin=/.test(location.hash)) {
    root.classList.add("arriving");
    try {
      var q = new URLSearchParams(location.hash.slice(1)), f = q.get("f") || "", p = q.get("p") || "";
      if (Array.from(f).length === 1 && !/[\s"'\\]/.test(f)) { root.style.setProperty("--arv-i", JSON.stringify(f)); root.classList.add("arv-face"); }
      if (/^[A-Za-z0-9_-]{200,60000}$/.test(p)) {
        var bin = atob(p.replace(/-/g, "+").replace(/_/g, "/")), u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        window.arvPhoto = URL.createObjectURL(new Blob([u], { type: "image/jpeg" }));
        root.style.setProperty("--arv-p", 'url("' + window.arvPhoto + '")'); root.style.setProperty("--arv-i", '""'); root.classList.add("arv-face");
      }
    } catch (e) { /* no picture of you: the sky alone */ }
    // and the code it brought swapped for Chat's sign-in straight away, with the word kept for it, rather than once
    // the app itself has come (app.js signInBack takes up the answer: arvSwap)
    try {
      var code = /^#signin=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(location.hash), k = JSON.parse(localStorage.getItem("inflight-signin") || "null");
      if (code && k && k.word && Date.now() - k.at < 30 * 60000 && window.fetch) {
        // (on a signal that's stalled, given up on after 25 s, as any of the app's own asks is: the welcome says so, and
        // you can try again, rather than "Signing in…" for as long as the phone waits)
        var quit = window.AbortSignal && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined;
        window.arvSwap = { code: code[1], answer: fetch("/api/pigeon/handback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code[1], verifier: k.word }), signal: quit })
          .then(function (r) { var json = /json/.test(r.headers.get("Content-Type") || ""); return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, json: json, d: d }; }); }) };
      }
    } catch (e) { /* the app asks itself, as before */ }
  }
  // Chat itself (app.js, and what it brings) not arriving, or stopping before it's up: rather than "Opening Chat…" for
  // ever (a Home Screen app has no reload of its own), what happened, and Try Again. Once it's up, anything that goes
  // wrong is app.js's to say (bootFail)
  if (mobile || osUnlock) {
    var stuck = function (lost) {
      var s = document.getElementById("screen"), l = s && s.firstElementChild;
      // (it's up: app.js has put its own screen in place of "Opening Chat…" (mount), whatever's still loading inside it.
      // Said already that it's taking a while, only its not arriving is said over that)
      if (!l || !(l.classList.contains("loading") || (lost && l.hasAttribute("data-early")))) return;
      root.classList.remove("arriving");                          // (never the account's page's sky over it)
      s.innerHTML = '<div class="bootfail" data-early role="alert"><div class="appicon"><svg viewBox="0 0 24 24" class="bird" aria-hidden="true"><use href="#bird-path"/></svg></div>'
        + (lost ? "<h1>Chat couldn’t open</h1><p>Part of it didn’t arrive, as can happen on a weak signal. Your messages are safe.</p>"
          : "<h1>Chat is taking a while</h1><p>It’s still opening. If nothing happens, try again.</p>")
        + '<button type="button" class="btn wide" id="bootretry">Try Again</button></div>';
      document.getElementById("bootretry").addEventListener("click", function () { location.reload(); });
    };
    // (a module that couldn't be fetched, or one it imports, says so on its script: caught on the way down, as it doesn't bubble)
    document.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "SCRIPT" && t.type === "module") stuck(true); }, true);
    setTimeout(function () { stuck(false); }, 15000);
  }
})();

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
  const read = () => { try { const p=JSON.parse(localStorage.getItem(key)); return valid(p)?p:null; } catch { return null; } };
  const legacy = () => { for(const k of ['acct:appearance','today:appearance','inflight-theme','fitness:appearance','markets:appearance','mail:appearance']){try{const v=localStorage.getItem(k);if(modes.includes(v))return v;}catch{}}return modes.includes(root.dataset.theme)?root.dataset.theme:'auto'; };
  let state=read() || {appearance:legacy(),palette:'inflite'}, revision=0, loading=null, lastSync=0, colourTransition=null;
  const mq=matchMedia('(prefers-color-scheme: dark)'), still=matchMedia('(prefers-reduced-motion: reduce)');
  const snapshot=()=>Object.freeze({...state});
  function cache(){try{localStorage.setItem(key,JSON.stringify(state));for(const k of ['acct:appearance','today:appearance','inflight-theme','fitness:appearance','markets:appearance','mail:appearance'])localStorage.setItem(k,state.appearance);}catch{}}
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
    bars();
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
  function accept(p,{animate=false}={}){if(!valid(p))return false;revision++;state={appearance:p.appearance,palette:p.palette,...(typeof p.id==='string'?{id:p.id}:state.id?{id:state.id}:{})};cache();apply(animate);return true;}
  const canonical=location.hostname==='inflite.ai'||location.hostname==='os.inflite.ai';
  const endpoint=canonical?'/account/api/account/appearance':/^(account|auth)\.inflite\.ai$/.test(location.hostname)?'/api/account/appearance':null;
  async function refresh(){
    if(!endpoint||loading||Date.now()-lastSync<15000||document.hidden)return loading;
    lastSync=Date.now();const mine=revision, controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),8000);
    loading=fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(p=>{if(revision===mine&&p?.signedIn===true)accept(p);}).catch(()=>{}).finally(()=>{clearTimeout(timeout);loading=null;});return loading;
  }
  globalThis.InFliteAppearance=Object.freeze({palettes,snapshot,accept,refresh,fromApp:p=>{if(!endpoint&&p?.palette)accept({...p,appearance:p.appearance||'auto'});}});
  apply();
  // Old app-specific appearance readers cannot replace the unified account mode.
  new MutationObserver(()=>{const expected=state.appearance==='auto'?undefined:state.appearance;if(root.dataset.theme!==expected)apply();}).observe(root,{attributes:true,attributeFilter:['data-theme']});
  for(const m of document.querySelectorAll('meta[name="theme-color"]'))new MutationObserver(bars).observe(m,{attributes:true,attributeFilter:['content']});
  mq.addEventListener?.('change',()=>{if(state.appearance==='auto')apply();});
  globalThis.addEventListener('storage',e=>{if(e.key!==key)return;const p=read();if(p&&(!state.id||!p.id||p.id===state.id))accept(p,{animate:true});});
  globalThis.addEventListener('pageshow',refresh);
  globalThis.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})();
// ==== End InFlite Appearance ====
