/* ----------------------------------------------------------------------
   georgefarrowgreen.com: the home page.
   - The words (/api/content), the photos behind them as a slideshow (/api/background)
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

const DEFAULTS = {
  name: "George Farrow-Green",
  role: "Photography · Cycling · Apps",
  bio: "I ride, I take photos on the road and in the hills, and I build small apps for the people around me.",
};
let content = { ...DEFAULTS };
let me = null;           // /api/me, once it's known
let editing = false;

// The server's answer, or an Error saying what went wrong
async function api(path, { method = "GET", body: data } = {}) {
  const r = await fetch(path, {
    method, cache: "no-store", credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong. Try again.");
  return d;
}

/* ---------------- the words ---------------- */
function showContent() {
  for (const el of $$("[data-c]")) if (!(editing && el.hasAttribute("data-edit"))) el.textContent = content[el.dataset.c] || "";
  document.title = content.name;
  const ld = $("#ld-person");
  if (ld) ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "Person", name: content.name, description: content.bio,
    url: "https://georgefarrowgreen.com/", sameAs: ["https://instagram.com/georgefarrowgreen"] });
}
async function loadContent() {
  try { content = { ...DEFAULTS, ...(await api("/api/content")) }; } catch (_) {}
  if (!editing) showContent();
}

/* ---------------- scrolling: the name comes into the bar, the hero fades under it ---------------- */
{
  const bar = $("#bar"), soft = $("#soft"), fades = $$(".hero > *");
  let queued = false;
  const draw = () => {
    queued = false;
    const y = scrollY, k = clamp((y - 220) / 260);
    root.style.setProperty("--k", k.toFixed(3));
    soft.style.visibility = k > 0 ? "visible" : "hidden";
    const edge = bar.getBoundingClientRect().bottom;
    for (const el of fades) el.style.opacity = editing ? "" : Math.max(clamp((el.getBoundingClientRect().top - edge + 12) / 90), clamp(1 - y / 40)).toFixed(3);
  };
  const ask = () => { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  addEventListener("scroll", ask, { passive: true });
  addEventListener("resize", ask);
  window.redrawScroll = ask;
  draw();
}

/* ---------------- the photos: a slideshow, the set for this screen ---------------- */
const SLIDE = 7000;
let photos = [], shown = [], at = 0, timer = null, firstBuild = true;
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
const photoUrl = (p) => `/api/background?id=${encodeURIComponent(p.id)}`;
function buildSlides() {
  clearTimeout(timer);
  bgEl.textContent = ""; segsEl.textContent = "";
  shown = forScreen(); at = 0;
  shown.forEach((p, i) => {
    const s = document.createElement("div");
    s.className = "slide";
    s.style.backgroundPosition = p.focus || "50% 50%";
    s.style.transformOrigin = p.focus || "50% 50%";
    // (the first, the first time: the address the page asked for early, so it's already on its way)
    if (i === 0 && firstBuild) s.dataset.src = `/api/background?id=cover&d=${phone.matches ? "mobile" : "desktop"}`;
    bgEl.append(s);
    segsEl.append(document.createElement("i"));
  });
  firstBuild = false;
  segsEl.classList.toggle("one", shown.length < 2);
  if (shown.length) show(0);
}
// (each photo's fetched as it's about to show, not all at once)
function load(i) {
  const s = bgEl.children[i];
  if (s && !s.style.backgroundImage) s.style.backgroundImage = `url("${s.dataset.src || photoUrl(shown[i])}")`;
}
function show(i) {
  clearTimeout(timer);
  const slides = bgEl.children;
  if (!slides.length) return;
  slides[at]?.classList.remove("on");
  at = i;
  load(i); load((i + 1) % slides.length);
  slides[i].classList.add("on");
  $$("i", segsEl).forEach((seg, j) => {
    seg.classList.remove("on");
    seg.classList.toggle("past", j < i);
    if (j === i) { void seg.offsetWidth; seg.classList.add("on"); }
  });
  if (slides.length > 1 && !motion.matches && !document.hidden) timer = setTimeout(() => show((at + 1) % slides.length), SLIDE);
}
// (a different set when the screen changes size past a phone's, only if it's actually different)
phone.addEventListener("change", () => { if (forScreen().map((p) => p.id).join() !== shown.map((p) => p.id).join()) buildSlides(); });
document.addEventListener("visibilitychange", () => {
  body.classList.toggle("paused", document.hidden);
  if (document.hidden) clearTimeout(timer); else if (shown.length) show(at);
});
motion.addEventListener("change", () => shown.length && show(at));

/* ---------------- who's looking ---------------- */
const plural = (n, one, many = one + "s") => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
async function loadMe() {
  try { me = await api("/api/me"); } catch (_) { me = { signedIn: false }; }
  showMe();
}
function showMe() {
  if (me.account) for (const a of $$("[data-account]")) a.href = me.account + "/";
  body.classList.toggle("signed", !!me.signedIn);
  body.classList.toggle("owner", !!me.owner);
  body.classList.add("known");
  const face = $("#face");
  face.textContent = "";
  if (me.signedIn && me.photoAt) {
    const img = document.createElement("img");
    img.src = `/api/me/photo?v=${me.photoAt}`; img.alt = "";
    face.append(img);
  } else if (me.signedIn) {
    face.textContent = (me.name || "?").trim().charAt(0).toUpperCase();
  }
  $("#me").setAttribute("aria-label", me.signedIn ? `Your account (${me.name})` : "Your account");
  // each app's line: theirs when they use it, what it is otherwise
  const a = me.signedIn ? me.apps || {} : {};
  const line = {
    inflight: a.inflight && `${plural(a.inflight.friends, "friend")} · ${a.inflight.sent.toLocaleString("en-GB")} sent`,
    weather: a.weather && `${plural(a.weather.places, "place")} · Alerts ${a.weather.alerts ? "on" : "off"}`,
  };
  for (const key of ["inflight", "weather"]) {
    const small = $(`#app-${key} small`);
    small.textContent = line[key] || small.dataset.about;
    small.classList.toggle("mine", !!line[key]);
  }
  // a message from them is from them: their name and email filled in, shown as one From row
  if (me.signedIn && me.name && me.email) {
    if (!$("#c-name").value) $("#c-name").value = me.name;
    if (!$("#c-email").value) $("#c-email").value = me.email;
    $("#from-name").textContent = me.name; $("#from-email").textContent = me.email;
    $("#from-face").replaceChildren(...[...face.childNodes].map((n) => n.cloneNode(true)));
    if (!face.childNodes.length) $("#from-face").textContent = face.textContent;
    $("#from").hidden = false; $("#sender").classList.add("known");
  }
}
// the apps' own addresses, from this one (the site's, or a test's or a preview's)
{
  const host = location.hostname.replace(/^www\./, "");
  if (host !== "georgefarrowgreen.com") {
    const at = (sub) => `${location.protocol}//${sub}.${host}${location.port ? ":" + location.port : ""}/`;
    $("#app-inflight").href = at("chat"); $("#app-weather").href = at("weather");
  }
}

/* ---------------- sheets ---------------- */
let lastFocus = null;
function openSheet(d) {
  lastFocus = document.activeElement;
  d.classList.remove("closing");
  d.showModal();
  // (the sheet itself takes the focus, not its first button, which a phone would ring as if it had been chosen)
  $(".sheet-in", d).focus({ preventScroll: true });
  body.classList.add("sheet-up");
}
function closeSheet(d) {
  if (!d.open || d.classList.contains("closing")) return;
  body.classList.remove("sheet-up");
  const done = () => { d.classList.remove("closing", "dragging"); d.style.transform = ""; d.close(); };
  if (motion.matches) return done();
  d.classList.add("closing");
  setTimeout(done, 230);
}
for (const d of $$("dialog.sheet")) {
  d.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(d); });
  d.addEventListener("close", () => { body.classList.remove("sheet-up"); lastFocus?.focus?.({ preventScroll: true }); });
  // (a tap on the dimmed page closes it: the sheet's own padding is inside .sheet-in, so only the backdrop is the dialog itself)
  d.addEventListener("click", (e) => { if (e.target === d) closeSheet(d); });
  for (const x of $$("[data-close]", d)) x.addEventListener("click", () => closeSheet(d));
  // the page behind doesn't scroll while a sheet's up: only what scrolls inside the sheet does
  let free = false;
  d.addEventListener("touchstart", (e) => { free = e.touches.length > 1 || scrollsIn(e.target, d); }, { passive: true });
  d.addEventListener("touchmove", (e) => { if (!free && e.cancelable) e.preventDefault(); }, { passive: false });
  d.addEventListener("wheel", (e) => { if (!scrollsIn(e.target, d) && e.cancelable) e.preventDefault(); }, { passive: false });
  // swiped down by its top, it goes
  let y0 = null, dy = 0, t0 = 0;
  d.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".grab, .sheet-head") || e.target.closest("button, input, a")) return;
    y0 = e.clientY; t0 = e.timeStamp; dy = 0;
    d.setPointerCapture(e.pointerId); d.classList.add("dragging");
  });
  d.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    d.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    const fast = dy / Math.max(1, performance.now() - t0) > 0.6;
    y0 = null; d.classList.remove("dragging");
    if (dy > 110 || (fast && dy > 30)) closeSheet(d); else d.style.transform = "";
  };
  d.addEventListener("pointerup", end);
  d.addEventListener("pointercancel", end);
}
// On a phone, the keyboard covers the foot of the screen, not the page's: a sheet's lifted above it
if (window.visualViewport) {
  const vv = window.visualViewport;
  const lift = () => root.style.setProperty("--kb", Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) + "px");
  vv.addEventListener("resize", lift); vv.addEventListener("scroll", lift);
}
// (whether what's under a finger, inside a sheet, would scroll itself: a list longer than it is, or a field)
function scrollsIn(el, top) {
  if (el.closest?.("input, textarea, [contenteditable]")) return true;
  for (; el && el !== top; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return true;
  }
  return false;
}

/* ---------------- a word at the foot, with Undo where it can be ---------------- */
let toastTimer = null;
function toast(text, undo) {
  const t = $("#toast"), b = $("#toast-undo");
  $("#toast-text").textContent = text;
  b.hidden = !undo;
  b.onclick = undo ? () => { t.hidden = true; undo(); } : null;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, undo ? 6000 : 2600);
}

/* ---------------- Get in touch ---------------- */
const contact = { sheet: $("#contact-sheet"), form: $("#contact-form"), sent: $("#contact-sent"), err: $("#contact-err"), send: $("#contact-send") };
for (const b of $$("[data-contact]")) b.addEventListener("click", () => {
  contact.form.hidden = false; contact.sent.hidden = true; contact.err.hidden = true;
  ready();
  openSheet(contact.sheet);
  grow();
  const empty = ["#c-name", "#c-email", "#c-message"].map((s) => $(s)).find((el) => !el.value);
  // (on a phone the keyboard would cover the sheet as it opens: there, a tap on a field brings it up)
  if (!phone.matches) (empty || $("#c-message")).focus();
});
// (their own details changed for this message: the two rows instead)
$("#from-change").addEventListener("click", () => { $("#from").hidden = true; $("#sender").classList.remove("known"); $("#c-name").focus(); });
// Send is there once there's something to send; the message grows as it's written
const ready = () => { contact.send.disabled = !["#c-name", "#c-email", "#c-message"].every((sel) => $(sel).value.trim()); };
const grow = () => { const t = $("#c-message"); t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
contact.form.addEventListener("input", (e) => { contact.err.hidden = true; ready(); if (e.target.id === "c-message") grow(); });
contact.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = { name: $("#c-name").value.trim(), email: $("#c-email").value.trim(), message: $("#c-message").value.trim(), website: $("#c-website").value };
  const say = (t) => { contact.err.textContent = t; contact.err.hidden = !t; };
  if (!msg.name || !msg.email || !msg.message) return say("Please add your name, your email and a message.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(msg.email)) return say("That email doesn’t look right.");
  say(""); contact.send.disabled = true; contact.send.textContent = "Sending…";
  try {
    await api("/api/contact", { method: "POST", body: msg });
    $("#c-message").value = "";
    $("#thanks").textContent = `Thanks, ${msg.name.split(/\s+/)[0]}. You’ll hear back by email.`;
    contact.form.hidden = true; contact.sent.hidden = false;
    $("button", contact.sent).focus();
  } catch (err) { say(err.message); }
  contact.send.textContent = "Send"; ready(); grow();
});

/* ---------------- editing (the owner): the words in place ---------------- */
const editables = $$("[data-edit]");
let before = null;
function startEdit() {
  if (editing || !me?.owner) return;
  editing = true; before = { ...content };
  body.classList.add("edit");
  for (const el of editables) {
    // (plain text where the browser has it; where it doesn't, what's pasted is made plain below)
    try { el.contentEditable = "plaintext-only"; } catch (_) {}
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.spellcheck = true;
  }
  window.redrawScroll();
  scrollTo({ top: 0, behavior: motion.matches ? "auto" : "smooth" });
}
async function endEdit(keep = true) {
  if (!editing) return;
  const next = { role: text($("[data-c=role][data-edit]")), name: text($("[data-c=name][data-edit]")), bio: text($("[data-c=bio][data-edit]")) };
  for (const el of editables) el.removeAttribute("contenteditable");
  document.activeElement?.blur?.();
  editing = false; body.classList.remove("edit");
  window.redrawScroll();
  if (!keep || ["role", "name", "bio"].every((k) => next[k] === before[k])) return showContent();
  showContent();
  try {
    content = { ...DEFAULTS, ...(await api("/api/content", { method: "PUT", body: next })).content };
    showContent();
    toast("Saved", async () => {
      try { content = { ...DEFAULTS, ...(await api("/api/history", { method: "POST", body: { index: 0 } })).content }; showContent(); toast("Undone"); }
      catch (err) { toast(err.message); }
    });
  } catch (err) { content = before; showContent(); toast(err.message); }
}
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
// (leaving with the words half changed: the browser asks first)
addEventListener("beforeunload", (e) => { if (editing) e.preventDefault(); });

/* ---------------- the photos, changed from their sheet ---------------- */
const ph = { sheet: $("#photos-sheet"), tiles: $("#tiles"), err: $("#photos-err"), input: $("#photo-input"), add: $("#add-photos") };
const WHERE = { both: "Both", mobile: "Phone", desktop: "Computer" }, NEXT = { both: "mobile", mobile: "desktop", desktop: "both" };
function showThumbs() {
  const t = $("#thumbs");
  t.textContent = "";
  for (const p of photos.slice(0, 4)) {
    const i = document.createElement("i");
    i.style.backgroundImage = `url("${photoUrl(p)}")`;
    t.append(i);
  }
}
function photosSaid(t) { ph.err.textContent = t || ""; ph.err.hidden = !t; }
function showTiles() {
  ph.tiles.textContent = "";
  if (!photos.length) {
    const p = document.createElement("p");
    p.className = "none"; p.textContent = "No photos yet.";
    ph.tiles.append(p);
    return;
  }
  for (const p of photos) {
    const tile = document.createElement("div");
    tile.className = "tile";
    const img = document.createElement("img");
    img.src = photoUrl(p); img.alt = ""; img.decoding = "async";
    img.style.objectPosition = p.focus || "50% 50%";
    const dot = document.createElement("span");
    dot.className = "dot";
    const [fx, fy] = (p.focus || "50% 50%").split(" ");
    dot.style.left = fx; dot.style.top = fy;
    const where = document.createElement("button");
    where.type = "button"; where.className = "where";
    where.textContent = WHERE[p.device || "both"];
    where.setAttribute("aria-label", `Shows on: ${WHERE[p.device || "both"]}. Change`);
    const rm = document.createElement("button");
    rm.type = "button"; rm.className = "rm"; rm.setAttribute("aria-label", "Remove this photo");
    rm.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    const change = async (method, data) => {
      tile.classList.add("busy"); photosSaid("");
      try { photos = (await api("/api/background", { method, body: { id: p.id, ...data } })).images || []; }
      catch (err) { photosSaid(err.message); }
      photosChanged();
    };
    // (a tap on the photo: the point that stays in view as the screen crops it)
    img.addEventListener("click", (e) => {
      const r = img.getBoundingClientRect();
      const x = Math.round(clamp((e.clientX - r.left) / r.width) * 100), y = Math.round(clamp((e.clientY - r.top) / r.height) * 100);
      change("POST", { focus: `${x}% ${y}%` });
    });
    where.addEventListener("click", () => change("POST", { device: NEXT[p.device || "both"] }));
    rm.addEventListener("click", () => { if (confirm("Remove this photo from the slideshow?")) change("DELETE", {}); });
    tile.append(img, dot, where, rm);
    ph.tiles.append(tile);
  }
}
function photosChanged() { showTiles(); showThumbs(); buildSlides(); }
$("#change-photos").addEventListener("click", () => { photosSaid(""); showTiles(); openSheet(ph.sheet); });
ph.add.addEventListener("click", () => ph.input.click());
ph.input.addEventListener("change", async () => {
  const files = [...(ph.input.files || [])].filter((f) => f.type.startsWith("image/"));
  ph.input.value = "";
  if (!files.length) return;
  photosSaid(""); ph.add.disabled = true;
  try {
    for (const [i, f] of files.entries()) {
      ph.add.textContent = files.length > 1 ? `Adding ${i + 1} of ${files.length}…` : "Adding…";
      photos = (await api("/api/background", { method: "PUT", body: { image: await shrink(f, 2000) } })).images || photos;
      photosChanged();
    }
  } catch (err) { photosSaid(err.message === "Invalid or oversized image." ? "That photo couldn’t be added. Try a smaller one." : err.message); }
  ph.add.disabled = false; ph.add.textContent = "Add photos";
});
// a photo at most max pixels on its longer side, as a JPEG
function shrink(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn’t a photo this browser can open.")); };
    img.src = url;
  });
}

/* ---------------- no zooming, and no copying outside the fields ---------------- */
const inField = (el) => !!el?.closest?.("input, textarea, [contenteditable]");
for (const ev of ["copy", "cut"]) document.addEventListener(ev, (e) => { if (!inField(e.target)) e.preventDefault(); });
for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => e.preventDefault());
addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) e.preventDefault(); });

/* ---------------- start ---------------- */
$("#year").textContent = new Date().getFullYear();
loadContent();
loadPhotos();
loadMe();
