// Chats' service (One roof, stage 3: roof/s3/spec.md S3-D3, S3-D6, S3-D14, §5.2 S3-C3, §5.4): the one file under
// pigeon/roof/ that makes a Worker, loaded only by the frame (REGISTRY.chats.service; modules.js loadService), never by a
// module (roofcontract: no `from "./service.js"`, no `import("./service.js")`). One per page, held in the frame's state.
//
// ==== frozen by B0 (CORE writes the body) ====
// startService({ path, ui, onStale }) → Promise<Service>, resolved once the core has answered start (so the facade's
//   state is known when F.service resolves)
//   path: "/chats/"; ui: the Chats fw (F.forModule("chats"): ui.lazy, ui.toast, ui.on("push"), ui.sheet …);
//   onStale(): the core's PROTOCOL isn't ours (S1 D21's boundary reload: the frame sets F.stale).
// Service = {
//   protocol: PROTOCOL,
//   get state(): State                       the core's last state (core.js's STATES)
//   call(m, ...args) → Promise<v>            one RPC of core.js's RPC table; rejects with an Error whose why is one of WHY
//   on(topic, fn) → off                      topic: a core topic ("rows", "chat:<id>", …), a prefix ("chat:", "typing:")
//                                            for every topic under it, or "*" for every patch: fn({ topic, data }) for
//                                            "*" and prefixes, fn(data) for an exact topic. "*" is first given the last
//                                            value of each topic but chat:* and typing:* (so a store made later catches up)
//   facade                                   the frozen facade below (what F.service(app) resolves to)
//   release({ terminate })                   terminate: the Worker ended and every listener dropped (sign-out, user
//                                            change, the switch off)
// }
// Facade (exactly makeIFLChat's seven keys, pigeon/app.js; Object.freeze):
//   get state; share(words, packed, { to }) → false | { ok, say } | { ok: false, why }   (Send through ui.lazy(send.js))
//   sendTo(id, words, packed) → { ok, say } | { ok: false, why }   only on a real tap (the page's user activation, read
//     through Navigator's and UserActivation's own getters, as tappedOn); else { ok: false, why: "tap" }. Best-effort
//     inside one realm: a script of this origin could still fake more than this; it only raises the bar.
//   waiting({ ids, stocks }) → Waiting[]; since(id, t) → { said, at } | null; refresh() → boolean; signOut() → true
// Before the first call the service reads localStorage["inflight-lock"] ({ on, uid, … }, Chat's LOCK_KEY) and starts
// the core with start({ visible, locked, screen: false, lockUid }); the core starts locked by default (S3-D14).
// ==== end of the frozen part ====
//
// B0's stub body: the Worker, hello, start, call, on and the facade, enough for the kit page's stub core
// (.tools/tests/roofkit/chatcore-stub.js, ?service=stub). No restart, no queue, no device check: CORE's.
export const PROTOCOL = 1;
export const STUB = true;

const UA_GET = (() => { try { return Object.getOwnPropertyDescriptor(Navigator.prototype, "userActivation")?.get || null; } catch (_) { return null; } })();
const ACTIVE_GET = (() => { try { return Object.getOwnPropertyDescriptor(UserActivation.prototype, "isActive")?.get || null; } catch (_) { return null; } })();
const tapped = () => { try { const ua = UA_GET ? UA_GET.call(navigator) : null; return !!(ua && ACTIVE_GET && ACTIVE_GET.call(ua) === true); } catch (_) { return false; } };

export function startService({ path = "/chats/", ui, onStale } = {}) {
  void path;
  const w = new Worker(new URL("./core.js", import.meta.url), { type: "module", name: "chats-core" });
  const wait = new Map(), subs = new Map(), last = new Map();
  let n = 0, state = "signin";
  const call = (m, ...a) => new Promise((ok, no) => { const id = ++n; wait.set(id, { ok, no }); w.postMessage({ id, m, a }); });
  const tell = (topic, data) => {
    for (const [k, l] of subs) {
      if (k === topic) for (const f of [...l]) f(data);
      else if (k === "*" || (k.endsWith(":") && topic.startsWith(k))) for (const f of [...l]) f({ topic, data });
    }
  };
  w.addEventListener("message", (e) => {
    const d = e.data;
    if (d?.t === "patch" && typeof d.topic === "string") {
      if (d.topic === "state" && d.data?.state) state = d.data.state;
      if (!/^(chat|typing):/.test(d.topic)) { if (d.data === null) last.delete(d.topic); else last.set(d.topic, d.data); }
      return tell(d.topic, d.data);
    }
    const p = wait.get(d?.id);
    if (!p) return;
    wait.delete(d.id);
    if (d.ok) p.ok(d.v); else p.no(Object.assign(new Error(`chats: ${d.why}`), { why: d.why }));
  });
  // (a Worker that fails to load or throws: every call waiting refused, offline, rather than waiting for ever)
  w.addEventListener("error", () => { for (const p of wait.values()) p.no(Object.assign(new Error("chats: the core failed"), { why: "offline" })); wait.clear(); });
  const on = (topic, fn) => {
    const l = subs.get(topic) || new Set();
    l.add(fn); subs.set(topic, l);
    if (topic === "*") for (const [k, v] of last) fn({ topic: k, data: v });
    return () => l.delete(fn);
  };
  let lock = null;
  try { lock = JSON.parse(localStorage.getItem("inflight-lock") || "null"); } catch (_) {}
  const ready = call("hello", PROTOCOL).then((v) => {
    if (v?.protocol !== PROTOCOL) { onStale?.(); throw Object.assign(new Error("chats: protocol"), { why: "no" }); }
    return call("start", { visible: document.visibilityState === "visible", locked: !!lock?.on, screen: false, lockUid: typeof lock?.uid === "string" ? lock.uid : undefined });
  }).then((v) => { if (v?.state) state = v.state; }, () => {});
  const svc = {
    protocol: PROTOCOL,
    get state() { return state; },
    call: (m, ...a) => ready.then(() => call(m, ...a)),
    on,
    facade: null,
    release({ terminate } = {}) { if (terminate) { w.terminate(); subs.clear(); for (const p of wait.values()) p.no(Object.assign(new Error("chats: gone"), { why: "no" })); wait.clear(); } },
  };
  const share = (words, packed, { to } = {}) => state !== "ready" ? Promise.resolve(false)
    : ui.lazy((q) => import("./send.js" + q)).then((m) => m.openSend(ui, svc, { card: packed ?? null, words, to: typeof to === "string" ? to : null }));
  svc.facade = Object.freeze({
    get state() { return state; },
    share,
    sendTo(id, words, packed) { return tapped() ? share(words, packed, { to: id }) : Promise.resolve({ ok: false, why: "tap" }); },
    waiting({ ids, stocks } = {}) { return svc.call("waiting", { ids, stocks }).catch(() => []); },
    since(id, t) { return svc.call("since", id, t).catch(() => null); },
    refresh() { return svc.call("sync", { quiet: true }).then(() => true, () => false); },
    signOut() { return svc.call("signOut").then(() => true, () => true); },
  });
  ui?.on?.("push", () => { svc.call("sync", { quiet: true }).catch(() => {}); });
  return ready.then(() => svc);
}
