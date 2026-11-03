// Scanning a friend's safety number under the roof (stage 3 spec §2.2; Chat's startScan, pigeon/app.js): the camera in
// the page, the browser's own QR reader where there is one, else jsQR (../jsqr.js, loaded here through fw.lazy);
// network-only (not kept offline). Only the code's digits are compared, here; a match is the core's verify (public keys
// only). Frozen opener: openScan(ctx) → sheet Handle (data-sheet=scan).
//   Added (optional): openScan(ctx, { id, digits }) checks against that one friend's number (from their Safety Number);
//   with none, it's "Verify a Friend": whichever friend's number it is (each asked of the core's safety()).
//   A changed key is never trusted from here: that friend's Safety Number opens instead.
export const PREFIX = "inflight-safety:";
const codeOf = (d) => `inflight-safety:1:${(Array.isArray(d) ? d.join("") : String(d || "")).replace(/\D/g, "")}`;
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";

// what a scanned text means: { hit: id } (that friend's number), { bad: true } (a safety number, not one of these),
// or null (not a safety number: keep looking)
export function matchCode(text, want) {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) return null;
  for (const [id, code] of want) if (code === text) return { hit: id };
  return { bad: true };
}

export function openScan(ctx, one = null) {
  const { fw, svc, store, open = {} } = ctx, ui = fw.ui, el = ui.el;
  const friends = () => store?.get?.("friends") || [];
  const nameOf = (id) => first(friends().find((f) => f.id === id)?.name || "your friend");
  const want = new Map();
  let stream = null, on = true, timer = 0;
  const video = el("video", { playsinline: "", muted: "", autoplay: "", "aria-label": "Camera", class: "chsc-video" });
  const msg = el("p", { class: "chs-foot", "aria-live": "polite", text: one ? `Point your camera at ${nameOf(one.id)}’s code.` : "Point your camera at your friend’s code. On their phone, they open Safety Number from your name." });
  const again = el("div", { class: "chs-acts" });
  const stop = () => { on = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); stream = null; };
  const h = fw.sheet.open({ sheet: "scan", title: "Scan Their Code", app: "chats", onClose: stop,
    body: (b) => b.append(el("div", { class: "chs chsc" }, el("div", { class: "chsc-box" }, video, el("span", { class: "chsc-frame", "aria-hidden": "true" })), msg, again)) });

  async function codes() {
    if (one) { want.set(one.id, codeOf(one.digits)); return; }
    await Promise.all(friends().map((f) => svc.call("safety", f.id).then((s) => { if (s?.digits) want.set(f.id, codeOf(s.digits)); }, () => {})));
  }
  async function start() {
    again.replaceChildren();
    on = true;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
    catch (_) { msg.textContent = "Chats can’t use the camera here. Compare the 60 digits instead."; return; }
    if (!on || h.closed) { stop(); return; }
    video.addEventListener("playing", () => video.classList.add("on"), { once: true });
    video.srcObject = stream;
    await video.play?.().catch?.(() => {});
    let det = null;
    try { if ("BarcodeDetector" in globalThis && (await globalThis.BarcodeDetector.getSupportedFormats()).includes("qr_code")) det = new globalThis.BarcodeDetector({ formats: ["qr_code"] }); } catch (_) {}
    let jsQR = null;
    if (!det) { try { jsQR = (await fw.lazy((q) => import("../jsqr.js" + q))).default; } catch (_) { msg.textContent = "Scanning needs a connection. Compare the 60 digits instead."; stop(); return; } }
    const c = el("canvas"), g = c.getContext?.("2d", { willReadFrequently: true });
    const look = async () => {
      if (!on || h.closed) return;
      let text = null;
      if (video.readyState >= 2 && video.videoWidth) {
        if (det) text = (await det.detect(video).catch(() => []))[0]?.rawValue || null;
        else if (g) { const w = c.width = Math.min(640, video.videoWidth), hh = c.height = Math.round((w * video.videoHeight) / video.videoWidth); g.drawImage(video, 0, 0, w, hh); text = jsQR(g.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: "attemptBoth" })?.data || null; }
      }
      const r = matchCode(text, want);
      if (r) return found(r);
      timer = setTimeout(look, 150);
    };
    look();
  }
  async function found(r) {
    stop();
    if (r.bad) {
      msg.textContent = one ? `This isn’t the same safety number. Don’t trust this chat with ${nameOf(one.id)} until your codes match.` : "That code isn’t your safety number with any of your friends. On their phone, they open Safety Number from your name.";
      again.append(ui.btn("Try Again", { act: "again", run: start }));
      return;
    }
    const f = friends().find((x) => x.id === r.hit);
    if (f?.keyChanged) { h.close(); open.openSafety?.(ctx, r.hit); return; }
    try { await svc.call("verify", r.hit, true); fw.toast(`Verified. Your safety numbers match, so only you and ${nameOf(r.hit)} can read your messages.`); }
    catch (e) { fw.toast(e?.why === "offline" ? "No signal. Try again when you’re back online." : "Couldn’t mark it verified. Try again."); }
    h.close();
    if (!one) open.openSafety?.(ctx, r.hit);
  }
  codes().then(start);
  return h;
}
