/* ----------------------------------------------------------------------
   georgefarrowgreen.com: the home page.
   - The words (in the page as it's sent: functions/_home.js; the owner's changes, /api/content), the photos behind
     them as a slideshow (/api/background)
   - Who's looking (/api/me): a visitor (Sign in), someone signed in on the site
     (their photo, and their figures in each app), or the owner, who can edit
     the words in place and change the photos (functions/_auth.js)
   - Get in touch: a message, sent from a sheet (/api/contact)
---------------------------------------------------------------------- */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
// Chat's old home was here (georgefarrowgreen.com/pigeon/); it's at chat.inflite.ai now, and what a phone kept of it
// here, its sign-in and the handle on its key, goes: nothing on this site's own address keeps them now
if (/^(www\.)?georgefarrowgreen\.com$/.test(location.hostname)) {
  try { indexedDB.deleteDatabase("inflight"); for (const k of Object.keys(localStorage)) if (k.startsWith("inflight")) localStorage.removeItem(k); } catch (_) {}
}
const clamp = (v) => Math.min(1, Math.max(0, v));
const body = document.body, root = document.documentElement;
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const phone = matchMedia("(max-width: 600px)");
// Account discovery finishes on the server before rendering. Clean its return marker in place.
const accountReturn = new URL(location.href);
if (accountReturn.searchParams.get("__ifl_account") === "checked") {
  accountReturn.searchParams.delete("__ifl_account");
  history.replaceState(null, "", accountReturn.pathname + accountReturn.search + accountReturn.hash);
}

// The site's motion, in script as in the styles (styles.css: --ease-out for what arrives, --ease-glide for what slides)
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)", GLIDE = "cubic-bezier(0.32, 0.72, 0, 1)";
// Read the same rhythm CSS uses once, before any interaction. Frame loops never read computed styles.
const MOTION = (() => {
  const style = getComputedStyle(body), read = (name, fallback) => {
    const value = style.getPropertyValue(`--bio-${name}`).trim(), number = parseFloat(value);
    if (!Number.isFinite(number) || number <= 0) return fallback;
    // CSS optimisation can rewrite 420ms as .42s. Web Animations always expects milliseconds.
    return number * (value.endsWith("ms") ? 1 : value.endsWith("s") ? 1000 : 1);
  };
  return { fast: read("fast", 180), enter: read("enter", 420), exit: read("exit", 260), layout: read("layout", 340), stagger: read("stagger", 50) };
})();

// Critically damped positions and velocities, sampled once into native keyframes. Retargeting retains momentum
// without a JS animation loop or a queue of old gestures. Velocities are in units per second.
function springValue(from, to, velocity, seconds, omega = 22) {
  const delta = from - to, b = velocity + omega * delta, decay = Math.exp(-omega * seconds);
  return [to + (delta + b * seconds) * decay, (velocity - omega * b * seconds) * decay];
}
// (words changed in place fade in, rather than snapping; only where they're actually different, and in sight)
function fadeText(el, t) {
  if (el.textContent === t) return;
  el.textContent = t;
  if (!motion.matches && el.isConnected && Number(getComputedStyle(el).opacity) > 0.5) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fast, easing: EASE_OUT });
}

// (the words as the page came with them: the server writes them in as it sends it (functions/_home.js), so they're
// not asked for again, and a request that didn't come back can't put the defaults in their place, for the owner to save;
// asked for only when they may not be these: wordsDue, at the end)
const fromPage = (k) => $(`[data-c=${k}][data-edit]`).textContent;
let content = { role: fromPage("role"), name: fromPage("name"), bio: fromPage("bio") };
let me = null;           // /api/me, once it's known
let editing = false;
let pinned = null;       // where the page was scrolled to, while it's held still behind a sheet

// The server's answer, or an Error saying what went wrong
// (20 seconds at most, unless it's given longer: a weak signal says so, rather than hanging; iOS 15 has no
// AbortSignal.timeout, so it's made here)
if (typeof AbortSignal !== "undefined" && !AbortSignal.timeout) AbortSignal.timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
async function api(path, { method = "GET", body: data, timeout = 20000 } = {}) {
  let r, signal;
  try {
    signal = AbortSignal.timeout(timeout);
    r = await fetch(path, {
      method, cache: "no-store", credentials: "same-origin", signal,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch (_) {
    // (out of time isn't the same as no connection, and it may have got there all the same; asked of the signal, as
    // iOS 15's timer above ends it with no reason given)
    const slow = !!signal?.aborted;
    throw Object.assign(new Error(slow ? "That’s taking too long: the signal may be weak. Try again in a moment." : "You’re offline. Try again when you’re back online."), { offline: !slow, slow });
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "Something went wrong. Try again."), { status: r.status, field: d.field });
  return d;
}

/* ---------------- the words ---------------- */
function showContent() {
  for (const el of $$("[data-c]")) if (!(editing && el.hasAttribute("data-edit"))) fadeText(el, content[el.dataset.c] || "");
  document.title = content.name;
  const ld = $("#ld-person");
  if (ld) ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Person", name: content.name, description: content.bio,
    url: "https://georgefarrowgreen.com/", sameAs: ["https://instagram.com/georgefarrowgreen"] });
}

let photos = [];
const photoUrl = (p, small = phone.matches) => "/api/background?id=" + encodeURIComponent(p.id) + (small && p.m ? "&s=m" : "");
let photoRequest = 0;

const panels = $$(".fi-reel button");
const collections = panels.map(panel => JSON.parse(decodeURIComponent(panel.dataset.collection || "[]")));
const photoIndices = panels.map(() => 0);

// The resting gallery uses flexbox. During a selection, slide three clipped
// photo layers between the old and new apertures without reflowing every frame.
const reel = $(".fi-reel");
let galleryMotion, gallerySettled;
function measureFrame(panel) {
  const box = panel.getBoundingClientRect(), image = $("img", panel);
  if (galleryMotion) {
    const aperture = $(".fi-window", panel).getBoundingClientRect();
    const photo = image.getBoundingClientRect();
    return {left: box.left, width: aperture.right - box.left, x: photo.left - box.left, y: photo.top - box.top, photoWidth: photo.width, photoHeight: photo.height};
  }
  const scale = Math.max(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const photoWidth = image.naturalWidth * scale, photoHeight = image.naturalHeight * scale;
  const [fx, fy] = getComputedStyle(image).objectPosition.split(" ").map(n => parseFloat(n) / 100);
  return {left: box.left, width: box.width, x: (box.width - photoWidth) * fx, y: (box.height - photoHeight) * fy, photoWidth, photoHeight};
}
function settleGallery() {
  if (!galleryMotion) return;
  for (const animation of galleryMotion) animation.cancel();
  galleryMotion = null;
  reel.classList.remove("switching");
}
function moveGallery(items, previous, options = {}) {
  const next = items.map(measureFrame), left = reel.getBoundingClientRect().left;
  const animations = galleryMotion = [];
  const timing = {duration: 510, easing: "cubic-bezier(.32,.08,.2,1)", fill: "both", ...options};
  reel.classList.add("switching");
  items.forEach((panel, i) => {
    const from = previous[i], to = next[i], width = Math.max(from.width, to.width);
    const image = $("img", panel);
    panel.style.setProperty("--aperture", width + "px");
    image.style.setProperty("--photo-width", to.photoWidth + "px");
    image.style.setProperty("--photo-height", to.photoHeight + "px");
    animations.push(panel.animate([from, to].map(frame => ({
      transform: `translate3d(${frame.left - left}px, 0, 0)`
    })), timing));
    animations.push($(".fi-window", panel).animate([from, to].map(frame => ({
      transform: `translate3d(${frame.width - width}px, 0, 0)`
    })), timing));
    animations.push(image.animate([from, to].map(frame => ({
      transform: `translate3d(${frame.x + width - frame.width}px, ${frame.y}px, 0) scale(${frame.photoWidth / to.photoWidth})`
    })), timing));
  });
  gallerySettled = Promise.all(animations.map(a => a.finished)).then(() => {
    if (galleryMotion === animations) settleGallery();
  }, () => {});
}
addEventListener("pagehide", settleGallery);
motion.addEventListener("change", settleGallery);
if (window.ResizeObserver) new ResizeObserver(settleGallery).observe(reel);

function galleryReady(items) {
  return items.every(item => {
    const images = $$("img", item);
    return images.length === 1 && images[0].complete && images[0].naturalWidth;
  });
}
function selectPanel(panel, travel = false) {
  if (travel && panel.getAttribute("aria-pressed") === "true") return;
  const items = panels.filter(item => !item.hidden);
  const glide = travel && !motion.matches && !body.classList.contains("playing-opening") &&
    galleryReady(items);
  const previous = glide ? items.map(measureFrame) : null;
  settleGallery();
  panels.forEach((item, index) => {
    const selected = item === panel;
    const label = item.dataset.label;
    item.setAttribute("aria-pressed", String(selected));
    item.setAttribute("aria-label", selected && collections[index].length > 1
      ? label + ", show next photograph" : "Expand " + label + " photograph");
  });
  if (glide) moveGallery(items, previous);
}

function displayPhoto(panel, frame) {
  const image = $("img", panel);
  if (image.getAttribute("src") !== frame.src) image.src = frame.src;
  image.alt = frame.alt;
  image.style.objectPosition = frame.position;
  panel.dataset.label = frame.label;
}

// Decode the next frame offscreen. Quick taps can supersede a pending image
// while the currently visible photograph stays in place.
const pendingPhotos = new WeakMap();
async function advancePhoto(panel, frame) {
  const original = $("img", panel);
  const incoming = original.cloneNode(false);
  incoming.removeAttribute("fetchpriority");
  incoming.src = frame.src;
  incoming.alt = frame.alt;
  incoming.style.objectPosition = frame.position;
  const previous = pendingPhotos.get(panel);
  const request = { fading: previous?.fading };
  pendingPhotos.set(panel, request);
  try {
    await incoming.decode();
    await request.fading?.finished.catch(() => {});
    while (galleryMotion && pendingPhotos.get(panel) === request) await gallerySettled;
    if (pendingPhotos.get(panel) !== request) return;
    const current = $("img", panel);
    panel.dataset.label = frame.label;
    const selected = panel.getAttribute("aria-pressed") === "true";
    panel.setAttribute("aria-label", selected ? frame.label + ", show next photograph" : "Expand " + frame.label + " photograph");
    if (!motion.matches && selected) {
      incoming.setAttribute("aria-hidden", "true");
      current.after(incoming);
      request.fading = incoming.animate([{opacity: 0}, {opacity: 1}], {duration: 280, easing: "ease-in-out"});
      await request.fading.finished.catch(() => {});
      incoming.removeAttribute("aria-hidden");
    }
    if (current.isConnected) current.replaceWith(incoming);
  } catch { /* A failed frame leaves the visible photograph in place. */ }
  finally {
    if (pendingPhotos.get(panel) === request) pendingPhotos.delete(panel);
  }
}

async function loadPhotos() {
  const sequence = ++photoRequest;
  try {
    const data = await api("/api/background?gallery=1");
    if (sequence !== photoRequest) return;
    photos = data.images || [];
    if (Array.isArray(data.collections)) {
      data.collections.forEach((group, index) => {
        const panel = panels[index];
        const pending = pendingPhotos.get(panel);
        pendingPhotos.delete(panel);
        if (pending?.fading) {
          pending.fading.cancel();
          // A library refresh owns the new frame immediately.
          for (const stale of $$("img", panel).slice(0, -1)) stale.remove();
        }
        collections[index] = group;
        photoIndices[index] = 0;
        panel.hidden = !group.length;
        if (group.length) displayPhoto(panel, group[0]);
      });
      selectPanel(panels.find(panel => !panel.hidden && panel.getAttribute("aria-pressed") === "true")
        || panels.find(panel => !panel.hidden));
    }
    showThumbs();
  } catch (_) { /* Keep the server-rendered gallery when the editor's library is unavailable. */ }
}
for (const image of $$(".fi-reel [data-focus]")) image.style.objectPosition = image.dataset.focus;
selectPanel(panels.find(panel => !panel.hidden && panel.getAttribute("aria-pressed") === "true"));
panels.forEach((panel, index) => panel.addEventListener("click", () => {
  const group = collections[index];
  if (panel.getAttribute("aria-pressed") === "true" && group.length > 1) {
    photoIndices[index] = (photoIndices[index] + 1) % group.length;
    advancePhoto(panel, group[photoIndices[index]]);
  }
  selectPanel(panel, true);
}));

$(".fi-reel").addEventListener("keydown", event => {
  const visible = panels.filter(panel => !panel.hidden);
  const index = visible.indexOf(event.target);
  if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
  let next;
  switch (event.key) {
    case "ArrowRight": next = (index + 1) % visible.length; break;
    case "ArrowLeft": next = (index + visible.length - 1) % visible.length; break;
    case "Home": next = 0; break;
    case "End": next = visible.length - 1; break;
    default: return;
  }
  event.preventDefault();
  visible[next].focus({preventScroll: true});
  selectPanel(visible[next], true);
});

// Keep the active photo selected until release. A horizontal gesture seeks the
// same nine transforms as a tap; vertical scrolling and pinch zoom stay native.
function setupGalleryDrag() {
  let gesture = null, suppressClick = false;

  function release(commit) {
    const g = gesture;
    gesture = null;
    if (!g || !g.dragging) return;
    if (reel.hasPointerCapture(g.id)) reel.releasePointerCapture(g.id);
    reel.classList.remove("dragging");
    if (!g.to || (g.track && g.track !== galleryMotion)) return;
    const destination = commit ? g.to : g.from;
    const remaining = commit ? 1 - g.progress : g.progress;
    const painted = g.track && remaining > .01 ? g.items.map(measureFrame) : null;
    selectPanel(destination);
    if (painted && !motion.matches) {
      moveGallery(g.items, painted, {duration: 110 + 230 * remaining, easing: EASE_OUT});
    }
  }

  reel.addEventListener("pointerdown", e => {
    if (!e.isPrimary) { release(false); return; }
    if (e.button !== 0 || !e.target.closest("button")) return;
    suppressClick = false;
    const from = panels.find(item => !item.hidden && item.getAttribute("aria-pressed") === "true");
    if (!from) return;
    gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, from, start: e.timeStamp, progress: 0};
  });
  reel.addEventListener("pointermove", e => {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 9) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.25) { gesture = null; return; }
      g.dragging = suppressClick = true;
      reel.setPointerCapture(g.id);
      reel.classList.add("dragging");
      g.items = panels.filter(item => !item.hidden);
    }
    const direction = dx < 0 ? 1 : -1;
    if (direction !== g.direction && Math.abs(dx) > 8) {
      // Crossing the starting point can reveal the neighbour on the other side.
      if (g.track) settleGallery();
      g.track = null; g.progress = 0; g.travel = 0;
      g.direction = direction;
      g.to = g.items[g.items.indexOf(g.from) + direction];
      if (!g.to) return;
      const painted = !motion.matches && galleryReady(g.items) ? g.items.map(measureFrame) : null;
      settleGallery();
      g.distance = Math.max(96, Math.abs(g.from.offsetWidth - g.to.offsetWidth));
      if (painted) {
        g.from.classList.add("preview-origin"); g.to.classList.add("preview-target");
        moveGallery(g.items, painted, {duration: 1000, easing: "linear"});
        g.from.classList.remove("preview-origin"); g.to.classList.remove("preview-target");
        g.track = galleryMotion;
        for (const animation of g.track) animation.pause();
      }
    }
    if (!g.to) return;
    g.travel = Math.max(0, -dx * g.direction - 8);
    g.progress = Math.min(.999, g.travel / g.distance);
    if (g.track === galleryMotion && g.track) {
      for (const animation of g.track) animation.currentTime = 1000 * g.progress;
    }
  });
  reel.addEventListener("pointerup", e => {
    if (gesture?.id !== e.pointerId) return;
    const g = gesture;
    const flick = g.travel > 26 && g.travel / Math.max(1, e.timeStamp - g.start) > .45;
    release(g.progress > .38 || g.travel > 110 || flick);
  });
  reel.addEventListener("pointercancel", e => { if (gesture?.id === e.pointerId) release(false); });
  reel.addEventListener("lostpointercapture", e => {
    if (e.target === reel && gesture?.id === e.pointerId) release(false);
  });
  reel.addEventListener("pointerleave", () => { if (gesture && !gesture.dragging) gesture = null; });
  reel.addEventListener("click", e => {
    if (suppressClick && e.detail) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  reel.addEventListener("dragstart", e => e.preventDefault());
  reel.addEventListener("keydown", () => release(false), true);
  addEventListener("pagehide", () => release(false));
  motion.addEventListener("change", () => { if (gesture?.track) release(false); });
}

// Each disclosure has one reversible timeline. Keep native details semantics at
// rest; while closing, keep the content painted but take its link out of focus.
function setupProjectReveals() {
  if (!Element.prototype.animate) return;
  for (const entry of $$(".fi-entry")) {
    const summary = $("summary", entry), fold = $(".fi-fold", entry);
    const art = $(".fi-art", entry), landscape = $(".fi-scene", art);
    const emblem = $(".fi-emblem", art);
    const inflite = art.classList.contains("fi-inflite");
    const duration = 640;
    let tracks = null, expanded = entry.open;

    function settle() {
      if (!tracks) return;
      entry.open = expanded;
      for (const track of tracks) track.cancel();
      tracks = null;
      entry.classList.remove("project-moving");
      summary.removeAttribute("aria-expanded");
      fold.inert = false;
    }

    function compose() {
      const sequence = [];
      // Hold the end poses outside each part's interval so a reversal also
      // reverses the spacing between the cover, the typography and the link.
      function part(el, first, last, start = 0, end = 1, easing = "cubic-bezier(.25,.12,.25,1)") {
        const frames = [{...first, offset: start, easing}, {...last, offset: end}];
        if (start > 0) frames.unshift({...first, offset: 0});
        if (end < 1) frames.push({...last, offset: 1});
        const track = el.animate(frames, {duration, fill: "both"});
        track.pause();
        sequence.push(track);
      }
      part(fold, {gridTemplateRows: "0fr"}, {gridTemplateRows: "1fr"});
      part($(".fi-shutter-left", art), {transform: "none"}, {transform: "translateX(-47%)"}, 0, .82);
      part($(".fi-shutter-right", art), {transform: "none"}, {transform: "translateX(72%)"}, 0, .90);
      part(landscape, {transform: inflite ? "translateX(-2.5%) scale(1.07)" : "scale(1.11)"}, {transform: "none"});
      part(emblem, {opacity: 0, transform: inflite ? "translateY(8px) rotate(-16deg) scale(.85)" : "translateY(10px) scale(.94)"},
        {opacity: 1, transform: "none"}, .12, .84);
      part($(".fi-story p", entry), {opacity: 0, transform: "translateY(12px)"}, {opacity: 1, transform: "none"}, .16, .85);
      part($(".fi-project-cta", entry), {opacity: 0, transform: "translateY(7px)"}, {opacity: 1, transform: "none"}, .30, .96);
      part($(".fi-launch", art), {opacity: 0, transform: "translate(-4px,4px)"}, {opacity: 1, transform: "none"}, .32, .95);
      return sequence;
    }

    summary.addEventListener("click", event => {
      if (event.defaultPrevented || motion.matches) return;
      event.preventDefault();
      const reversing = Boolean(tracks);
      expanded = !(reversing ? expanded : entry.open);
      const time = reversing ? Number(tracks[0].currentTime) : expanded ? 0 : duration;
      if (!tracks) {
        entry.open = true;
        entry.classList.add("project-moving");
        tracks = compose();
      }
      summary.setAttribute("aria-expanded", String(expanded));
      if (!expanded && fold.contains(document.activeElement)) summary.focus({preventScroll: true});
      fold.inert = !expanded;
      if (expanded ? time >= duration : time <= 0) { settle(); return; }
      const clock = tracks[0];
      clock.onfinish = () => { if (tracks?.[0] === clock && clock.playState === "finished") settle(); };
      for (const track of tracks) {
        const rate = expanded ? 1 : -1.35;
        if (reversing) {
          // Preserve the compositor's current pose across direction changes.
          track.updatePlaybackRate(rate);
        } else {
          track.currentTime = time;
          track.playbackRate = rate;
        }
        if (track.playState !== "running") track.play();
      }
    });
    entry.addEventListener("toggle", () => {
      if (tracks && !entry.open) { expanded = false; settle(); }
    });
    motion.addEventListener("change", settle);
    addEventListener("pagehide", settle);
  }
}

function setupGalleryMenu() {
  const dock = $(".fi-menu"), toggle = $(".fi-menubtn"), links = $("nav",dock);
  dock.hidden = false;
  function set(open) {
    links.inert = !open;
    toggle.setAttribute("aria-expanded",String(open));
  }
  toggle.addEventListener("click",()=>set(links.inert));
  links.addEventListener("click",e=>{if(e.target.closest("a,[data-contact]"))set(false)});
  document.addEventListener("pointerdown",e=>{if(!dock.contains(e.target))set(false)});
  dock.addEventListener("focusout",e=>{if(!dock.contains(e.relatedTarget))set(false)});
  dock.addEventListener("keydown",e=>{if(e.key==="Escape"&&!links.inert){set(false);toggle.focus()}});
}

// The header and the opening share one vector drawing of the gfg mark.
// Move each letter as a layer so its outline is rasterised once.
function setupOpening() {
  const gallery = $(".fi-reel");
  const shouldPlay = root.classList.contains("photo-wait");
  root.classList.remove("photo-wait");
  const panels = $$(".fi-reel button:not([hidden])");
  if (!shouldPlay || !gallery.animate || motion.matches || panels.length !== 3) return;

  // Measure the finished gallery once, before creating any animation layers.
  const galleryRect = gallery.getBoundingClientRect();
  const panelRects = panels.map(panel => panel.getBoundingClientRect());
  const viewportWidth = innerWidth;
  const initialScroll = scrollY;
  const x = galleryRect.left + galleryRect.width / 2;
  const y = Math.min(innerHeight * .44, galleryRect.top + galleryRect.height * .65);
  const wordmark = $(".wordmark");
  const glyphs = $$("path", wordmark).map(path => ({path, bounds: path.getBBox()}));
  const mark = document.createElement("div");
  mark.setAttribute("aria-hidden", "true");
  mark.classList.add("opening-mark");
  Object.assign(mark.style, {left: (x - 40) + "px", top: (y - 26) + "px"});
  document.body.append(mark);
  body.classList.add("playing-opening");

  const listeners = new AbortController();
  const animations = [];
  const photoAnimations = [];
  let interrupted = false;
  let start = null;
  let warmupFrame;
  function animate(el, frames, timing) {
    const animation = el.animate(frames, {fill: "both", ...timing});
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  }

  function finish(cancelPhotos = true) {
    if (cancelPhotos) {
      interrupted = true;
      photoAnimations.forEach(animation => animation.cancel());
      for (const panel of panels) $("img", panel).classList.remove("opening-photo-pending");
    }
    cancelAnimationFrame(warmupFrame);
    listeners.abort();
    animations.forEach(animation => animation.cancel());
    mark.remove();
    body.classList.remove("playing-opening");
  }

  // Start the vertical reveal while the letter is still narrowing. All edges,
  // including the visible glyph, follow the same path through the turn.
  const delay = 120, duration = 1680;
  const sampleInterval = 35;
  const mix = (a, b, t) => a + (b - a) * t;
  function smootherstep(time, from, to) {
    const t = Math.max(0, Math.min(1, (time - from) / (to - from)));
    return t * t * t * (10 + t * (6 * t - 15));
  }
  // Prepare the path once. The compositor interpolates it at the display rate.
  const steps = Array.from({length: duration / sampleInterval + 1}, (_, i) => {
    const t = delay + i * sampleInterval;
    return {fold: smootherstep(t, delay, 705), widen: smootherstep(t, 440, delay + duration), lift: smootherstep(t, 280, 1740)};
  });
  const translate = (left, top) => `translate3d(${left}px, ${top}px, 0)`;
  panels.forEach((panel, i) => {
    const {path, bounds} = glyphs[i], rect = panelRects[i];
    const finalLeft = rect.left - (x - 40), finalTop = rect.top - (y - 26);
    const stemHeight = i === 1 ? 46 : 34;
    const poses = steps.map(({fold, widen, lift}) => {
      const foldedWidth = mix(bounds.width, 8, fold);
      const width = mix(foldedWidth, rect.width, widen);
      const height = mix(mix(bounds.height, stemHeight, fold), rect.height, lift);
      const left = mix(mix(bounds.x, 36 + (i - 1) * 12, fold), finalLeft, widen);
      const top = mix(mix(bounds.y, 26 - stemHeight / 2, fold), finalTop, lift);
      return {left, top, width, height, radius: foldedWidth / 2 * (1 - widen),
        cropX: rect.width - width, cropY: rect.height - height};
    });
    function follow(el, transform, until = delay + duration) {
      const count = 1 + Math.ceil((until - delay) / sampleInterval);
      const frames = poses.slice(0, count).map(pose => ({transform: transform(pose)}));
      animate(el, frames, {delay, duration: sampleInterval * (count - 1)});
    }

    const letter = document.createElement("span");
    letter.className = "opening-letter";
    Object.assign(letter.style, {width: bounds.width + "px", height: bounds.height + "px"});
    const glyph = wordmark.cloneNode(false);
    glyph.removeAttribute("class");
    glyph.setAttribute("viewBox", [bounds.x, bounds.y, bounds.width, bounds.height].join(" "));
    glyph.setAttribute("preserveAspectRatio", "none");
    glyph.append(path.cloneNode(true));
    letter.append(glyph);
    mark.append(letter);
    // Stop sizing the glyph after it has faded. Only the photo continues to grow.
    follow(letter, p => translate(p.left, p.top) + ` scale(${p.width / bounds.width}, ${p.height / bounds.height})`, 650);
    animate(glyph, [{opacity: 1}, {opacity: 0}], {delay: 410, duration: 240, easing: "ease-in-out"});

    // Opposite window edges move apart while the photograph keeps its proportions.
    follow(panel, p => translate(p.left - finalLeft - p.cropX, p.top - finalTop - p.cropY));
    follow($(".fi-window", panel), p => translate(p.cropX, p.cropY));
    animate(panel, [{opacity: 0}, {opacity: 1}], {delay: 390, duration: 235, easing: "ease-in-out"});

    for (const right of [false, true]) {
      for (const bottom of [false, true]) {
        const corner = document.createElement("span");
        corner.className = "opening-corner";
        mark.append(corner);
        follow(corner, p => {
          const position = translate(p.left + (right ? p.width : 0), p.top + (bottom ? p.height : 0));
          const scale = p.radius / 8;
          return position + ` scale(${right ? -scale : scale}, ${bottom ? -scale : scale})`;
        });
      }
    }

    const image = $("img", panel);
    follow(image, p => translate(-p.cropX / 2, -p.cropY / 2));
    image.classList.add("opening-photo-pending");
    const source = image.src;
    const reveal = () => {
      image.classList.remove("opening-photo-pending");
      if (interrupted || motion.matches || image.src !== source || !image.naturalWidth) return;
      const elapsed = start === null ? 0 : document.timeline.currentTime - start;
      const fade = image.animate([{opacity: 0}, {opacity: 1}], {
        delay: Math.max(0, 710 + i * 25 - elapsed), duration: 640, easing: "ease-in-out", fill: "backwards"
      });
      if (start === null) {
        fade.pause();
        fade.currentTime = 0;
      }
      photoAnimations.push(fade);
    };
    image.decode().then(reveal, () => image.classList.remove("opening-photo-pending"));
  });
  for (const el of $$("#bar,.fi-bio,.fi-work,footer")) {
    if (el.getBoundingClientRect().top >= innerHeight) continue;
    animate(el, [{opacity: 0}, {opacity: 1}], {delay: 1300, duration: 560, easing: "ease-in-out"});
  }
  const options = {signal: listeners.signal};
  document.addEventListener("pointerdown", finish, {...options, capture: true});
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" || event.key === "Tab") finish();
  }, options);
  // Mobile browser chrome can change the viewport height mid-opening while all
  // gallery bounds remain identical. Only a width change invalidates the masks.
  addEventListener("resize", () => { if (innerWidth !== viewportWidth) finish(); }, options);
  addEventListener("scroll", () => { if (Math.abs(scrollY - initialScroll) > 1) finish(); }, {...options, passive: true});
  addEventListener("pagehide", finish, options);
  motion.addEventListener("change", finish, options);
  // Present the still logo and prime the compositor before starting the clock.
  // A cold first paint then extends the initial hold rather than skipping part of the morph.
  warmupFrame = requestAnimationFrame(() => {
    warmupFrame = requestAnimationFrame(() => {
      start = document.timeline.currentTime;
      for (const animation of [...animations, ...photoAnimations]) {
        animation.play();
        animation.startTime = start;
      }
    });
  });
  Promise.all(animations.map(animation => animation.finished)).then(() => finish(false), () => {});
}

// (a photo fades in as it arrives, rather than appearing: styles.css .loaded)
function fadeOnLoad(img) {
  const on = () => img.classList.add("loaded");
  if (img.complete && img.naturalWidth) on(); else img.addEventListener("load", on, { once: true });
}

/* ---------------- who's looking ---------------- */
const plural = (n, one, many = one + "s") => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
async function loadMe() {
  try { me = await api("/api/me"); } catch (_) { me = { signedIn: false }; }
  showMe();
}
function showMe() {
  // (back from signing in, and signed in: your photo comes into its place from the picture the account's page ended on,
  // and your photo's place and Edit wait for it: arrive)
  const back = arrival && !arrival.gone && !arrival.av ? arrival : null, welcome = back && me.signedIn;
  if (welcome) { for (const el of [$("#me"), $("#edit")]) el.classList.add("held"); back.lines = true; }
  // (the account's page shows the way back here: #from=home)
  if (me.account) for (const a of $$("[data-account]")) a.href = `${me.account}/#from=home`;
  // (the apps' own addresses, as the server has them: inflite.ai's, or a test's)
  for (const [k, v] of Object.entries(me.links || {})) { const link = document.getElementById(`app-${k}`); if (link?.matches("[data-app-link]")) link.href = v; }
  $("#who").hidden = !me.signedIn;
  body.classList.toggle("signed", !!me.signedIn);
  body.classList.toggle("owner", !!me.owner);
  body.classList.add("known");
  // (from Admin on the account page: #edit, straight into changing the words)
  if (location.hash === "#edit") { history.replaceState(null, "", location.pathname + location.search); if (me.owner) startEdit(); }
  // (from the page for an address that isn't one, 404.html: #contact=<that address>, a message about it to send)
  if (location.hash.startsWith("#contact")) {
    let about = "", from = "";
    try { [about, from = ""] = location.hash.slice(9).split("|").map(decodeURIComponent); } catch (_) {}
    history.replaceState(null, "", location.pathname + location.search);
    if (about && !$("#c-message").value) $("#c-message").value = `A link to ${about} doesn’t go anywhere. ${from ? `It’s on ${from}` : "I found it on "}`;
    const openContact = () => {
      const trigger = $("footer [data-contact]");
      trigger.focus({ preventScroll: true });
      trigger.click();
    };
    if (root.classList.contains("intro-loading")) addEventListener("home:revealed", openContact, { once: true });
    else openContact();
  }
  const face = $("#face");
  face.textContent = "";
  if (me.signedIn && me.photoAt) {
    const img = document.createElement("img");
    img.src = `/api/me/photo?v=${me.photoAt}`; img.alt = "";
    fadeOnLoad(img);
    face.append(img);
  } else if (me.signedIn) {
    face.textContent = (me.name || "?").trim().charAt(0).toUpperCase();
  }
  $("#me").setAttribute("aria-label", me.signedIn ? `Your account (${me.name})` : "Your account");
  // (each app's line, theirs: once their photo's landed, if it's on its way)
  if (!welcome) showLines();
  // a message from them is from them: their name and email filled in, shown as one From row (only while the fields
  // still hold theirs: not over others put in for this message, when it's shown again back from the account's page)
  if (me.signedIn && me.name && me.email) {
    if (!$("#c-name").value) $("#c-name").value = me.name;
    if (!$("#c-email").value) $("#c-email").value = me.email;
  }
  fromMe();
  // (back, signed in: the photo on its way; back, but not signed in after all: the picture fades, the page as ever)
  if (welcome) arrive(back); else if (back) arriveEnd(back, true);
}
// (their own details, if those are what the fields hold: the From row, filled from them as they are now, its photo the
// bar's; filled each time it's shown, as it may last have been someone else's, or theirs before a change)
function fromMe() {
  if (!(me?.signedIn && me.name && me.email && $("#c-name").value === me.name && $("#c-email").value === me.email)) return;
  const face = $("#face");
  $("#from-name").textContent = me.name; $("#from-email").textContent = me.email;
  $("#from-face").replaceChildren(...[...face.childNodes].map((n) => n.cloneNode(true)));
  for (const img of $$("img", $("#from-face"))) fadeOnLoad(img);
  if (!face.childNodes.length) $("#from-face").textContent = face.textContent;
  $("#from").hidden = false; $("#sender").classList.add("known");
}
// each app's line: theirs when they use it, what it is otherwise
function showLines() {
  const a = me.signedIn ? me.apps || {} : {};
  const line = {
    inflight: a.inflight && `${plural(a.inflight.friends, "friend")} · ${a.inflight.sent.toLocaleString("en-GB")} sent`,
    weather: a.weather && `${plural(a.weather.places, "place")} · Alerts ${a.weather.alerts ? "on" : "off"}`,
    fitness: a.fitness && `${plural(a.fitness.activities, "activity", "activities")}${a.fitness.plan ? " · On a plan" : ""}`,
    markets: a.markets && `${plural(a.markets.holdings, "holding")}${a.markets.owned ? ` · ${a.markets.owned} you own` : ""}`,
  };
  for (const key of ["inflight", "weather", "fitness", "markets"]) {
    const small = $(`#app-${key} small`);
    fadeText(small, line[key] || small.dataset.about);
    small.classList.toggle("mine", !!line[key]);
  }
}

/* ---------------- signing in, on the account's page: the way there, and back ---------------- */
// The account's page is a sky of its own (styles.css --acct-sky) with your photo a third of the way down. Going there,
// that sky comes in over everything, so that page opens on what was already in sight (handOff); back from it
// signed in (#signedin, taken out of the address at once), the page opens on the picture it ended on (index.html, from
// the first frame), and your photo goes from there into its place in the bar (arrive). With Reduce Motion, dissolves.
// Neither is ever in the way of a tap, and the picture's gone within a few seconds, whatever happens.
// (the account page's own curve, for one screen growing into another; and its sky)
const ACCT_EASE = "cubic-bezier(0.55, 0, 0.1, 1)";
const acctSky = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "#0a0f26" : "#f3f0fb");
let handing = null;
// The account page's sky, coming in over everything; and off to url once it's in, or after 700 ms whatever happens.
// Opacity only
function handOff(url) {
  if (handing) return;
  const g = document.createElement("div");
  g.className = "handoff"; g.setAttribute("aria-hidden", "true"); g.innerHTML = `<i class="handoff-sky"></i>`;
  const undo = () => { g.remove(); if (handing?.g === g) handing = null; };
  let went = false;
  const go = () => {
    if (went) return;
    went = true; location.assign(url);
    // (still here a good while later, and in sight: the page as it was, should the account's page never come)
    setTimeout(() => { if (document.visibilityState === "visible") undo(); }, 10e3);
  };
  let sky;
  try {
    body.append(g);
    sky = g.firstChild.animate([{ opacity: 0 }, { opacity: 1 }], { duration: motion.matches ? 150 : 480, easing: EASE_OUT, fill: "forwards" }).finished;
  } catch (_) { undo(); location.assign(url); return; }
  handing = { g, undo };
  sky.then(go, go);
  setTimeout(go, 700);
}
// (back from the account's page by the browser's Back, the page as it was kept: as it was before it went, its words
// asked for again (they may have been changed meanwhile); and who's signed in asked again: the same, their figures
// brought up to date, and their photo and name if they've changed them there; someone else, or no one now (signed out
// there), the page opened afresh, rather than still showing the one before, their name and email in Get in touch)
const who = (m) => (m?.signedIn ? [m.email, !!m.owner].join("\n") : "");
addEventListener("pageshow", async (e) => {
  if (!e.persisted) return;
  handing?.undo();
  wordsDue = askWords();                            // (before anything else: Edit waits for them, whoever's here)
  if (!me) return;                                  // (still being asked: loadMe shows it)
  let now; try { now = await api("/api/me"); } catch (_) { return; }
  if (who(now) !== who(me)) {
    removeEventListener("beforeunload", guard);     // (edits that can't be saved now don't ask first)
    contact.form.reset();                           // (and the last one's name, email and message aren't kept into it)
    location.reload();
    return;
  }
  // (the same person, a message half written kept as it is: their name in it moved on with them, if it was theirs)
  const was = me;
  if ($("#c-name").value === was.name) $("#c-name").value = now.name;
  me = now;
  if (now.name !== was.name || now.photoAt !== was.photoAt) showMe(); else showLines();
});

// Back from the account's page signed in: its picture (index.html #signedin) taken on, with what's to happen to it.
// Gone within a few seconds whatever happens: sooner if who's signed in is slow to come (the page as ever meanwhile,
// showMe carrying on when it does)
let arrival = null;
if (/^#signedin(?![\w-])/.test(location.hash)) {
  arrival = arriveFrom();
  history.replaceState(null, "", location.pathname + location.search);
}
function arriveFrom() {
  const el = $("#signedin"); if (!el) return null;
  el.classList.add("held");
  const a = { el, av: null, end: null, lines: false, timers: new Set(), gone: false };
  a.slow = later(a, () => arriveEnd(a, true), 4000);
  later(a, () => arriveEnd(a, true), 6000);
  return a;
}
// (something to happen in a while, unless the picture's done with by then)
function later(a, fn, ms) { const t = setTimeout(() => { a.timers.delete(t); if (!a.gone) fn(); }, ms); a.timers.add(t); return t; }
// The picture done with, at once or fading: what's still to come stopped, and what was waiting for the photo (its place
// in the bar, Edit, each app's line) shown
function arriveEnd(a, fade = false) {
  if (!a || a.gone) return;
  a.gone = true;
  for (const t of a.timers) clearTimeout(t);
  if (arrival === a) arrival = null;
  for (const el of [$("#me"), $("#edit")]) el.classList.remove("held");
  if (a.lines) showLines();
  for (const x of [a.el, a.av]) {
    if (!x?.isConnected) continue;
    if (!fade) { x.remove(); continue; }
    x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: 250, easing: EASE_OUT, fill: "forwards" }).finished.then(() => x.remove(), () => x.remove());
    setTimeout(() => x.remove(), 400);     // (should that not end: in a tab put away)
  }
}
// Signed in: your photo (or your initial) comes into the picture
function arrive(a) {
  clearTimeout(a.slow); a.timers.delete(a.slow);
  const still = motion.matches, av = a.av = document.createElement("span"), tint = document.createElement("span");
  av.className = "back-in-av"; av.setAttribute("aria-hidden", "true"); tint.className = "back-in-face";
  av.append(tint, (me.name || "?").trim().charAt(0).toUpperCase());
  // (there since the first frame, as the account's page left you: signedin.js; taken on where it is, not brought in again)
  const there = document.documentElement.classList.contains("back-face");
  const img = window.backPhoto ? Object.assign(document.createElement("img"), { src: window.backPhoto, alt: "", className: "loaded" })
    : me.photoAt ? Object.assign(document.createElement("img"), { src: `/api/me/photo?v=${me.photoAt}`, alt: "" }) : null;
  if (img) av.append(img);
  // (the photo in before it's shown, if it's there in a moment; if not, the initial, the photo fading in over it as it comes)
  const ready = img && !there ? Promise.race([img.decode().catch(() => {}), new Promise((ok) => setTimeout(ok, 500))]) : Promise.resolve();
  ready.then(() => {
    if (a.gone) return;
    if (img && !img.classList.contains("loaded")) fadeOnLoad(img);
    body.append(av);
    if (there) document.documentElement.classList.remove("back-face");
    else av.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1 }], { duration: still ? 150 : 450, easing: still ? EASE_OUT : spring() });
    later(a, () => reveal(a), there ? 120 : still ? 250 : 420);
  });
}
// The picture fades, the page under it; your photo comes down into its place on a gentle curve (bowed up a little, as if tossed there rather than slid), becoming the bar's as it
// goes. With Reduce Motion, the photo fades with the picture, and the bar's comes in where it is
function reveal(a) {
  const still = motion.matches, el = a.el, av = a.av, to = $("#me").getBoundingClientRect();
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 200 : 400, easing: EASE_OUT, fill: "forwards" }).finished.then(() => el.remove(), () => el.remove());
  if (still || !to.width || !av?.isConnected) {
    av?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT, fill: "forwards" });
    later(a, () => land(a), 200);
    return;
  }
  // the photo, down into it, ending a touch small for the spring it lands with (pop-in, from 0.9)
  const from = av.getBoundingClientRect(), s1 = (to.width / from.width) * 0.9;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const len = Math.hypot(dx, dy) || 1, bow = Math.min(80, len * 0.25);
  let nx = -dy / len, ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const cx = dx / 2 + nx * bow, cy = dy / 2 + ny * bow, N = 12;
  const path = Array.from({ length: N + 1 }, (_, i) => {
    const u = i / N, v = 1 - u;
    return { offset: u, transform: `translate(${(2 * v * u * cx + u * u * dx).toFixed(2)}px, ${(2 * v * u * cy + u * u * dy).toFixed(2)}px) scale(${(1 + (s1 - 1) * u).toFixed(4)})` };
  });
  a.end = { dx, dy, s1, s: to.width / from.width };
  const t = { duration: 620, easing: ACCT_EASE, fill: "forwards" };
  const flight = av.animate(path, t);
  $(".back-in-face", av)?.animate([{ opacity: 0 }, { opacity: 1 }], t);
  av.animate([{ boxShadow: getComputedStyle(av).boxShadow }, { boxShadow: getComputedStyle($("#face")).boxShadow }], t);
  flight.finished.then(() => land(a), () => {});
}
// Landed: your photo's place in the bar comes in with its little spring (styles.css pop-in) under the one that flew
// there, which keeps pace with it and then goes; then Edit beside it, for the owner, and each app's line, yours now.
// With Reduce Motion, each fades in where it is
function land(a) {
  if (a.gone) return;
  const still = motion.matches, av = a.av, e = a.end;
  $("#me").classList.remove("held");
  if (still) $("#me").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE_OUT });
  if (av && e) {
    a.av = null;
    const at = (s) => `translate(${e.dx.toFixed(2)}px, ${e.dy.toFixed(2)}px) scale(${s.toFixed(4)})`;
    av.animate([{ transform: at(e.s1) }, { transform: at(e.s) }], { duration: 350, easing: spring(), fill: "forwards" }).finished.then(() => av.remove(), () => av.remove());
    setTimeout(() => av.remove(), 600);
  }
  later(a, () => { $("#edit").classList.remove("held"); if (still) $("#edit").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: EASE_OUT }); }, still ? 0 : 120);
  later(a, () => arriveEnd(a), still ? 0 : 240);
}

// An app's real icon comes forward as the source page recedes. Preserve the exact account-aware URL and native
// modified/new-tab clicks. Navigation has a short safety deadline; Back restores the original page immediately.
let appDeparture = null;
const warmOrigins = new Set();
function warmApp(link) {
  if (!link || navigator.connection?.saveData) return;
  const origin = new URL(link.href).origin;
  if (warmOrigins.has(origin)) return;
  warmOrigins.add(origin);
  const hint = document.createElement("link"); hint.rel = "preconnect"; hint.href = origin; document.head.append(hint);
}
for (const type of ["pointerover", "focusin", "pointerdown"]) document.addEventListener(type, e => warmApp(e.target.closest("a[data-app-link]")), { passive: true });
function openApp(link) {
  if (appDeparture) return;
  const image = $(".project-logo", link);
  if (motion.matches || !image?.complete || !image.naturalWidth) { location.assign(link.href); return; }
  const bounds = image.getBoundingClientRect(), overlay = document.createElement("div");
  if (bounds.width < 1) { location.assign(link.href); return; }
  overlay.className = "app-handoff"; overlay.setAttribute("aria-hidden", "true");
  const sky = document.createElement("div"), icon = image.cloneNode();
  sky.className = "app-handoff-sky"; icon.className = "app-handoff-icon";
  icon.removeAttribute("id"); icon.alt = ""; icon.src = image.currentSrc || image.src;
  Object.assign(icon.style, { width: `${bounds.width}px`, height: `${bounds.height}px`, left: "0", top: "0" });
  const opacity = image.style.opacity;
  image.style.opacity = "0";
  overlay.append(sky, icon); body.append(overlay); body.classList.add("leaving");
  const state = appDeparture = { animations: [], deadline: null, recovery: null };
  const undo = state.undo = () => {
    clearTimeout(state.deadline); clearTimeout(state.recovery); state.animations.forEach(a => a.cancel()); overlay.remove();
    image.style.opacity = opacity; body.classList.remove("leaving"); if (appDeparture === state) appDeparture = null;
  };
  let went = false;
  const go = () => { if (went || appDeparture !== state) return; went = true; location.assign(link.href); state.recovery = setTimeout(undo, 4000); };
  state.go = go;
  state.deadline = setTimeout(go, MOTION.enter + MOTION.fast);
  try {
    const scale = 88 / bounds.width;
    state.animations = [
      sky.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.layout, easing: EASE_OUT, fill: "forwards" }),
      icon.animate([
        { transform: `translate3d(${bounds.left}px,${bounds.top}px,0) scale(1)` },
        { transform: `translate3d(${(innerWidth - 88) / 2}px,${Math.max(40, (innerHeight - 88) / 2 - 30)}px,0) scale(${scale})` }
      ], { duration: MOTION.enter, easing: GLIDE, fill: "forwards" })
    ];
    state.animations[1].finished.then(go, go);
  } catch (_) { undo(); location.assign(link.href); }
}
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[data-app-link], [data-account]");
  if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  if (link.matches("a[data-app-link]") && !editing) { e.preventDefault(); openApp(link); return; }
  body.classList.add("leaving");
  setTimeout(() => body.classList.remove("leaving"), 4000);    // (in case it never goes)
});
addEventListener("pageshow", () => { appDeparture?.undo(); body.classList.remove("leaving"); });
addEventListener("pagehide", () => appDeparture?.undo());
motion.addEventListener("change", () => { if (motion.matches) { const state = appDeparture; state?.go(); state?.undo(); } });

/* ---------------- sheets ---------------- */
// A sheet glides up and the page steps back behind it (styles.css: --ease-glide). Dragged down by its top it follows the
// finger, the page coming forward with it; let go, it springs back, or carries on down at the speed it was thrown. Closed
// while it's still coming up, or opened again while it's going, it carries on from where it is rather than jumping.
let lastFocus = null;
const spring = () => getComputedStyle(root).getPropertyValue("--ease-spring").trim() || "cubic-bezier(0.2, 1.1, 0.4, 1)";
const behind = [$("#page"), $("#bar")];
// (where it is now, mid-way through any of that)
const currentY = (el) => { const t = getComputedStyle(el).transform; return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0; };
function openSheet(d, launcher = document.activeElement) {
  const contactSheet = d.id === "contact-sheet";
  let caughtThrow;
  if (!d.open) {
    lastFocus = launcher?.closest("#fi-floating-links") ? $(".fi-menubtn") : launcher;
    d.classList.remove("closing", "shown");
    d.showModal();
  } else if (d.classList.contains("closing")) {
    clearTimeout(d._done);
    if (!contactSheet || d._throw) {
      const y = currentY(d);
      d.getAnimations().forEach(a => a.cancel()); d._throw = null;
      d.style.transform = "";
      if (contactSheet) caughtThrow = y;
      else if (!motion.matches && y) d.animate([{ transform: `translateY(${y}px)` }, { transform: "none" }], { duration: MOTION.enter, easing: GLIDE });
    }
    d.classList.remove("closing"); d.classList.add("shown");
  }
  pin();
  $(".sheet-in", d).focus({ preventScroll: true });
  body.classList.add("sheet-up");
  if (contactSheet) {
    d.style.bottom = ""; d.style.maxHeight = "";
    d.classList.add("shown");
    return presentContact(d, true, caughtThrow);
  }
}

// The dialog and everything printed on it share one compositor animation. A
// second tap can reverse that same timeline without measuring the form again.
function presentContact(d, opening, caughtThrow) {
  let animation = d._presentation;
  if (!animation) {
    const duration = motion.matches ? 110 : phone.matches ? 320 : 250;
    const offset = caughtThrow ?? (phone.matches ? 48 : 16);
    // The handle can still be springing back when Close is pressed.
    const restingY = !opening && d._rebound ? currentY(d) : 0;
    d._rebound?.cancel(); d._rebound = null;
    const frames = motion.matches ? [{ opacity: 0 }, { opacity: 1 }] : [
      { opacity: caughtThrow == null ? 0 : 1, transform: `translate3d(0, ${offset}px, 0)` },
      { opacity: 1, transform: `translate3d(0, ${restingY}px, 0)` }
    ];
    animation = d._presentation = d.animate(frames, {
      duration, easing: motion.matches ? "linear" : "cubic-bezier(.28,.12,.22,1)", fill: "both"
    });
    animation.currentTime = opening ? 0 : duration;
  } else if (!opening && animation.currentTime <= 0) {
    finishClose(d);
    return;
  }
  animation.playbackRate = opening ? 1 : -1.25;
  animation.onfinish = () => {
    if (d._presentation !== animation) return;
    if (d.classList.contains("closing")) finishClose(d);
    else clearPresentation(d);
  };
  animation.play();
  return animation;
}
function clearPresentation(d) {
  const animation = d._presentation;
  if (!animation) return;
  animation.onfinish = null;
  d._presentation = null;
  animation.cancel();
}
function settlePresentation() {
  const d = $("#contact-sheet");
  if (d.classList.contains("closing")) finishClose(d);
  else clearPresentation(d);
}
addEventListener("pagehide", settlePresentation);
motion.addEventListener("change", () => { if (motion.matches) settlePresentation(); });
// The page held still behind a sheet, pinned where it's scrolled to (an iPhone draws the caret of a field in a sheet as
// far out as the page behind is scrolled, once the keyboard's up); what moves with the scroll held as it looks, as
// pinned there's no scroll for it to follow, and let go with it

function pin() {
  if (pinned !== null) return;
  pinned = scrollY;
  Object.assign(body.style, { position: "fixed", top: `${-pinned}px`, left: "0", right: "0" });
}
function unpin() {
  if (pinned === null) return;
  const y = pinned;
  Object.assign(body.style, { position: "", top: "", left: "", right: "" });
  scrollTo({ top: y, behavior: "instant" });
  pinned = null;

}
function finishClose(d) {
  clearTimeout(d._done); d._throw?.cancel(); d._throw = null;
  clearPresentation(d);
  d._rebound?.cancel(); d._rebound = null;
  d.style.bottom = ""; d.style.maxHeight = "";
  if (d.id === "contact-sheet") stopSenderMorph();
  d._resize?.forEach(a => a.cancel()); d._resize = [];
  d.classList.remove("closing", "dragging", "shown");
  d.style.transform = ""; d.style.removeProperty("--from");
  if (d.open) d.close();
}
function closeSheet(d, thrown = null) {
  if (!d.open || d.classList.contains("closing")) return;
  const contactSheet = d.id === "contact-sheet";
  if (contactSheet && phone.matches && parseFloat(root.style.getPropertyValue("--kb")) > 0) {
    // Keep the closing sheet in place while iOS dismisses the keyboard behind it.
    const style = getComputedStyle(d);
    d.style.bottom = style.bottom; d.style.maxHeight = style.maxHeight;
  }
  if (d.contains(document.activeElement) && document.activeElement.matches("input, textarea")) document.activeElement.blur();
  if (contactSheet) contact.version++;
  body.classList.remove("sheet-up", "pulling");
  if (!contactSheet) unpin();
  for (const el of behind) el.style.transform = "";
  if (contactSheet && (!thrown || motion.matches)) {
    d.classList.add("closing");
    presentContact(d, false);
    return;
  }
  if (!thrown || motion.matches) {
    // (down from wherever it is: closed while it's still coming up, from there; done when its animation ends)
    d.style.setProperty("--from", `${currentY(d)}px`);
    d.getAnimations().forEach((a) => a.cancel());
    d.style.transform = "";
    d.classList.add("closing");
    d._done = setTimeout(() => finishClose(d), 800);    // (if that never comes: in a tab out of sight, say)
    return;
  }
  d.classList.add("closing");
  // (thrown: on down from where it is, at the speed it was going, never slower than a short slide)
  const rest = d.offsetHeight + 24 - thrown.dy, ms = Math.max(160, Math.min(320, rest / Math.max(thrown.v, 1.4)));
  const a = d._throw = d.animate([{ transform: `translateY(${thrown.dy}px)` }, { transform: `translateY(${d.offsetHeight + 24}px)` }], { duration: ms, easing: "cubic-bezier(0.25, 0.6, 0.4, 1)", fill: "forwards" });
  a.finished.then(() => { if (d._throw !== a) return; d.getAnimations().forEach((x) => x.cancel()); finishClose(d); }).catch(() => {});
}
// A sheet whose contents change (something said, the message giving way to Sent, a photo added): it moves to its new
// height rather than jumping there, and what's new fades in. Changed again on the way, it goes on from where it's got to.
function resizeContact(d, previous, previousTextTop, moveText = true, duration = MOTION.layout) {
  d._resize?.forEach(a => a.cancel()); d._resize = [];
  if (motion.matches || !d.open || d.classList.contains("closing")) return;
  const box = $(".sheet-in", d), next = d.getBoundingClientRect();
  if (Math.abs(previous.height - next.height) > 1 || Math.abs(previous.top - next.top) > 1) {
    const dy = previous.top - next.top, scale = previous.height / next.height;
    d._resize.push(d._surface.animate([
      { transform: `translateY(${dy}px) scaleY(${scale})` }, { transform: "none" }
    ], { duration, easing: EASE_OUT }));
    if (moveText) d._resize.push(box.animate([
      { transform: `translateY(${previousTextTop - box.getBoundingClientRect().top}px)` }, { transform: "none" }
    ], { duration, easing: EASE_OUT }));
  }
}
function settle(d, change, inEl) {
  const box = $(".sheet-in", d), h0 = box.getBoundingClientRect().height;
  if (d._surface) {
    const previous = d._surface.getBoundingClientRect(), previousTextTop = box.getBoundingClientRect().top;
    change(); resizeContact(d, previous, previousTextTop, inEl?.id !== "contact-sent");
    if (!motion.matches && d.open && inEl) d._resize.push(inEl.animate([
      { opacity: 0, translate: "0 6px" }, { opacity: 1, translate: "0 0" }
    ], { duration: MOTION.layout, delay: MOTION.stagger, easing: EASE_OUT, fill: "backwards" }));
    return;
  }
  for (const a of box.getAnimations()) a.cancel();
  change();
  if (motion.matches || !d.open) return;
  const h1 = box.getBoundingClientRect().height;
  if (Math.abs(h1 - h0) > 1) box.animate([{ height: `${h0}px`, overflow: "hidden" }, { height: `${h1}px`, overflow: "hidden" }], { duration: 350, easing: EASE_OUT });
  inEl?.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: 60, fill: "backwards", easing: EASE_OUT });
}
for (const d of $$("dialog.sheet")) {
  // (up: from then on it can be dragged; closing: put away once it's down)
  d.addEventListener("animationend", (e) => {
    if (d.id === "contact-sheet" || e.target !== d || e.pseudoElement) return;
    if (d.classList.contains("closing")) { if (!d._throw) finishClose(d); }
    else d.classList.add("shown");
  });
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => {
    if (d.open) return;
    clearPresentation(d); body.classList.remove("sheet-up"); unpin(); lastFocus?.focus?.({ preventScroll: true });
  });
  // (a tap on the dimmed page closes it: the sheet's own padding is inside .sheet-in, so only the backdrop is the dialog
  // itself; and only a tap that began there, not a press that began in the sheet, choosing words, and let go outside it)
  let downOnDim = false;
  d.addEventListener("pointerdown", (e) => { downOnDim = e.target === d; });
  d.addEventListener("click", (e) => { if (e.target === d && downOnDim) closeSheet(d); });
  for (const x of $$("[data-close]", d)) x.addEventListener("click", () => closeSheet(d));
  // the page behind doesn't scroll while a sheet's up: only what scrolls inside the sheet does
  let free = false;
  d.addEventListener("touchstart", (e) => { free = e.touches.length > 1 || scrollsIn(e.target, d); }, { passive: true });
  d.addEventListener("touchmove", (e) => { if (!free && e.cancelable) e.preventDefault(); }, { passive: false });
  d.addEventListener("wheel", (e) => { if (!scrollsIn(e.target, d) && e.cancelable) e.preventDefault(); }, { passive: false });
  // dragged down by its top
  let y0 = null, dy = 0, v = 0, lastY = 0, lastT = 0;
  d.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".grab, .sheet-head") || e.target.closest("button, input, a") || d.classList.contains("closing")) return;
    // (caught on its way up: held where it is, and the page behind where that's got to, rather than either jumping)
    const y = Math.max(0, currentY(d)), opacity = getComputedStyle(d).opacity;
    clearPresentation(d);
    if (d.id !== "contact-sheet") for (const el of behind) el.style.transform = getComputedStyle(el).transform;
    d.getAnimations().forEach((a) => a.cancel());
    if (opacity < 1) d.animate([{ opacity }, { opacity: 1 }], { duration: 110 });
    d.classList.add("shown");
    d.style.transform = `translateY(${y}px)`;
    y0 = e.clientY - y; dy = y; lastY = e.clientY; lastT = e.timeStamp; v = 0;
    d.setPointerCapture(e.pointerId); d.classList.add("dragging"); body.classList.add("pulling");
  });
  d.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    // (upwards it gives a little and no more, as a sheet does)
    const raw = e.clientY - y0;
    dy = raw >= 0 ? raw : -Math.sqrt(-raw) * 2;
    const dt = Math.max(1, e.timeStamp - lastT);
    v = 0.7 * ((e.clientY - lastY) / dt) + 0.3 * v; lastY = e.clientY; lastT = e.timeStamp;
    d.style.transform = `translateY(${dy}px)`;
    // the page comes forward as the sheet goes down
    if (d.id === "contact-sheet") return;
    const p = clamp(dy / d.offsetHeight);
    for (const el of behind) el.style.transform = `scale(${0.94 + 0.06 * p}) translateY(${14 * (1 - p)}px)`;
  });
  const end = (e) => {
    if (y0 === null) return;
    y0 = null; d.classList.remove("dragging");
    if (e && e.timeStamp - lastT > 80) v = 0;    // (held still before letting go: not thrown)
    if (dy > 110 || (v > 0.5 && dy > 24)) return closeSheet(d, { dy, v });
    // (back up, with a spring; the page back behind it)
    body.classList.remove("pulling");
    for (const el of behind) el.style.transform = "";
    d.style.transform = "";
    if (dy && !motion.matches) {
      const frames = Array.from({ length: 37 }, (_, i) => ({ transform: `translateY(${i === 36 ? 0 : springValue(dy, 0, v * 1000, MOTION.enter * i / 36000)[0]}px)`, offset: i / 36 }));
      const rebound = d._rebound = d.animate(frames, { duration: MOTION.enter, easing: "linear" });
      rebound.onfinish = () => { if (d._rebound === rebound) d._rebound = null; };
    }
  };
  d.addEventListener("pointerup", end);
  d.addEventListener("pointercancel", end);
}
// A keyboard already animates the visual viewport. Follow those frames directly rather than restarting a CSS ease
// behind every resize event. Poll only briefly around focus/viewport changes for iOS's occasionally missing events.
if (window.visualViewport) {
  const vv = window.visualViewport;
  let kb = 0, moved = null, frame = 0, until = 0, lastHeight = vv.height, lastTop = vv.offsetTop;
  const keepVisible = () => {
    const el = document.activeElement;
    if (!typingInSheet()) return;
    const box = el.closest(".sheet-in");
    if (!box) return;
    const bounds = box.getBoundingClientRect(), field = el.getBoundingClientRect();
    const top = bounds.top + 12, bottom = bounds.bottom - 12;
    const height = Math.min(field.height, Math.max(40, bottom - top));
    const delta = field.top < top ? field.top - top : field.top + height > bottom ? field.top + height - bottom : 0;
    if (Math.abs(delta) > 1) box.scrollTop += delta;
  };
  const lift = now => {
    frame = 0;
    // Pinching the page is not opening a keyboard. Leave its layout alone until the viewport returns to 1:1.
    if (Math.abs(vv.scale - 1) > .01) { until = 0; root.classList.remove("viewport-moving"); return; }
    const open = $("dialog.sheet[open]"), height = vv.height, top = vv.offsetTop;
    const viewportChanged = height !== lastHeight || top !== lastTop;
    lastHeight = height; lastTop = top;
    const inset = Math.max(0, Math.round(innerHeight - height - top));
    const k = open && (kb > 0 || (typingInSheet() && inset > 80)) ? inset : 0;
    if (k !== kb || (open && viewportChanged && typingInSheet())) {
      root.classList.add("viewport-moving");
      kb = k; root.style.setProperty("--kb", k + "px");
      clearTimeout(moved); moved = setTimeout(() => { root.classList.remove("viewport-moving"); keepVisible(); recaret(); }, 120);
    }
    if (open && now < until) frame = requestAnimationFrame(lift);
  };
  const queue = (ms = 240) => {
    until = Math.max(until, performance.now() + ms);
    if (!frame) frame = requestAnimationFrame(lift);
  };
  vv.addEventListener("resize", () => queue()); vv.addEventListener("scroll", () => queue());
  addEventListener("resize", () => queue(700));
  addEventListener("pageshow", () => queue(700));
  document.addEventListener("focusin", () => { if (typingInSheet()) queue(700); });
  document.addEventListener("input", () => { if (typingInSheet()) queue(); });
  document.addEventListener("focusout", () => { if (kb || $("dialog.sheet[open]")) queue(700); });
  for (const d of $$("dialog.sheet")) d.addEventListener("close", () => queue(0));
  addEventListener("pagehide", () => { cancelAnimationFrame(frame); frame = 0; until = 0; clearTimeout(moved); root.classList.remove("viewport-moving"); });
  window.relift = () => queue();
}
function typingInSheet() {
  const el = document.activeElement;
  return !!el?.matches?.("input, textarea") && !!el.closest("dialog.sheet[open]");
}
// An iPhone draws its caret where the field was until the selection changes, even when the field's moved (a sheet
// lifted, or changed size): so the caret's moved for a frame and put back (moved and put back at once, it's no change
// to the phone)
function recaret() {
  const el = document.activeElement;
  if (!typingInSheet() || !el.setSelectionRange) return;
  let a, b, dir;
  try { a = el.selectionStart; b = el.selectionEnd; dir = el.selectionDirection; } catch (_) { return; }   // (an email field has none)
  if (a == null) return;
  const away = a !== b ? a : a > 0 ? a - 1 : a + 1;
  el.setSelectionRange(away, away);
  requestAnimationFrame(() => { if (document.activeElement === el) el.setSelectionRange(a, b, dir); });
}
// (whether what's under a finger, inside a sheet, would scroll itself: a list longer than it is, or a field)
function scrollsIn(el, top) {
  if (el.closest?.("input, textarea, [contenteditable]")) return true;
  for (; el && el !== top; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return true;
  }
  return false;
}
// A button busy with something: what it says changes smoothly, with a ring turning beside it while it's on its way
function busyLabel(b, t, busy) {
  b.disabled = busy; b.classList.toggle("busy", busy);
  b.setAttribute("aria-busy", String(busy));
  fadeText($(".lbl", b), t);
  if (b.id === "contact-send") {
    let activity = $(".send-activity", b);
    if (busy && !activity) {
      activity = document.createElement("span"); activity.className = "send-activity"; activity.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 3; i++) activity.append(document.createElement("i"));
      b.prepend(activity);
      if (!motion.matches) activity.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE_OUT });
    } else if (!busy) { activity?.remove(); b.classList.remove("confirmed"); }
    return;
  }
  let s = $(".spin", b);
  if (busy && !s) {
    s = document.createElement("span"); s.className = "spin"; s.setAttribute("aria-hidden", "true");
    b.prepend(s);
    if (!motion.matches) s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: EASE_OUT });
  } else if (!busy && s) s.remove();
}

/* ---------------- a word at the foot, with Undo where it can be ---------------- */
// It rises in and sinks away (styles.css); a new word while it's up changes what it says in place, and it waits while a
// pointer's over it or it has the focus, so it's not gone from under a reach for Undo
let toastTimer = null, toastLeft = 0, toastAt = 0;
function toast(text, undo) {
  const t = $("#toast"), b = $("#toast-undo"), tx = $("#toast-text");
  const up = !t.hidden && !t.classList.contains("out");
  if (up) fadeText(tx, text); else tx.textContent = text;
  // (read out from a place that's always there, unseen: the toast itself, only just shown with it in, often isn't; and
  // only if it's there, as a page sent before it was can be running this script)
  const say = $("#toast-say");
  if (say) say.textContent = text;
  b.hidden = !undo;
  b.onclick = undo ? () => { toast("Undoing…"); undo(); } : null;
  if (!up) { t.classList.remove("out"); t.hidden = false; }
  toastLeft = undo ? 6000 : 2600;
  armToast();
}
function armToast() { clearTimeout(toastTimer); toastAt = Date.now(); toastTimer = setTimeout(hideToast, toastLeft); }
function hideToast() {
  const t = $("#toast");
  clearTimeout(toastTimer);
  if (t.hidden || t.classList.contains("out")) return;
  // (what it said emptied as it goes, so the same words next time are a change, and read out again)
  const say = $("#toast-say");
  if (say) say.textContent = "";
  t.classList.add("out");
  setTimeout(() => { if (t.classList.contains("out")) { t.hidden = true; t.classList.remove("out"); } }, 500);    // (should its animation not end)
}
{
  const t = $("#toast");
  t.addEventListener("animationend", (e) => { if (e.target === t && t.classList.contains("out")) { t.hidden = true; t.classList.remove("out"); } });
  const pause = () => { clearTimeout(toastTimer); toastLeft = Math.max(1200, toastLeft - (Date.now() - toastAt)); };
  t.addEventListener("pointerenter", pause); t.addEventListener("focusin", pause);
  t.addEventListener("pointerleave", () => { if (!t.contains(document.activeElement)) armToast(); });
  t.addEventListener("focusout", (e) => { if (!t.contains(e.relatedTarget)) armToast(); });
}

/* ---------------- Get in touch ---------------- */
const contact = { sheet: $("#contact-sheet"), form: $("#contact-form"), sent: $("#contact-sent"), err: $("#contact-err"), send: $("#contact-send"), version: 0 };
contact.sheet._surface = document.createElement("div");
contact.sheet._surface.className = "sheet-surface"; contact.sheet._surface.setAttribute("aria-hidden", "true");
contact.sheet.prepend(contact.sheet._surface); contact.sheet.classList.add("surface-sheet");
contact.sheet.addEventListener("close", () => { if (!contact.sheet.open) { contact.version++; stopSenderMorph(); } });
for (const b of $$("[data-contact]")) b.addEventListener("click", () => {
  contact.version++;
  contact.form.hidden = false; contact.sent.hidden = true; contact.err.hidden = true;
  // (their own details, if those are still what the fields hold: that row again, rather than the two fields)
  fromMe();
  ready();
  const presentation = openSheet(contact.sheet, b);
  grow(); fit();
  const empty = ["#c-name", "#c-email", "#c-message"].map((s) => $(s)).find((el) => !el.value);
  // (on a phone the keyboard would cover the sheet as it opens: there, a tap on a field brings it up)
  if (!phone.matches) {
    const focus = () => {
      if (contact.sheet.open && !contact.sheet.classList.contains("closing") && document.activeElement === $(".sheet-in", contact.sheet)) (empty || $("#c-message")).focus({ preventScroll: true });
    };
    presentation.finished.then(focus, () => {});
  }
});
// (their own details changed for this message: the two rows instead)
$("#from-change").addEventListener("click", () => {
  morphFrom(false);
  $("#c-name").focus({ preventScroll: true });
});
// Someone not signed in, name and email given, starting on the message: the two rows fold into the one From row, as
// they'd be signed in. The words they typed glide to where they sit in the row, the labels fade as they go, their
// initial comes in beside them and the box closes up around it (Change unfolds it again, the same way back).
// (an email as the server takes one, functions/_pigeon.js EMAIL_RE, kept the same by a unit test: one it would refuse
// isn't folded away, and is said at Send, at the field)
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{0,61}[A-Za-z0-9]$/;
const fold = () => {
  const name = $("#c-name").value.trim(), email = $("#c-email").value.trim();
  if ($("#sender").classList.contains("known") || !name || !EMAIL.test(email)) return;
  $("#from-name").textContent = name; $("#from-email").textContent = email;
  // (theirs, signed in, if these are still their details; otherwise their initial)
  const mine = me?.signedIn && name === me.name && email === me.email, face = $("#face");
  if (mine && face.childNodes.length) $("#from-face").replaceChildren(...[...face.childNodes].map((n) => n.cloneNode(true)));
  else $("#from-face").textContent = name[0].toUpperCase();
  morphFrom(true);
};
$("#c-message").addEventListener("input", fold);
$("#c-message").addEventListener("blur", () => { if (document.activeElement !== standIn) caretShown(); });
$("#c-message").addEventListener("focus", () => { if ($("#c-message").value.trim()) fold(); });
// (once the sheet's changed size under a field that's being typed in: the caret drawn again where it is)
function steady() { refocus(); window.relift?.(); }
// (an iPhone keeps a caret where it was in the sheet, even moved, when what's above it in the sheet changes size, and
// even when the selection's moved: it only works it out afresh as the field takes the focus. So the focus goes for a
// frame to a stand-in where the field is, and comes back, the caret where it was; with a field focused all the while,
// the keyboard stays up)
let standIn = null;
// (and while the sheet's changing shape under it, the caret's hidden, so it isn't seen drawn out of place and put back)
const caretHidden = () => { $("#c-message").style.caretColor = "transparent"; };
const caretShown = () => { $("#c-message").style.caretColor = ""; };
function refocus() {
  const el = document.activeElement;
  if (!typingInSheet() || el.tagName !== "TEXTAREA") { caretShown(); return recaret(); }
  const a = el.selectionStart, b = el.selectionEnd, dir = el.selectionDirection, r = el.getBoundingClientRect();
  if (!standIn) {
    standIn = document.createElement("textarea");
    standIn.tabIndex = -1; standIn.setAttribute("aria-hidden", "true");
    Object.assign(standIn.style, { position: "fixed", width: "1px", height: "1px", padding: "0", border: "0", opacity: "0", pointerEvents: "none", fontSize: "17px", resize: "none" });
  }
  Object.assign(standIn.style, { top: `${r.top + 14}px`, left: `${r.left + 16}px` });
  el.closest("dialog").append(standIn);
  standIn.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    if (document.activeElement === standIn) {
      el.focus({ preventScroll: true }); el.setSelectionRange(a, b, dir);
      // (anything typed in that frame, put where it was meant to go)
      if (standIn.value) { el.setRangeText(standIn.value, a, b, "end"); el.dispatchEvent(new Event("input", { bubbles: true })); }
    }
    standIn.value = ""; standIn.remove();
    caretShown();
  });
}
let senderMorph = null;
addEventListener("pagehide", () => stopSenderMorph());
function stopSenderMorph() {
  if (!senderMorph) return;
  const state = senderMorph; senderMorph = null;
  contact.sheet.classList.remove("sender-compacting");
  state.animations.forEach(a => a.cancel());
  state.words.forEach(w => w.ghost.remove());
  state.restore.reverse().forEach(restore => restore());
  for (const row of $$("label.fld", $("#sender"))) row.classList.remove("ghost");
  $("#from").hidden = !$("#sender").classList.contains("known");
  caretShown();
}
function releaseSenderWord(input) {
  const word = senderMorph?.words.find(w => w.input === input);
  if (!word) return;
  word.animations.forEach(a => a.cancel()); word.ghost.remove();
  input.style.opacity = ""; input.style.caretColor = "";
}
function morphFrom(on) {
  const d = contact.sheet, box = $(".sheet-in", d), s = $("#sender"), from = $("#from"), rows = $$("label.fld", s);
  if (s.classList.contains("known") === on) return;
  const pairs = [[$("#c-name"), $("#from-name")], [$("#c-email"), $("#from-email")]];
  // Capture the painted positions before releasing an interrupted transition; never duplicate live form controls.
  const oldShape = s.getBoundingClientRect(), oldScroll = box.scrollTop;
  const oldRows = rows.map(el => el.getBoundingClientRect()), oldFrom = from.getBoundingClientRect();
  const oldLabels = rows.map(row => $("span", row));
  const oldWords = pairs.map(([input, shown]) => {
    const previous = senderMorph?.words.find(w => w.input === input && w.ghost.isConnected);
    const source = previous?.ghost || (on ? input : shown), rect = source.getBoundingClientRect(), style = getComputedStyle(source);
    const scale = previous ? new DOMMatrixReadOnly(style.transform).a : 1;
    return { ghost: previous?.ghost, x: rect.left + (previous ? 0 : parseFloat(style.paddingLeft) || 0),
      y: rect.top + rect.height / 2,
      scale, size: parseFloat(style.fontSize), text: input.value, width: rect.width };
  });
  stopSenderMorph();
  from.hidden = !on; s.classList.toggle("known", on); if (!on) fit();
  if (motion.matches || !d.open) { steady(); return; }
  const duration = MOTION.enter + MOTION.stagger * 2, easing = "cubic-bezier(.4,0,.2,1)";
  const state = senderMorph = { animations: [], restore: [], words: [] };
  d.classList.add("sender-compacting");
  const style = (el, key, value) => {
    const was = el.style.getPropertyValue(key), priority = el.style.getPropertyPriority(key);
    state.restore.push(() => was ? el.style.setProperty(key, was, priority) : el.style.removeProperty(key));
    el.style.setProperty(key, value);
  };
  const animate = (el, frames, options = {}) => {
    const a = el.animate(frames, { duration, easing, fill: "both", ...options });
    state.animations.push(a); return a;
  };
  // The panel's actual height carries the message and button through normal layout. Hold the painted height
  // before starting so the editable and compact states never swap sizes in a single frame.
  const message = $("#c-message"), nextShape = s.getBoundingClientRect();
  const targets = pairs.map(([input, shown]) => {
    const el = on ? shown : input, rect = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
    return { el, x: rect.left + (parseFloat(cs.paddingLeft) || 0), y: rect.top + rect.height / 2, size: parseFloat(cs.fontSize), width: rect.width,
      line, font: cs.font, spacing: cs.letterSpacing, color: cs.color };
  });
  style(s, "height", `${oldShape.height}px`);
  box.scrollTop = oldScroll;
  animate(s, [{ height: `${oldShape.height}px` }, { height: `${nextShape.height}px` }]);
  // Keep the departing controls out of layout until their labels/portrait have faded. The actual inputs remain unique.
  const departing = on ? rows : [from], oldBounds = on ? oldRows : [oldFrom];
  departing.forEach((el, i) => {
    el.hidden = false; if (on) el.classList.add("ghost");
    const rect = oldBounds[i], wasInert = el.inert;
    state.restore.push(() => { el.inert = wasInert; }); el.inert = true;
    for (const [key, value] of Object.entries({ position: "absolute", left: `${rect.left - oldShape.left}px`, top: `${rect.top - oldShape.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, "pointer-events": "none" })) style(el, key, value);
    animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.fast });
  });
  pairs.forEach(([input, shown], i) => {
    const was = oldWords[i], target = targets[i], ghost = was.ghost || document.createElement("span");
    if (!was.ghost) {
      ghost.className = "sender-word"; ghost.setAttribute("aria-hidden", "true");
      ghost.textContent = was.text;
    }
    // Land on the destination's exact font, baseline and pixels before revealing its live text. This avoids a
    // doubled/blurred label when the editable font becomes the compact row's smaller email and heavier name.
    const initialScale = was.size * was.scale / target.size;
    ghost.style.font = target.font; ghost.style.letterSpacing = target.spacing;
    ghost.style.lineHeight = `${target.line}px`; ghost.style.color = target.color;
    s.append(ghost);
    const word = { ghost, input, animations: [] }; state.words.push(word);
    style(input, "opacity", "0"); style(shown, "opacity", "0"); style(input, "caret-color", "transparent");
    ghost.style.maxWidth = `${Math.max(1, Math.min(was.width / initialScale, target.width))}px`;
    word.animations.push(animate(ghost, [
      { transform: `translate(${was.x - oldShape.left}px,${was.y - oldShape.top - target.line * initialScale / 2}px) scale(${initialScale})` },
      { transform: `translate(${target.x - nextShape.left}px,${target.y - nextShape.top - target.line / 2}px) scale(1)` }
    ], { duration: duration - MOTION.fast }));
    const fade = { duration: MOTION.fast, delay: duration - MOTION.fast, easing: EASE_OUT };
    word.animations.push(animate(ghost, [{ opacity: 1 }, { opacity: 0 }], fade));
    word.animations.push(animate(target.el, [{ opacity: 0 }, { opacity: 1 }], fade));
  });
  const arriving = on ? [$("#from-face"), $("#from-change")] : oldLabels;
  arriving.forEach((el, i) => animate(el, [{ opacity: 0, translate: on ? "-4px 0" : "4px 0" }, { opacity: 1, translate: "0 0" }],
    { duration: duration - MOTION.fast - i * 20, delay: MOTION.fast + i * 20, easing: EASE_OUT }));
  if (document.activeElement === message) caretHidden();
  Promise.all(state.animations.map(a => a.finished.catch(() => {}))).then(() => {
    if (senderMorph !== state) return;
    stopSenderMorph(); if (d.open && !d.classList.contains("closing")) steady();
  });
}

// Send looks ready once there's something to send (tapped before, it says what's missing, and takes you there); the
// message grows as it's written, a line at a time, smoothly (styles.css)
const ready = () => { contact.send.classList.toggle("idle", !["#c-name", "#c-email", "#c-message"].every((sel) => $(sel).value.trim())); };
// (measured on a hidden copy, not the box being typed in: changing that one's height, even for a moment, moves it in
// the sheet, and an iPhone leaves its caret behind where it was, a line out; so it's only ever set when it changes)
let gauge = null;
const grow = () => {
  const t = $("#c-message");
  if (!gauge) {
    gauge = t.cloneNode(false);
    gauge.removeAttribute("id"); gauge.removeAttribute("name"); gauge.removeAttribute("aria-describedby");
    gauge.tabIndex = -1; gauge.setAttribute("aria-hidden", "true");
    Object.assign(gauge.style, { position: "absolute", left: "0", top: "0", visibility: "hidden", pointerEvents: "none", height: "0", minHeight: "0", transition: "none" });
    t.after(gauge);
  }
  gauge.style.width = `${t.offsetWidth}px`; gauge.value = t.value;
  const cs = getComputedStyle(t), h1 = Math.min(Math.max(gauge.scrollHeight + 2, parseFloat(cs.minHeight) || 0), parseFloat(cs.maxHeight) || Infinity);
  if (!t.offsetHeight || Math.abs(h1 - t.offsetHeight) < 1) return;
  t.style.height = `${h1}px`;
  if (document.activeElement === t) caretHidden();
  if (document.activeElement === t) setTimeout(() => { if (!senderMorph) steady(); }, 260);      // (once it's grown: styles.css)
};
// (a name or email too long for its row is made a little smaller to fit rather than cut off, down to 16 px: any
// smaller and an iPhone zooms the page in on the field when it's tapped)
const fit = () => {
  for (const el of [$("#c-name"), $("#c-email")]) {
    el.style.fontSize = "";
    if (!el.clientWidth || el.scrollWidth <= el.clientWidth) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    el.style.fontSize = `${Math.max(16, Math.floor((px * el.clientWidth) / el.scrollWidth * 10) / 10)}px`;
  }
};
const say = (t) => settle(contact.sheet, () => { contact.err.textContent = t; contact.err.hidden = !t; }, t ? contact.err : null);
contact.form.addEventListener("input", (e) => {
  e.target.removeAttribute?.("aria-invalid");
  if (e.target.matches("#c-name, #c-email")) releaseSenderWord(e.target);
  if (!contact.err.hidden) say("");
  ready();
  if (e.target.id === "c-message") grow(); else fit();
});
contact.form.addEventListener("change", fit);      // (filled in by the browser, where that's not an input)
contact.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (contact.send.classList.contains("busy")) return;
  const msg = { name: $("#c-name").value.trim(), email: $("#c-email").value.trim(), message: $("#c-message").value.trim(), website: $("#c-website").value };
  const wrong = (sel, t) => { const el = $(sel); el.setAttribute("aria-invalid", "true"); if ($("#sender").classList.contains("known") && sel !== "#c-message") $("#from-change").click(); el.focus(); say(t); };
  if (!msg.name) return wrong("#c-name", "Please add your name.");
  if (!msg.email) return wrong("#c-email", "Please add your email, for the reply.");
  if (!EMAIL.test(msg.email)) return wrong("#c-email", "That email doesn’t look right.");
  if (!msg.message) return wrong("#c-message", "Please write a message.");
  say(""); busyLabel(contact.send, "Sending…", true);
  const version = contact.version;
  contact.form.setAttribute("aria-busy", "true");
  try {
    await api("/api/contact", { method: "POST", body: msg });
    // A draft edited while the request was in flight belongs to the writer, even after the earlier message succeeds.
    if ($("#c-message").value.trim() === msg.message) $("#c-message").value = "";
    if (version !== contact.version || !contact.sheet.open) return;
    contact.send.classList.add("confirmed");
    fadeText($(".lbl", contact.send), "Sent");
    const activity = $(".send-activity", contact.send);
    activity?.replaceChildren($(".tick svg", contact.sent).cloneNode(true));
    if (!motion.matches) {
      await contact.send.animate([{ opacity: .9 }, { opacity: 1 }], { duration: MOTION.fast, easing: EASE_OUT }).finished.catch(() => {});
    }
    if (version !== contact.version || !contact.sheet.open) return;
    $("#thanks").textContent = `Thanks, ${msg.name.split(/\s+/)[0]}. You’ll hear back by email.`;
    settle(contact.sheet, () => { stopSenderMorph(); contact.form.hidden = true; contact.sent.hidden = false; }, contact.sent);
    $("button", contact.sent).focus({ preventScroll: true });
  } catch (err) {
    // (too slow to answer, it may have gone all the same: said so, so it isn't sent twice without a thought)
    if (version === contact.version) say(err.slow ? "That’s taking too long. It may still have sent: if you don’t hear back in a day or two, try again." : err.message);
  } finally {
    contact.form.removeAttribute("aria-busy");
    busyLabel(contact.send, "Send", false); ready(); grow();
  }
  // (Send, busy, couldn't keep the focus, which went from the sheet with it: back to it, if it's gone nowhere else)
  if (contact.sheet.open && !contact.form.hidden && document.activeElement === document.body) contact.send.focus({ preventScroll: true });
});

/* ---------------- editing (the owner): the words in place ---------------- */
const editables = $$("[data-edit]"), hero = $(".edit-words");
let before = null, editOut = null;
const guard = (e) => e.preventDefault();      // (leaving with the words half changed: the browser asks first)
function startEdit() {
  if (editing || !me?.owner) return;
  if (wordsDue) { wordsDue.then(startEdit); return; }     // (the words asked for again, back from history: start from them)
  // (and not from the defaults, the words not in the page as it came and not come since: asked for again, to start then)
  if (!wordsKnown) { wordsDue = askWords(); wordsDue.then(() => (wordsKnown ? startEdit() : toast("Couldn’t load the words. Try again in a moment."))); return; }
  // (a change needs it shown it's you lately: on the account's page first, which brings you back here, editing)
  if (!me.fresh && me.account) { location.href = me.account + "/#confirm=edit"; return; }
  // (and what was typed before a save that didn't go, back where it was)
  let draft = null; try { draft = JSON.parse(sessionStorage.getItem("home-draft") || "null"); sessionStorage.removeItem("home-draft"); } catch (_) {}
  editing = true; before = { ...content };
  // (the words held where they are, growing downwards as they're typed, not pushing the lines above them up)
  loadPhotos();
  clearTimeout(editOut); body.classList.remove("edit-out");
  // (Edit goes as Done takes its place: the focus, if it was on Edit, goes on to Done, not lost from the page)
  const fromEdit = document.activeElement === $("#edit");
  body.classList.add("edit");
  if (fromEdit) $("#done").focus({ preventScroll: true });
  for (const el of editables) {
    // (plain text where the browser has it; where it doesn't, what's pasted is made plain below)
    try { el.contentEditable = "plaintext-only"; } catch (_) {}
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.spellcheck = true;
    if (draft && typeof draft[el.dataset.c] === "string") el.textContent = draft[el.dataset.c];
  }
  addEventListener("beforeunload", guard);
  hero.scrollIntoView({ block: "center", behavior: motion.matches ? "instant" : "smooth" });

}
async function endEdit(keep = true) {
  if (!editing) return;
  const next = { role: text($("[data-c=role][data-edit]")), name: text($("[data-c=name][data-edit]")), bio: text($("[data-c=bio][data-edit]")) };
  for (const el of editables) el.removeAttribute("contenteditable");
  editing = false;
  removeEventListener("beforeunload", guard);
  // (the bar at the foot sinks away, and the words settle back to where they sit on the page, smoothly)
  const lines = [...hero.children], tops = lines.map((el) => el.getBoundingClientRect().top);
  body.classList.remove("edit", "lines-on");
  // (the focus back on Edit, as it comes back in Done's place: not left on a line no longer typed in, or on Done, gone)
  $("#edit").focus({ preventScroll: true });
  body.classList.add("edit-out");
  clearTimeout(editOut); editOut = setTimeout(() => body.classList.remove("edit-out"), 500);

  if (!motion.matches) lines.forEach((el, i) => { const d = tops[i] - el.getBoundingClientRect().top; if (Math.abs(d) > 1) el.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 350, easing: EASE_OUT }); });
  const changed = keep && !["role", "name", "bio"].every((k) => next[k] === before[k]);
  // (what's been typed stays as it is while it's saved: it's put back only if it can't be)
  if (changed) content = { ...content, ...next };
  showContent();
  if (!changed) return;
  try {
    content = (await api("/api/content", { method: "PUT", body: next })).content;
    showContent();
    toast("Saved", async () => {
      try { content = (await api("/api/history", { method: "POST", body: { index: 0 } })).content; showContent(); toast("Undone"); }
      catch (err) { toast(err.message); }
    });
  } catch (err) {
    content = before; showContent(); toast(err.message);
    try { sessionStorage.setItem("home-draft", JSON.stringify(next)); } catch (_) {}
    if (err.field === "reauth") me.fresh = false;
    startEdit();
  }
}
$("#editbar").addEventListener("animationend", (e) => { if (e.target === e.currentTarget && !editing) { clearTimeout(editOut); body.classList.remove("edit-out"); } });
// (a line of plain text: what was typed, its spaces run together)
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();
$("#edit").addEventListener("click", startEdit);
$("#done").addEventListener("click", () => endEdit(true));
for (const el of editables) {
  // Return finishes the line; what's pasted comes in as plain text
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); el.blur(); }
  });
  el.addEventListener("paste", (e) => {
    if (el.contentEditable === "plaintext-only") return;
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData?.getData("text/plain") || "").replace(/\s+/g, " "));
  });
}
// (Escape anywhere but a sheet leaves editing as it was)
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && editing && !document.querySelector("dialog[open]")) endEdit(false); });

/* ---------------- the photos, changed from their sheet ---------------- */
const ph = { sheet: $("#photos-sheet"), tiles: $("#tiles"), err: $("#photos-err"), input: $("#photo-input"), add: $("#add-photos") };
const WHERE = { both: "Both", mobile: "Phone", desktop: "Computer" }, NEXT = { both: "mobile", mobile: "desktop", desktop: "both" };
// (with a mouse there's no tapping; and there's a keyboard, for the arrow keys)
if (matchMedia("(hover: hover) and (pointer: fine)").matches) $(".hint", ph.sheet).textContent = "Click a photo, or use the arrow keys on it, to choose the part that stays in view.";
// (what a photo in the sheet is, to a screen reader: where its point in view is, and how to move it)
const inView = (x, y) => `Part in view: ${x}% across, ${y}% down. Arrow keys move it`;
// the first few, small, in the bar at the foot (each new one popping in: styles.css)
function showThumbs() {
  const t = $("#thumbs"), want = photos.slice(0, 4);
  if ([...t.children].map((i) => i.dataset.id).join() === want.map((p) => p.id).join()) return;
  const had = new Map([...t.children].map((i) => [i.dataset.id, i]));
  t.replaceChildren(...want.map((p) => {
    let i = had.get(p.id);
    if (!i) { i = document.createElement("i"); i.dataset.id = p.id; i.style.backgroundImage = `url("${photoUrl(p, true)}")`; }
    return i;
  }));
}
function photosSaid(t) { settle(ph.sheet, () => { ph.err.textContent = t || ""; ph.err.hidden = !t; }, t ? ph.err : null); }
// The photos in their sheet, each tile kept for the photo it shows (by its id), so a change moves what changed and no
// more: a new focal point or screen moves into place, a photo added grows in (from the placeholder it had while it went
// up), one removed fades where it was while the rest close up around it, and the sheet goes to its new height
function makeTile(p, src) {
  const tile = document.createElement("div");
  tile.className = "tile"; tile.dataset.id = p.id;
  const img = document.createElement("img");
  // (fetched only as it comes near the sheet's view, which scrolls: there may be fifty; and each one Tab goes to, for
  // the arrow keys below)
  img.alt = ""; img.decoding = "async"; img.loading = "lazy"; img.tabIndex = 0; img.src = src || photoUrl(p, true);
  fadeOnLoad(img);
  const dot = document.createElement("span");
  dot.className = "dot";
  const where = document.createElement("button");
  where.type = "button"; where.className = "where";
  const rm = document.createElement("button");
  rm.type = "button"; rm.className = "rm"; rm.setAttribute("aria-label", "Remove this photo");
  rm.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  // (as the photo is now, by its id: not as it was when the tile was made)
  const now = () => photos.find((x) => x.id === p.id);
  const aim = (x, y) => { img.style.objectPosition = `${x}% ${y}%`; dot.style.left = `${x}%`; dot.style.top = `${y}%`; img.alt = inView(x, y); };
  // (a tap on the photo: the point that stays in view as the screen crops it, moved there at once, and back if it can't be kept)
  img.addEventListener("click", (e) => {
    if ($(".ask", tile)) return;
    const r = img.getBoundingClientRect();
    const x = Math.round(clamp((e.clientX - r.left) / r.width) * 100), y = Math.round(clamp((e.clientY - r.top) / r.height) * 100);
    aim(x, y);
    change(tile, "POST", { focus: `${x}% ${y}%` });
  });
  // (or the arrow keys on it, a step at a time: moved at once, and kept once they've been let be for a moment, not
  // sent for every press; tile._keyed meanwhile, so another photo's answer doesn't move it back)
  img.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
    if (!d || $(".ask", tile)) return;
    e.preventDefault();
    // (not while its last change is on its way, as a tap isn't: the answer would move it back, or the two cross)
    if (tile._inflight) return;
    const [fx, fy] = (img.style.objectPosition || "50% 50%").split(" ").map(parseFloat);
    const x = Math.round(clamp((fx + d[0]) / 100) * 100), y = Math.round(clamp((fy + d[1]) / 100) * 100);
    aim(x, y);
    clearTimeout(tile._keyed); tile._keyed = setTimeout(() => { tile._keyed = null; change(tile, "POST", { focus: `${x}% ${y}%` }); }, 500);
  });
  where.addEventListener("click", () => { const q = now(); if (q) change(tile, "POST", { device: NEXT[q.device || "both"] }); });
  rm.addEventListener("click", () => askRemove(tile));
  tile.append(img, dot, where, rm);
  return tile;
}
// (a tile with a change of its own on its way, or arrow keys about to send one, keeps its point and stays busy: the list
// another photo's answer brings may be from before that change)
function updateTile(tile, p) {
  const img = $("img", tile), dot = $(".dot", tile), where = $(".where", tile);
  const focus = p.focus || "50% 50%", [fx, fy] = focus.split(" "), w = WHERE[p.device || "both"];
  if (!tile._inflight && !tile._keyed) { img.style.objectPosition = focus; dot.style.left = fx; dot.style.top = fy; img.alt = inView(parseFloat(fx), parseFloat(fy)); }
  if (where.textContent) fadeText(where, w); else where.textContent = w;
  where.setAttribute("aria-label", `Shows on: ${w}. Change`);
  if (!tile._inflight) tile.classList.remove("busy");
}
// (taking one out is asked on the photo itself: Remove, or Keep)
function askRemove(tile) {
  if ($(".ask", tile)) return;
  const ask = document.createElement("div");
  ask.className = "ask"; ask.setAttribute("role", "group"); ask.setAttribute("aria-label", "Remove this photo?");
  ask.innerHTML = '<p>Remove this photo?</p><button type="button" class="yes">Remove</button><button type="button" class="no">Keep</button>';
  $(".yes", ask).addEventListener("click", () => change(tile, "DELETE", {}));
  $(".no", ask).addEventListener("click", () => {
    $(".rm", tile).focus({ preventScroll: true });
    if (motion.matches) return ask.remove();
    ask.classList.add("going"); ask.addEventListener("animationend", () => ask.remove(), { once: true });
  });
  tile.append(ask);
  $(".yes", ask).focus({ preventScroll: true });
}
async function change(tile, method, data) {
  tile.classList.add("busy"); photosSaid("");
  tile._inflight = (tile._inflight || 0) + 1;
  try { photos = (await api("/api/background", { method, body: { id: tile.dataset.id, ...data } })).images || []; }
  catch (err) { photosSaid(err.message); }
  finally { tile._inflight--; }        // (before the redraw: its own answer is the one to show)
  photosChanged();
}
// (one on its way up: shown at once, dimmed, until it's in)
function pendingTile(file) {
  const t = document.createElement("div");
  t.className = "tile pending";
  if (!motion.matches) t.classList.add("fresh");
  const img = document.createElement("img");
  img.alt = ""; img.decoding = "async"; img.src = URL.createObjectURL(file);
  t.append(img);
  return t;
}
function showTiles() {
  // (where each was in the grid: within it, so the sheet changing height around it doesn't count as moving)
  const c = ph.tiles.getBoundingClientRect(), where = (t) => { const r = t.getBoundingClientRect(); return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height }; };
  const leaving = $$(".tile.leaving", ph.tiles), pending = $$(".tile.pending", ph.tiles);
  const kept = new Map($$(".tile:not(.leaving):not(.pending)", ph.tiles).map((t) => [t.dataset.id, t]));
  const was = new Map([...kept.values(), ...pending].map((t) => [t, where(t)]));
  const animate = ph.sheet.open && !motion.matches;
  const els = photos.map((p) => {
    let t = kept.get(p.id);
    if (t) kept.delete(p.id);
    else {
      // (the one just added takes its placeholder's place, with the photo it already showed)
      const stand = pending.shift();
      t = makeTile(p, stand && $("img", stand).src);
      if (stand) was.set(t, was.get(stand)); else if (animate) t.classList.add("fresh");
    }
    updateTile(t, p);
    return t;
  });
  // (the ones gone: lifted out where they were, to fade away there, while the rest close up)
  const going = [...kept.values()];
  for (const t of going) {
    const r = was.get(t);
    Object.assign(t.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    t.classList.remove("fresh", "busy"); t.classList.add("leaving");
    const bye = () => t.remove();
    t.addEventListener("animationend", bye, { once: true });
    setTimeout(bye, 500);
  }
  let none = null;
  if (!photos.length && !pending.length) { none = $(".none", ph.tiles); if (!none) { none = document.createElement("p"); none.className = "none"; none.textContent = "No photos yet."; } }
  // (a tile taken out and put back loses the focus, even in the same place: kept on what had it, a photo being moved by
  // the arrow keys, say, if it's in one that stays)
  const had = ph.tiles.contains(document.activeElement) ? document.activeElement : null;
  ph.tiles.replaceChildren(...els, ...pending, ...(none ? [none] : []), ...leaving, ...going);
  if (had?.isConnected && !had.closest(".leaving") && document.activeElement !== had) had.focus({ preventScroll: true });
  if (!animate) return;
  for (const t of els) {
    const a = was.get(t); if (!a) continue;
    const b = where(t), dx = a.x - b.x, dy = a.y - b.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) t.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 350, easing: GLIDE });
  }
}
// (the slideshow's changed only as much as it needs to be: a new focal point is moved to where it shows, and a different
// set of photos for this screen carries on from the one showing, rather than going dark and starting again)
function photosChanged() {
  if (ph.sheet.open) settle(ph.sheet, showTiles); else showTiles();
  showThumbs();
  loadPhotos();

}
$("#change-photos").addEventListener("click", () => { photosSaid(""); showTiles(); openSheet(ph.sheet); });
ph.add.addEventListener("click", () => ph.input.click());
ph.input.addEventListener("change", async () => {
  const files = [...(ph.input.files || [])].filter((f) => f.type.startsWith("image/"));
  ph.input.value = "";
  if (!files.length) return;
  photosSaid(""); busyLabel(ph.add, files.length > 1 ? `Adding 1 of ${files.length}…` : "Adding…", true);
  // (each one there at once, as it goes up)
  settle(ph.sheet, () => { $(".none", ph.tiles)?.remove(); for (const f of files) ph.tiles.append(pendingTile(f)); });
  try {
    for (const [i, f] of files.entries()) {
      if (files.length > 1) fadeText($(".lbl", ph.add), `Adding ${i + 1} of ${files.length}…`);
      const [image, small] = await shrinkBoth(f);
      // (a minute and a half to go up, as Chat gives a file: it's megabytes, and a phone's signal sends slowly)
      photos = (await api("/api/background", { method: "PUT", body: { image, small }, timeout: 90000 })).images || photos;
      photosChanged();
    }
  } catch (err) {
    photosSaid(err.message === "Invalid or oversized image." ? "That photo couldn’t be added. Try a smaller one." : err.message);
    settle(ph.sheet, () => { for (const t of $$(".tile.pending", ph.tiles)) t.remove(); if (!photos.length) showTiles(); });
    // (out of time, it may have gone up all the same: the photos asked for again, so it's there before it's tried twice)
    if (err.slow) try { photos = (await api("/api/background")).images || photos; photosChanged(); } catch (_) {}
  }
  busyLabel(ph.add, "Add photos", false);
});
// A photo made ready to send: decoded once, then drawn at two sizes (at most 2,600 pixels on its longer side, enough for
// a phone's screen at 3× or a computer's at 2×, and a phone's own copy at 1,600), as WebP where the browser can make it
// (about a third smaller), else as JPEG. The decoding and encoding happen off this thread where the browser can do that,
// so the page doesn't freeze while a photo's added.
async function shrinkBoth(file) {
  let bmp = null;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (_) {}
  if (!bmp) return Promise.all([shrinkInPage(file, 2600), shrinkInPage(file, 1600, 0.8)]);
  try { return await Promise.all([encode(bmp, 2600, 0.86), encode(bmp, 1600, 0.8)]); }
  finally { bmp.close(); }
}
async function encode(bmp, max, q) {
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  let blob = null;
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    blob = await c.convertToBlob({ type: "image/webp", quality: q });
    if (blob.type !== "image/webp") blob = await c.convertToBlob({ type: "image/jpeg", quality: q });
  } else {
    const c = document.createElement("canvas");
    c.width = w; c.height = h; c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const as = (type) => new Promise((ok) => c.toBlob(ok, type, q));
    blob = await as("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await as("image/jpeg");
  }
  if (!blob) throw new Error("That photo couldn’t be made ready. Try another.");
  return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error("That photo couldn’t be read.")); r.readAsDataURL(blob); });
}
// (where the browser can't decode a photo off this thread: as it was always done, here)
function shrinkInPage(file, max, q = 0.86) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const webp = c.toDataURL("image/webp", q);
      resolve(webp.startsWith("data:image/webp") ? webp : c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn’t a photo this browser can open.")); };
    img.src = url;
  });
}

/* ---------------- no copying outside the fields ----------------
   (zooming is left alone: anyone who needs the page bigger can pinch it, or zoom it on a computer) */
const inField = (el) => !!el?.closest?.("input, textarea, [contenteditable]");
for (const ev of ["copy", "cut"]) document.addEventListener(ev, (e) => { if (!inField(e.target)) e.preventDefault(); });

/* ---------------- start ---------------- */
$("#year").textContent = new Date().getFullYear();
showContent();      // (the Person block for search made from the words: index.html has it with the defaults)
// (back by the browser's Back or Forward, the page can be the copy the browser kept, not asked for again, with the
// words as they were then: asked for, so they're not edited from older ones; taken only if they come, and Edit waits.
// The same when the server couldn't read them as it sent the page (it marks it data-words when they're in it), so the
// defaults it's written with aren't edited, to be saved over the real ones; and for the page kept whole: pageshow)
let wordsKnown = root.hasAttribute("data-words");
const askWords = () => api("/api/content").then((c) => { content = c; wordsKnown = true; if (!editing) showContent(); }, () => {}).finally(() => { wordsDue = null; });
let wordsDue = (performance.getEntriesByType?.("navigation")[0]?.type === "back_forward" || !wordsKnown) ? askWords() : null;
setupProjectReveals();
setupGalleryDrag();
setupGalleryMenu();
setupOpening();
loadMe();
