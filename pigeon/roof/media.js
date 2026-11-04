// Photos, voice pigeons and GIFs under the roof (stage 3 spec §2.2, §3.1, S3-D3): everything that touches the camera
// roll, the microphone or an object URL is here, in the page; the core only ever gets a Blob (sendBlob) and gives one
// back (photo). Lazy, kept offline (connector.lazy); GIF results are network-only ("Needs a connection").
// Frozen openers (ctx = { fw, svc, store, open }):
//   openGifs(ctx, id) → sheet Handle (data-sheet=gifs): search through Chat's server (meta gif-search; previews and
//     the GIF itself as Blobs through meta gif), the one picked sent sealed as a photo.
//   recordVoice(ctx, id) → sheet Handle (data-sheet=voice): MediaRecorder in the page, Stop & Send → sendBlob(…, "voice").
//   pickPhoto(ctx, id) → Promise<{ id } | null>: the phone's photo picker, the picture made smaller in the page if it's
//     big, then sendBlob(…, "photo").
// Added: blobUrl(blob) → { url, revoke() } (every object URL of the module is made here and let go of here; revokeAll()
//   on unmount), MIMES (what's recorded, in order of choice), VOICE_MAX.
export const VOICE_MAX = 120e3;
export const MIMES = Object.freeze(["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]);
export const PHOTO_EDGE = 2048;

const urls = new Set();
export function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  urls.add(url);
  return { url, revoke: () => { if (urls.delete(url)) URL.revokeObjectURL(url); } };
}
export function revokeAll() { for (const u of urls) URL.revokeObjectURL(u); urls.clear(); }
export const clip = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const say = (fw, e, what) => fw.toast(e?.why === "offline" ? "No signal. It’ll go when you’re back online." : what);

/* ---------- a photo from the phone ---------- */
// a big photo drawn smaller (its longest side PHOTO_EDGE), as JPEG; a GIF or a small one as it is
export async function shrink(blob) {
  try {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return blob;
    if (blob.size < 1.5e6 || typeof createImageBitmap !== "function") return blob;
    const bmp = await createImageBitmap(blob), k = Math.min(1, PHOTO_EDGE / Math.max(bmp.width, bmp.height));
    if (k >= 1) return blob;
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(globalThis.document.createElement("canvas"), { width: w, height: h });
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return c.convertToBlob ? await c.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : await new Promise((ok) => c.toBlob((b) => ok(b || blob), "image/jpeg", 0.85));
  } catch (_) { return blob; }
}
export function pickPhoto(ctx, id) {
  const { fw, svc } = ctx;
  return new Promise((resolve) => {
    const input = fw.ui.el("input", { type: "file", accept: "image/*", class: "chs-file", hidden: true, "aria-hidden": "true", tabindex: "-1" });
    let done = false;
    const end = (v) => { if (done) return; done = true; input.remove(); resolve(v); };
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      if (!f) return end(null);
      if (!/^image\//.test(f.type || "image/")) { fw.toast("That file couldn’t be opened as a photo."); return end(null); }
      try { end(await svc.call("sendBlob", id, await shrink(f), "photo")); }
      catch (e) { say(fw, e, "Couldn’t send the photo. Try again."); end(null); }
    });
    input.addEventListener("cancel", () => end(null));
    (fw.screenEl || globalThis.document.body).append(input);
    input.click();
  });
}

/* ---------- a voice pigeon ---------- */
export function recordVoice(ctx, id) {
  const { fw, svc } = ctx, ui = fw.ui, el = ui.el;
  let rec = null, raf = 0, stopping = false;
  const time = el("b", { class: "chv-time", text: "0:00", "aria-live": "off" });
  const wave = el("div", { class: "chv-wave", "aria-hidden": "true" });
  const note = el("p", { class: "chs-foot", role: "status", text: "Asking for the microphone…" });
  const send = ui.btn("Stop & Send", { primary: true, act: "send", run: () => stop(true) });
  send.disabled = true;
  const h = fw.sheet.open({ sheet: "voice", title: "Voice", app: "chats", onClose: () => stop(false),
    body: (b) => b.append(el("div", { class: "chs chv" }, time, wave, note, el("div", { class: "chs-acts" }, send, ui.btn("Cancel", { act: "cancel", run: () => h.close() })))) });
  async function start() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { note.textContent = e?.name === "NotAllowedError" ? "Chats needs the microphone for voice pigeons. You can allow it in Settings." : "Couldn’t use the microphone."; return; }
    if (h.closed) { stream.getTracks().forEach((t) => t.stop()); return; }
    const MR = globalThis.MediaRecorder, mime = MIMES.find((m) => MR?.isTypeSupported?.(m)) || "";
    let mr;
    try { mr = new MR(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined); }
    catch (_) { stream.getTracks().forEach((t) => t.stop()); note.textContent = "Couldn’t record on this phone."; return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext, ac = AC ? new AC() : null, an = ac ? ac.createAnalyser() : null;
    if (ac) { an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an); }
    rec = { stream, mr, ac, an, chunks: [], t0: performance.now(), mime: (mr.mimeType || mime || "audio/webm").split(";")[0], buf: an ? new Float32Array(an.fftSize) : null };
    mr.addEventListener("dataavailable", (e) => { if (e.data?.size) rec?.chunks.push(e.data); });
    mr.start(250);
    note.textContent = "Recording. Stop & Send when you’re done.";
    send.disabled = false;
    raf = requestAnimationFrame(frame);
  }
  function frame() {
    if (!rec) return;
    const ms = performance.now() - rec.t0;
    time.textContent = clip(ms);
    if (rec.an) {
      rec.an.getFloatTimeDomainData(rec.buf);
      let sum = 0; for (const v of rec.buf) sum += v * v;
      const i = el("i");
      i.style.setProperty("--h", (0.12 + 0.88 * Math.min(1, Math.sqrt(sum / rec.buf.length) * 4)).toFixed(2));
      wave.append(i);
      while (wave.children.length > 48) wave.firstElementChild.remove();
    }
    if (ms >= VOICE_MAX) { stop(true); return; }
    raf = requestAnimationFrame(frame);
  }
  async function stop(keep) {
    cancelAnimationFrame(raf);
    const r = rec; rec = null;
    if (!r || stopping) return;
    stopping = true;
    const ms = Math.min(VOICE_MAX, performance.now() - r.t0);
    await new Promise((res) => { r.mr.addEventListener("stop", res, { once: true }); try { if (r.mr.state !== "inactive") r.mr.stop(); else res(); } catch (_) { res(); } });
    r.stream.getTracks().forEach((t) => t.stop()); r.ac?.close?.().catch?.(() => {});
    if (!keep) return;
    if (ms < 800 || !r.chunks.length) { fw.toast("Hold on a little longer to record."); h.close(); return; }
    h.setBusy?.(true);
    try { await svc.call("sendBlob", id, new Blob(r.chunks, { type: r.mime }), "voice"); }
    catch (e) { say(fw, e, "Couldn’t send it. Try again."); }
    h.close();
  }
  start();
  return h;
}

/* ---------- GIFs (through Chat's server, so GIPHY never sees who's looking) ---------- */
export function openGifs(ctx, id) {
  const { fw, svc } = ctx, ui = fw.ui, el = ui.el;
  const meta = (name, args) => svc.call("meta", name, args);
  const s = { q: "", list: [], next: 0, busy: false, err: "", picking: null };
  const prev = new Map(), mine = [];
  const grid = el("div", { class: "chg-grid", role: "group", "aria-label": "GIFs" });
  const more = el("div", { class: "chs-acts" });
  let timer = 0;
  const field = ui.field({ type: "search", placeholder: "Search GIPHY", label: "Search GIFs", onInput: (v) => { clearTimeout(timer); timer = setTimeout(() => { s.q = String(v).trim().slice(0, 50); load(false); }, 350); } });
  field.dataset.act = "q";
  const h = fw.sheet.open({ sheet: "gifs", title: "GIFs", app: "chats", focus: field.input,
    onClose: () => { clearTimeout(timer); for (const u of mine) u.revoke(); },
    body: (b) => b.append(el("div", { class: "chs chg" }, field, grid, more, el("p", { class: "chs-foot", text: "Powered by GIPHY. Searches go through Chat, so GIPHY doesn’t see who’s looking. What you send is end-to-end encrypted." }))) });
  function draw() {
    grid.replaceChildren();
    more.replaceChildren();
    if (!s.list.length) { grid.append(el("p", { class: "chs-foot", text: s.err || (s.busy ? "Finding GIFs…" : "No GIFs found. Try another word.") })); return; }
    const cols = [el("div", { class: "chg-col" }), el("div", { class: "chg-col" })], hgt = [0, 0];
    for (const g of s.list) {
      const c = hgt[0] <= hgt[1] ? 0 : 1; hgt[c] += (g.h || 1) / (g.w || 1);
      const t = el("button", { type: "button", class: "chg-tile", data: { act: "gif", id: g.id }, "aria-label": g.title || "GIF" });
      t.style.setProperty("--ar", ((g.w || 1) / (g.h || 1)).toFixed(3));
      if (s.picking === g.id) t.classList.add("busy");
      const u = prev.get(g.id);
      if (u) t.append(el("img", { src: u, alt: "" }));
      t.addEventListener("click", () => pick(g));
      cols[c].append(t);
    }
    grid.append(...cols);
    if (s.next != null) more.append(ui.btn(s.busy ? "Loading…" : "More GIFs", { act: "more", run: () => load(true) }));
    for (const g of s.list) if (!prev.has(g.id)) {
      prev.set(g.id, "");
      meta("gif", { method: "GET", id: g.id, s: "p" }).then((b) => {
        if (h.closed || !b) return;
        const u = blobUrl(b); mine.push(u); prev.set(g.id, u.url);
        const t = grid.querySelector(`[data-id="${String(g.id).replace(/["\\]/g, "")}"]`);
        if (t && !t.querySelector("img")) t.prepend(el("img", { src: u.url, alt: "" }));
      }, () => prev.delete(g.id));
    }
  }
  async function load(more) {
    if (s.busy || (more && s.next == null)) return;
    s.busy = true; if (!more) s.list = []; draw();
    const q = s.q;
    try {
      const d = await meta("gif-search", { method: "GET", q, offset: more ? s.next : 0 });
      if (q !== s.q) return;
      const got = Array.isArray(d?.gifs) ? d.gifs : [];
      s.list = more ? [...s.list, ...got.filter((g) => !s.list.some((x) => x.id === g.id))] : got;
      s.next = d?.next ?? null; s.err = "";
    } catch (e) { s.err = e?.why === "offline" ? "GIFs need a connection." : "Couldn’t find GIFs just now."; }
    finally { s.busy = false; }
    if (!h.closed) draw();
  }
  async function pick(g) {
    if (s.picking) return;
    s.picking = g.id; draw();
    try {
      const b = await meta("gif", { method: "GET", id: g.id, s: "f" });
      if (!b) throw new Error("none");
      await svc.call("sendBlob", id, b, "photo");
      h.close();
    } catch (e) { s.picking = null; if (!h.closed) draw(); say(fw, e, "Couldn’t send that GIF. Try another."); }
  }
  load(false);
  return h;
}
