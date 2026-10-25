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
const clamp = (v) => Math.min(1, Math.max(0, v));
const body = document.body, root = document.documentElement;
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const phone = matchMedia("(max-width: 600px)");
// The site's motion, in script as in the styles (styles.css: --ease-out for what arrives, --ease-glide for what slides)
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)", GLIDE = "cubic-bezier(0.32, 0.72, 0, 1)";
// (words changed in place fade in, rather than snapping; only where they're actually different, and in sight)
function fadeText(el, t) {
  if (el.textContent === t) return;
  el.textContent = t;
  if (!motion.matches && el.isConnected && Number(getComputedStyle(el).opacity) > 0.5) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE_OUT });
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

/* ---------------- scrolling: the name comes into the bar, the hero fades under it ---------------- */
// Where the browser can, these move with the scroll itself, off the page's own thread (styles.css: animation-timeline):
// the hero's lines are each given the stretch of scroll they fade over, measured once (and again when the page's size
// or words change), never as it scrolls. Elsewhere a scrolled frame sets only the opacity of a few things, from those
// same measurements.
const linked = CSS.supports("animation-timeline: scroll()");
{
  const bar = $("#bar"), mid = $(".bar .mid"), veil = [$("#soft"), $(".barbg")], fades = $$(".hero > *"), pageEl = $("#page");
  const FADE = 64;      // the least scroll a line fades over
  let ranges = [], name = null, queued = false;
  const draw = () => {
    queued = false;
    const y = scrollY, k = name ? clamp((y - name[0]) / (name[1] - name[0])) : 0;
    for (const el of veil) { el.style.opacity = k; el.style.visibility = k > 0 ? "visible" : "hidden"; }
    mid.style.opacity = k; mid.style.transform = `translateY(${(1 - k) * 8}px)`;
    fades.forEach((el, i) => { const r = ranges[i], o = editing || !r ? "" : 1 - clamp((y - r[0]) / (r[1] - r[0]));
      el.style.opacity = o; el.style.visibility = o === 0 && el.classList.contains("cta") ? "hidden" : ""; });
  };
  // (a scroll-linked animation keeps the range it was made with, so when its range changes it's made again, within the
  // one frame, so nothing of that is seen; one that isn't to fade has none at all)
  const setRange = (el, r) => {
    const key = r ? `${r[0]}px ${r[1]}px` : "none";
    if (el._range === key) return;
    el._range = key;
    el.style.animationName = "none";
    if (!r) return;
    void getComputedStyle(el).animationName;
    el.style.animationRange = key;
    el.style.animationName = "";
  };
  const measure = () => {
    if (pinned !== null) return;      // (again once it's let go)
    // (where each line is on the page as it's laid out, not where it looks mid-way through rising into place)
    const edge = bar.offsetHeight, tops = fades.map((el) => pageEl.offsetTop + el.offsetTop);
    // Each line fades from 78 px under the bar to 12 px into it, over 64 px of scroll at least, within the scroll there
    // is: on a short page (a computer's tall window) a fade that wouldn't finish is fitted into what scroll there is, and
    // one that can't have its 64 px isn't begun (a line left half-faded at the bottom looks broken, and the hero gone at
    // one notch of a wheel looks like a glitch); a line the scroll never brings up to the bar doesn't fade at all (on a
    // short page, faded lines well clear of the bar left half the screen empty); if the name itself can't fade, nothing
    // does. The name comes into the bar as the name in the hero goes.
    // (a pixel short of the end, so a fade fitted into it finishes however the page's height is rounded)
    const most = Math.max(0, document.documentElement.scrollHeight - innerHeight - 1);
    ranges = tops.map((top) => {
      if (top - edge > most) return null;
      let a = Math.max(0, top - edge - 78), b = Math.max(a + FADE, top - edge + 12);
      if (b > most) { b = most; a = Math.min(a, b - FADE); if (a < 0) return null; }
      return [a, b];
    });
    const h = fades.findIndex((el) => el.tagName === "H1");
    if (!ranges[h]) ranges = ranges.map(() => null);
    // (the slideshow's marker goes with the buttons above it, never left by itself under the bar)
    ranges[fades.findIndex((el) => el.classList.contains("segs"))] = ranges[fades.findIndex((el) => el.classList.contains("cta"))];
    name = ranges[h] ? [ranges[h][0], Math.max(ranges[h][0] + FADE, Math.min(ranges[h][1] + 40, most))] : null;
    if (linked) {
      fades.forEach((el, i) => setRange(el, ranges[i]));
      for (const el of [mid, ...veil]) setRange(el, name);
    } else draw();
  };
  addEventListener("scroll", () => {
    if (pinned !== null) return;      // (held behind a sheet: it reads as the top, but it's still where it was)
    hold();
    if (!linked && !queued) { queued = true; requestAnimationFrame(draw); }
  }, { passive: true });
  addEventListener("resize", measure);
  // (again whenever a line changes size: its words, the typeface arriving, the slideshow's marker appearing)
  const watch = new ResizeObserver(measure);
  for (const el of [$(".hero"), ...fades]) watch.observe(el);
  document.fonts?.ready.then(measure);
  window.redrawScroll = () => (linked ? measure() : draw());
  requestAnimationFrame(measure);
}

/* ---------------- the photos: a slideshow, the set for this screen ---------------- */
// Each photo's fetched and decoded before it fades in over the one before, so the fade never waits on it, and the next is
// made ready a few seconds before it's due. It drifts in slowly as it shows, but only while the top of the page is in
// view: scrolled down, with a sheet up or the page out of sight, it holds still (the slideshow too), so the glass over it
// isn't redrawn for every frame of a photo no one's looking at.
const SLIDE = 7000, DRIFT = 9000;
let photos = [], shown = [], at = -1, timer = null, early = null, firstBuild = true, build = 0, left = SLIDE, since = 0, drift = null, held = false;
const bgEl = $("#bg"), segsEl = $("#segs");
root.style.setProperty("--slide", SLIDE / 1000 + "s");

async function loadPhotos() {
  try { photos = (await api("/api/background")).images || []; } catch (_) { photos = []; }
  buildSlides();
  showThumbs();
}
// the ones for this screen (tagged Both, or this kind of screen); all of them if none are
function forScreen() {
  const want = phone.matches ? "mobile" : "desktop";
  const f = photos.filter((p) => (p.device || "both") === "both" || p.device === want);
  return f.length ? f : photos;
}
// (a phone is sent the phone-sized copy, where there is one; the small previews always are)
const photoUrl = (p, small = phone.matches) => `/api/background?id=${encodeURIComponent(p.id)}${small && p.m ? "&s=m" : ""}`;
function makeSlide(p, src) {
  const s = document.createElement("img");
  s.className = "slide"; s.alt = ""; s.decoding = "async"; s.dataset.id = p.id;
  s.style.objectPosition = s.style.transformOrigin = p.focus || "50% 50%";
  s.dataset.src = src || photoUrl(p);
  return s;
}
const makeSeg = (p) => { const i = document.createElement("i"); i.dataset.id = p.id; return i; };
function buildSlides() {
  clearTimeout(timer); clearTimeout(early); build++;
  bgEl.textContent = ""; segsEl.textContent = "";
  shown = forScreen(); at = -1; drift = null;
  // (the first, the first time: the address the page asked for early, so it's already on its way)
  shown.forEach((p, i) => { bgEl.append(makeSlide(p, i === 0 && firstBuild ? `/api/background?id=cover&d=${phone.matches ? "mobile" : "desktop"}` : null)); segsEl.append(makeSeg(p)); });
  firstBuild = false;
  segsEl.classList.toggle("one", shown.length < 2);
  if (shown.length) show(0);
}
// The photos for this screen changed (one added, removed, or shown on other screens now): the ones still here stay as
// they are, and the one showing carries on (or, if it's gone, the next fades in over it), rather than the slideshow
// starting again from dark
function updateSlides() {
  const next = forScreen();
  if (!next.length || !bgEl.querySelector(".slide.on")) return buildSlides();
  const cur = shown[at]?.id, was = at;
  const slides = new Map([...bgEl.children].filter((s) => !s._gone).map((s) => [s.dataset.id, s]));
  const segs = new Map([...segsEl.children].map((s) => [s.dataset.id, s]));
  const els = next.map((p) => {
    const s = slides.get(p.id) || makeSlide(p);
    slides.delete(p.id);
    s.style.objectPosition = s.style.transformOrigin = p.focus || "50% 50%";
    return s;
  });
  // (one that's gone, if it's showing, stays under the next until that's faded in over it)
  const gone = [...slides.values()].filter((s) => s.classList.contains("on") || s.classList.contains("was"));
  for (const s of gone) s._gone = true;
  build++; clearTimeout(timer); clearTimeout(early);
  bgEl.replaceChildren(...els, ...gone);
  segsEl.replaceChildren(...next.map((p) => segs.get(p.id) || makeSeg(p)));
  segsEl.classList.toggle("one", next.length < 2);
  shown = next;
  const i = next.findIndex((p) => p.id === cur);
  if (i >= 0) { at = i; markSegs(i, false); if (!held) schedule(); }
  else show(Math.max(0, Math.min(was, next.length - 1)));
}
// (fetched and decoded: ready to show at once)
function prepare(i) {
  const s = bgEl.children[i];
  if (!s) return Promise.resolve();
  if (!s.getAttribute("src")) s.src = s.dataset.src;
  return s.decode().catch(() => {});
}
// (the segments: those before the one showing full, the one showing filling (again, unless it's carrying on))
function markSegs(i, restart = true) {
  $$("i", segsEl).forEach((seg, j) => {
    seg.classList.toggle("past", j < i);
    if (j !== i) seg.classList.remove("on");
    else if (restart || !seg.classList.contains("on")) { seg.classList.remove("on"); void seg.offsetWidth; seg.classList.add("on"); }
  });
}
async function show(i) {
  clearTimeout(timer);
  const b = build, s = bgEl.children[i];
  if (!s) return;
  await prepare(i);
  if (b !== build) return;   // (the set changed while it loaded)
  // (the one before stays as it is underneath, covered by this one as it fades in, then lets go)
  const prev = bgEl.querySelector(".slide.on");
  if (prev && prev !== s) {
    prev.classList.replace("on", "was");
    clearTimeout(prev._was);
    prev._was = setTimeout(() => { prev.classList.remove("was"); if (prev._gone) prev.remove(); }, 1700);
  }
  clearTimeout(s._was); s.classList.remove("was");
  at = i; s.classList.add("on");
  // the drift, from a touch larger to its own size; the one before stays where it got to as it's covered, then lets go
  const was = drift;
  drift = motion.matches ? null : s.animate([{ transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: DRIFT, easing: "linear", fill: "forwards" });
  if (was && was !== drift) setTimeout(() => was.cancel(), 1800);
  markSegs(i);
  // (its softened copy made now, so it's there however soon the page is scrolled: made small off this thread, so
  // neither the fade nor its start waits on it)
  soften(s, shown[i]);
  left = SLIDE;
  if (held) drift?.pause(); else schedule();
}
// (the next photo fetched a few seconds before it's due, not as soon as this one shows: never, if the slideshow
// doesn't move on (less motion asked for, or held), and not on a connection that's asked to save data)
function schedule() {
  clearTimeout(timer); clearTimeout(early);
  const n = shown.length;
  if (n > 1 && !motion.matches && !held) {
    since = performance.now(); timer = setTimeout(() => show((at + 1) % n), left);
    if (!navigator.connection?.saveData) { const next = (at + 1) % n; early = setTimeout(() => prepare(next), Math.max(0, left - 2500)); }
  }
}
// (held still, where it got to: scrolled down, a sheet up, or the page out of sight)
function hold() {
  const h = document.hidden || scrollY > 40 || body.classList.contains("sheet-up");
  if (h === held) return;
  held = h; body.classList.toggle("paused", h);
  if (h) { clearTimeout(timer); clearTimeout(early); left = Math.max(0, left - (performance.now() - since)); drift?.pause(); }
  else { drift?.play(); schedule(); }
}
// (a different set when the screen changes size past a phone's, only if it's actually different)
phone.addEventListener("change", () => { if (forScreen().map((p) => p.id).join() !== shown.map((p) => p.id).join()) updateSlides(); });
document.addEventListener("visibilitychange", hold);
hold();      // (and from the start: a page opened out of sight, in a tab behind, holds still till it's looked at)
motion.addEventListener("change", () => { if (at >= 0) show(at); });

// The photo softened behind what's over it as the page scrolls: the photo showing, drawn tiny and smoothed once (a few
// thousand pixels' work), then stretched over the screen, so softening it is only a fade, not a blur redrawn each frame.
// (styles.css fades the copy in when it's first made)
const softs = new Map();
async function soften(img, p) {
  const el = $("#soft"), key = img.currentSrc || img.src;
  if (!softs.has(key)) {
    let url = null, foot = null;
    try {
      const w = 48, h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth)), c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d");
      // (made small by the browser as it's decoded: from the photo's bytes (from the browser's cache) that's done off this
      // thread; from the <img> itself Chromium decodes the whole photo again here, the longest moment's work on the page)
      const bytes = window.createImageBitmap ? await fetch(key, { cache: "force-cache" }).then((r) => (r.ok ? r.blob() : null)).catch(() => null) : null;
      const small = bytes ? await createImageBitmap(bytes, { resizeWidth: w, resizeHeight: h, resizeQuality: "medium" }).catch(() => null) : null;
      if (img.currentSrc !== key && img.src !== key) return;      // (another photo by now)
      x.drawImage(small || img, 0, 0, w, h); small?.close?.();
      const d = x.getImageData(0, 0, w, h);
      foot = footOf(d.data, w, h);
      for (let k = 0; k < 3; k++) boxBlur(d.data, w, h, 3);
      x.putImageData(d, 0, 0);
      url = c.toDataURL("image/png");
    } catch (_) {}
    softs.set(key, { url, foot });
  }
  if (img !== bgEl.querySelector(".slide.on")) return;              // (another photo showing by now)
  const { url, foot } = softs.get(key);
  if (foot) body.style.backgroundColor = foot;
  el.style.setProperty("--soft-img", url ? `url("${url}")` : "none");
  el.style.setProperty("--soft-pos", p.focus || "50% 50%");
  el.style.setProperty("--soft-on", url ? "1" : "0");
}
// The page's own colour, under the photos where they end above Safari's bar at the foot (styles.css .bg): the photo's
// at its foot, its bottom row made small, under the shade the page lays over it there, so the page carries on from it
function footOf(px, w, h) {
  let r = 0, g = 0, b = 0;
  for (let i = (h - 1) * w; i < h * w; i++) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; }
  return "#" + [r / w, g / w, b / w].map((v, i) => Math.round(v * 0.14 + [5, 7, 12][i] * 0.86).toString(16).padStart(2, "0")).join("");
}
// (each pixel the average of those within r of it, across then down; the edges held)
function boxBlur(px, w, h, r) {
  const tmp = new Float32Array(px.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let t = 0;
    for (let k = -r; k <= r; k++) t += px[(y * w + Math.min(w - 1, Math.max(0, x + k))) * 4 + c];
    tmp[(y * w + x) * 4 + c] = t / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    let t = 0;
    for (let k = -r; k <= r; k++) t += tmp[(Math.min(h - 1, Math.max(0, y + k)) * w + x) * 4 + c];
    px[(y * w + x) * 4 + c] = t / n;
  }
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
  // and your photo's place and Edit wait for it: arrive; Sign in, as it was, measured first, as it's about to go)
  const back = arrival && !arrival.gone && !arrival.av ? arrival : null, welcome = back && me.signedIn;
  const pill = welcome && !motion.matches ? $("#sign-in").getBoundingClientRect() : null;
  if (welcome) { for (const el of [$("#me"), $("#edit")]) el.classList.add("held"); back.lines = true; }
  // (the account's page shows the way back here: #from=home; and Sign in comes straight back once you're in: #signin=home)
  if (me.account) for (const a of $$("[data-account]")) a.href = me.account + (a.id === "sign-in" ? "/#signin=home" : "/#from=home");
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
    $(".cta [data-contact]").click();
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
  if (welcome) arrive(back, pill); else if (back) arriveEnd(back, true);
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
  };
  for (const key of ["inflight", "weather"]) {
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
  const a = { el, av: null, ghost: null, end: null, lines: false, timers: new Set(), gone: false };
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
  a.ghost?.remove();
  for (const x of [a.el, a.av]) {
    if (!x?.isConnected) continue;
    if (!fade) { x.remove(); continue; }
    x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: 250, easing: EASE_OUT, fill: "forwards" }).finished.then(() => x.remove(), () => x.remove());
    setTimeout(() => x.remove(), 400);     // (should that not end: in a tab put away)
  }
}
// Signed in: your photo (or your initial) comes into the picture (pill: where Sign in was, to draw in from)
function arrive(a, pill) {
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
    later(a, () => reveal(a, pill), there ? 120 : still ? 250 : 420);
  });
}
// The picture fades, the page under it; Sign in, as it was, draws in to the circle your photo goes in, and the photo
// comes down into it on a gentle curve (bowed up a little, as if tossed there rather than slid), becoming the bar's as it
// goes. With Reduce Motion, the photo fades with the picture, and the bar's comes in where it is
function reveal(a, pill) {
  const still = motion.matches, el = a.el, av = a.av, to = $("#me").getBoundingClientRect();
  el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: still ? 200 : 400, easing: EASE_OUT, fill: "forwards" }).finished.then(() => el.remove(), () => el.remove());
  if (still || !pill || !to.width || !av?.isConnected) {
    av?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_OUT, fill: "forwards" });
    later(a, () => land(a), 200);
    return;
  }
  // Sign in, drawing in to the circle (what it says going first)
  const ghost = a.ghost = $("#sign-in").cloneNode(true);
  for (const k of ["id", "href", "data-account"]) ghost.removeAttribute(k);
  ghost.classList.replace("only-visitor", "pill-ghost"); ghost.setAttribute("aria-hidden", "true"); ghost.inert = true;
  Object.assign(ghost.style, { left: `${pill.left}px`, top: `${pill.top}px`, width: `${pill.width}px`, height: `${pill.height}px` });
  body.append(ghost);
  ghost.animate([{ left: `${pill.left}px`, top: `${pill.top}px`, width: `${pill.width}px`, height: `${pill.height}px` }, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` }],
    { duration: 350, delay: 150, easing: GLIDE, fill: "both" });
  ghost.animate([{ color: getComputedStyle(ghost).color }, { color: "transparent" }], { duration: 150, delay: 120, easing: EASE_OUT, fill: "both" });
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
  a.ghost?.remove(); a.ghost = null;
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
// the apps' own addresses, from this one (the site's, or a test's or a preview's)
{
  const host = location.hostname.replace(/^www\./, "");
  if (host !== "georgefarrowgreen.com") {
    const at = (sub) => `${location.protocol}//${sub}.${host}${location.port ? ":" + location.port : ""}/`;
    $("#app-inflight").href = at("chat"); $("#app-weather").href = at("weather");
  }
}
// Sign in: off to the account's page, its sky coming in as it goes (handOff)
$("#sign-in").addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  handOff(e.currentTarget.href);
});
// Leaving for one of the apps, or the account's page (on addresses of their own, so nothing can carry across): the page
// steps back a touch as it goes (styles.css body.leaving), so the tap's seen to have been taken while the next one loads
for (const a of $$("#app-inflight, #app-weather, [data-account]")) a.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  body.classList.add("leaving");
  setTimeout(() => body.classList.remove("leaving"), 4000);    // (in case it never goes)
});
addEventListener("pageshow", () => body.classList.remove("leaving"));   // (back again, from the browser's history)

/* ---------------- sheets ---------------- */
// A sheet glides up and the page steps back behind it (styles.css: --ease-glide). Dragged down by its top it follows the
// finger, the page coming forward with it; let go, it springs back, or carries on down at the speed it was thrown. Closed
// while it's still coming up, or opened again while it's going, it carries on from where it is rather than jumping.
let lastFocus = null;
const spring = () => getComputedStyle(root).getPropertyValue("--ease-spring").trim() || "cubic-bezier(0.2, 1.1, 0.4, 1)";
const behind = [$("#page"), $("#bar")];
// (where it is now, mid-way through any of that)
const currentY = (el) => { const t = getComputedStyle(el).transform; return t && t !== "none" ? new DOMMatrixReadOnly(t).m42 : 0; };
function openSheet(d) {
  const going = d.classList.contains("closing");
  if (!d.open) lastFocus = document.activeElement;
  if (going) {
    const y = currentY(d);
    clearTimeout(d._done); d._throw?.cancel(); d._throw = null;
    d.getAnimations().forEach((a) => a.cancel());
    d.classList.remove("closing"); d.classList.add("shown");
    d.style.transform = ""; d.style.removeProperty("--from");
    if (!motion.matches && y) d.animate([{ transform: `translateY(${y}px)` }, { transform: "none" }], { duration: 500, easing: GLIDE });
  } else if (!d.open) d.classList.remove("shown");
  if (!d.open) d.showModal();
  pin();
  // (the sheet itself takes the focus, not its first button, which a phone would ring as if it had been chosen)
  $(".sheet-in", d).focus({ preventScroll: true });
  body.classList.add("sheet-up");
  hold();
}
// The page held still behind a sheet, pinned where it's scrolled to (an iPhone draws the caret of a field in a sheet as
// far out as the page behind is scrolled, once the keyboard's up); what moves with the scroll held as it looks, as
// pinned there's no scroll for it to follow, and let go with it
const STILL = ["opacity", "transform", "visibility", "animation-name"];
let stills = [];
function pin() {
  if (pinned !== null) return;
  pinned = scrollY;
  stills = $$(".bar .mid, .barbg, #soft, .hero > *").map((el) => {
    const cs = getComputedStyle(el), was = STILL.map((k) => el.style.getPropertyValue(k));
    for (const k of STILL) el.style.setProperty(k, k === "animation-name" ? "none" : cs.getPropertyValue(k));
    return [el, was];
  });
  Object.assign(body.style, { position: "fixed", top: `${-pinned}px`, left: "0", right: "0" });
}
function unpin() {
  if (pinned === null) return;
  const y = pinned;
  Object.assign(body.style, { position: "", top: "", left: "", right: "" });
  scrollTo({ top: y, behavior: "instant" });
  pinned = null;
  for (const [el, was] of stills) STILL.forEach((k, i) => (was[i] ? el.style.setProperty(k, was[i]) : el.style.removeProperty(k)));
  stills = [];
  window.redrawScroll?.();
}
function finishClose(d) {
  clearTimeout(d._done); d._throw = null;
  d.classList.remove("closing", "dragging", "shown");
  d.style.transform = ""; d.style.removeProperty("--from");
  if (d.open) d.close();
}
function closeSheet(d, thrown = null) {
  if (!d.open || d.classList.contains("closing")) return;
  body.classList.remove("sheet-up", "pulling");
  unpin();
  for (const el of behind) el.style.transform = "";
  hold();
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
function settle(d, change, inEl) {
  const box = $(".sheet-in", d), h0 = box.getBoundingClientRect().height;
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
    if (e.target !== d || e.pseudoElement) return;
    if (d.classList.contains("closing")) { if (!d._throw) finishClose(d); }
    else d.classList.add("shown");
  });
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => { body.classList.remove("sheet-up"); unpin(); hold(); lastFocus?.focus?.({ preventScroll: true }); });
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
    const y = Math.max(0, currentY(d));
    for (const el of behind) el.style.transform = getComputedStyle(el).transform;
    d.getAnimations().forEach((a) => a.cancel());
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
    if (dy && !motion.matches) d.animate([{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }], { duration: 600, easing: spring() });
  };
  d.addEventListener("pointerup", end);
  d.addEventListener("pointercancel", end);
}
// On a phone, the keyboard covers the foot of the screen, not the page's: a sheet's lifted above it (smoothly: styles.css)
if (window.visualViewport) {
  const vv = window.visualViewport;
  let kb = 0, moved = null;
  const lift = () => {
    const k = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    if (k !== kb) {
      kb = k; root.style.setProperty("--kb", k + "px");
      // (the sheet moved under the field being typed in: its caret drawn again once it's settled, styles.css)
      clearTimeout(moved); moved = setTimeout(recaret, 400);
    }
  };
  vv.addEventListener("resize", lift); vv.addEventListener("scroll", lift);
  // (and measured every frame while something in a sheet's being typed in: an iPhone doesn't always say when it moves
  // its view of the page under the keyboard, and a sheet left where it was stands off the keyboard, or under it)
  let watching = false;
  const watch = () => {
    if (!typingInSheet()) { watching = false; return; }
    lift(); requestAnimationFrame(watch);
  };
  document.addEventListener("focusin", () => { if (!watching && typingInSheet()) { watching = true; watch(); } });
  window.relift = lift;
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
  fadeText($(".lbl", b), t);
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
const contact = { sheet: $("#contact-sheet"), form: $("#contact-form"), sent: $("#contact-sent"), err: $("#contact-err"), send: $("#contact-send") };
for (const b of $$("[data-contact]")) b.addEventListener("click", () => {
  contact.form.hidden = false; contact.sent.hidden = true; contact.err.hidden = true;
  // (their own details, if those are still what the fields hold: that row again, rather than the two fields)
  fromMe();
  ready();
  openSheet(contact.sheet);
  grow(); fit();
  const empty = ["#c-name", "#c-email", "#c-message"].map((s) => $(s)).find((el) => !el.value);
  // (on a phone the keyboard would cover the sheet as it opens: there, a tap on a field brings it up)
  if (!phone.matches) (empty || $("#c-message")).focus();
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
function morphFrom(on) {
  const d = contact.sheet, box = $(".sheet-in", d), s = $("#sender"), from = $("#from"), rows = $$("label.fld", s);
  const words = [[$("#c-name"), $("#from-name")], [$("#c-email"), $("#from-email")]];
  const swap = () => { from.hidden = !on; s.classList.toggle("known", on); if (!on) fit(); };
  for (const el of [box, s, ...$$("*", s)]) for (const a of el.getAnimations()) a.cancel();
  if (motion.matches || !d.open) { swap(); return steady(); }
  // (where everything is now: the sheet, the box, each line of words; and what's leaving, copied to fade where it was)
  const at = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, h: r.height }; };
  const hBox = box.getBoundingClientRect().height, hS = s.getBoundingClientRect().height, sAt = s.getBoundingClientRect();
  const y0 = $("#c-message").getBoundingClientRect().top, st = box.scrollTop;
  const was = words.map((w) => at(w[on ? 0 : 1])), size = words.map((w) => parseFloat(getComputedStyle(w[on ? 0 : 1]).fontSize));
  const ghosts = (on ? rows : [from]).map((el) => {
    const r = el.getBoundingClientRect(), g = el.cloneNode(true);
    g.removeAttribute("id"); g.classList.add("ghost"); g.hidden = false; g.setAttribute("aria-hidden", "true"); g.inert = true;
    for (const x of $$("[id]", g)) x.removeAttribute("id");
    for (const x of $$("input, b, small", g)) x.style.visibility = "hidden";      // (the words themselves are moving)
    Object.assign(g.style, { position: "absolute", left: `${r.left - sAt.left}px`, top: `${r.top - sAt.top}px`, width: `${r.width}px`, height: `${r.height}px`, pointerEvents: "none", margin: 0 });
    s.append(g);
    return g;
  });
  swap();
  // (and where it all goes)
  const hBox1 = box.getBoundingClientRect().height, hS1 = s.getBoundingClientRect().height;
  const T = 520, slide = { duration: T, easing: GLIDE };
  box.animate([{ height: `${hBox}px`, overflow: "hidden" }, { height: `${hBox1}px`, overflow: "hidden" }], slide);
  s.animate([{ height: `${hS}px` }, { height: `${hS1}px` }], slide).finished.then(steady, () => {});
  box.scrollTop = st;       // (cut back, for the moment the rows were at their new size before that took over)
  // (and the message, being typed in, kept where it is on the screen all the while: with the keyboard up the sheet's
  // at its tallest and scrolled within, so as the rows close up above it the scroll's moved with them, and it's the
  // top of the sheet that closes in; an iPhone wouldn't move its caret with it)
  const msg = $("#c-message"), until = performance.now() + T + 60;
  const keep = () => {
    const dy = msg.getBoundingClientRect().top - y0;
    if (Math.abs(dy) > 0.5 && box.scrollHeight > box.clientHeight) box.scrollTop += dy;
    if (performance.now() < until) requestAnimationFrame(keep);
  };
  if (document.activeElement === msg) { caretHidden(); requestAnimationFrame(keep); }
  words.forEach(([input, shown], i) => {
    const el = on ? shown : input, to = at(el), k = size[i] / parseFloat(getComputedStyle(el).fontSize);
    el.animate([{ transformOrigin: "0 50%", transform: `translate(${was[i].x - to.x}px, ${was[i].y - to.y}px) scale(${k})` }, { transformOrigin: "0 50%", transform: "none" }], slide);
  });
  // (the labels or the face and Change: out quickly where they were, the others in a moment after, rising to their place)
  for (const g of ghosts) g.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: on ? "translateX(-10px)" : "scale(0.96)" }], { duration: 220, easing: EASE_OUT, fill: "forwards" }).finished.then(() => g.remove(), () => g.remove());
  const arriving = on ? [$("#from-face"), $("#from-change")] : rows.map((r) => $("span", r));
  arriving.forEach((el, i) => el.animate(on ? [{ opacity: 0, transform: "scale(0.5)" }, { opacity: 1, transform: "none" }] : [{ opacity: 0, transform: "translateX(-10px)" }, { opacity: 1, transform: "none" }],
    { duration: 420, delay: 120 + i * 50, easing: on ? "cubic-bezier(0.2, 1.3, 0.4, 1)" : EASE_OUT, fill: "backwards" }));
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
  if (document.activeElement === t) setTimeout(steady, 260);      // (once it's grown: styles.css)
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
  try {
    await api("/api/contact", { method: "POST", body: msg });
    $("#c-message").value = "";
    $("#thanks").textContent = `Thanks, ${msg.name.split(/\s+/)[0]}. You’ll hear back by email.`;
    settle(contact.sheet, () => { contact.form.hidden = true; contact.sent.hidden = false; }, contact.sent);
    $("button", contact.sent).focus();
  } catch (err) {
    // (too slow to answer, it may have gone all the same: said so, so it isn't sent twice without a thought)
    say(err.slow ? "That’s taking too long. It may still have sent: if you don’t hear back in a day or two, try again." : err.message);
  }
  busyLabel(contact.send, "Send", false); ready(); grow();
  // (Send, busy, couldn't keep the focus, which went from the sheet with it: back to it, if it's gone nowhere else)
  if (contact.sheet.open && !contact.form.hidden && document.activeElement === document.body) contact.send.focus({ preventScroll: true });
});

/* ---------------- editing (the owner): the words in place ---------------- */
const editables = $$("[data-edit]"), hero = $(".hero");
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
  hero.style.paddingTop = `${$(".eyebrow", hero).offsetTop}px`; hero.style.justifyContent = "flex-start";
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
  window.redrawScroll();
  // (every line in sight once the page is back at the top, the scroll bringing them back as it goes, not snapped in first)
  const linesOn = () => { if (editing) body.classList.add("lines-on"); };
  if (scrollY < 2 || motion.matches) { scrollTo({ top: 0 }); linesOn(); }
  else {
    const t = setTimeout(linesOn, 800);
    addEventListener("scrollend", () => { clearTimeout(t); linesOn(); }, { once: true });
    scrollTo({ top: 0, behavior: "smooth" });
  }
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
  hero.style.paddingTop = ""; hero.style.justifyContent = "";
  if (!motion.matches) lines.forEach((el, i) => { const d = tops[i] - el.getBoundingClientRect().top; if (Math.abs(d) > 1) el.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 350, easing: EASE_OUT }); });
  window.redrawScroll();
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
  const now = forScreen();
  if (now.map((p) => p.id).join() !== shown.map((p) => p.id).join()) return updateSlides();
  shown = now;
  [...bgEl.children].forEach((s, i) => { if (now[i]) s.style.objectPosition = s.style.transformOrigin = now[i].focus || "50% 50%"; });
  if (at >= 0 && now[at]) $("#soft").style.setProperty("--soft-pos", now[at].focus || "50% 50%");
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
      // (a minute and a half to go up, as InFlight gives a file: it's megabytes, and a phone's signal sends slowly)
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
loadPhotos();
loadMe();
