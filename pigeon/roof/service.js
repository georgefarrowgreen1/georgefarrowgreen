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
// CORE's body. One Worker per service (the only `new Worker` under pigeon/roof/), made at once; hello first (a
// PROTOCOL that isn't ours → onStale, and no other call); the lock read before the first call. The Worker may die
// (iOS ends a hidden page's workers): on visible it's asked, and if it doesn't answer in 1.5 s it's made again and
// started as before. Calls made while it's being made again wait up to 5 s, then fail with why "offline". Nothing here
// keeps a word: patches go to whoever's subscribed (the Chats module's store) and the last value of each list topic
// is kept for a store made later; chat:* and typing:* never are (risk I2).
//
// The tap check is best-effort inside one realm (as tappedOn in pigeon/app.js): the getters are taken as this file
// loads, before a module could reach them, and the page's own scripts are the site's. It only raises the bar; the
// facade has no call(), so Today and every other module reach the core only through these seven keys (risk I1).
export const PROTOCOL = 1;
export const STUB = false;

const UA_GET = (() => { try { return Object.getOwnPropertyDescriptor(Navigator.prototype, "userActivation")?.get || null; } catch (_) { return null; } })();
const ACTIVE_GET = (() => { try { return Object.getOwnPropertyDescriptor(UserActivation.prototype, "isActive")?.get || null; } catch (_) { return null; } })();
export function tappedOn(nav, getUA, getActive) {
  try { const ua = typeof getUA === "function" ? getUA.call(nav) : null; return !!(ua && typeof getActive === "function" && getActive.call(ua) === true); } catch (_) { return false; }
}
const tapped = () => tappedOn(globalThis.navigator, UA_GET, ACTIVE_GET);
// (theme.js's device rule, as chats.js has it: Chat is for phones and iPads; the core never starts on a computer, S3-D13.
// Applied to browsers only: every one's user agent starts "Mozilla/"; anything else (node, for roofcontract) isn't a
// computer this rule can say anything of)
function deviceOf() {
  if (!/^Mozilla\//.test(navigator.userAgent || "")) return "phone";
  var ua = navigator.userAgent || "";
  var touched = navigator.maxTouchPoints > 1;
  var mobile = /iPhone|iPod|iPad|Android|Mobile/.test(ua) || (/Macintosh/.test(ua) && touched) || (/Linux/.test(ua) && touched && matchMedia("(pointer: coarse)").matches);
  return mobile ? "phone" : "computer";
}
// (Chat's app lock, as Chat keeps it on this phone: { on, uid, after }; never anything else read here)
function lockKept() {
  let v = null;
  try { v = JSON.parse(globalThis.localStorage?.getItem("inflight-lock") || "null"); } catch (_) {}
  return v && typeof v === "object" ? { on: !!v.on, uid: typeof v.uid === "string" && /^[\w-]{1,64}$/.test(v.uid) ? v.uid : undefined } : { on: false, uid: undefined };
}
// a card handed over (words, packed), checked exactly as engineCard (pigeon/app.js) checks a #share= card
async function cardFrom(ui, words, packed) {
  const C = await ui.lazy((q) => import("../cards.js" + q));
  const w = String(words ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500);
  const c = typeof packed === "string" && /^[A-Za-z0-9_-]+$/.test(packed) ? `&card=${packed}` : "";
  let r = null; try { r = C.readShareHash(`#share=${encodeURIComponent(w)}${c}`); } catch (_) {}
  return r?.card ? { card: r.card, words: typeof r.words === "string" ? r.words : w } : null;
}
const why = (w) => Object.assign(new Error(`chats: ${w}`), { why: w });
const RESTART_WAIT = 5000, PING_WAIT = 1500;

export function startService({ path = "/chats/", ui, onStale } = {}) {
  void path;
  const subs = new Map(), last = new Map();
  let state = "signin", w = null, n = 0, alive = false, ended = false, stale = false, restarting = null, starts = null;
  const wait = new Map();
  const visible = () => { try { return typeof ui?.visible === "function" ? !!ui.visible() : true; } catch (_) { return true; } };
  const tell = (topic, data) => {
    for (const [k, l] of subs) {
      if (k === topic) for (const f of [...l]) { try { f(data); } catch (_) {} }
      else if (k === "*" || (k.endsWith(":") && topic.startsWith(k))) for (const f of [...l]) { try { f({ topic, data }); } catch (_) {} }
    }
  };
  // (the first state said is kept and told even when it's the one it starts as, signin: a store made later must hear it)
  const setState = (s) => { if (typeof s !== "string" || (s === state && last.has("state"))) return; state = s; last.set("state", { state: s }); tell("state", { state: s }); };
  const onMsg = (e) => {
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.t === "patch" && typeof d.topic === "string") {
      if (d.topic === "state") { if (d.data?.state) setState(d.data.state); return; }
      if (!/^(chat|typing):/.test(d.topic)) { if (d.data === null) last.delete(d.topic); else last.set(d.topic, d.data); }
      return tell(d.topic, d.data);
    }
    const p = wait.get(d.id);
    if (!p) return;
    wait.delete(d.id); clearTimeout(p.t);
    if (d.ok) p.ok(d.v); else p.no(Object.assign(why(d.why || "no"), typeof d.said === "string" && d.said ? { said: d.said.slice(0, 140) } : {}));
  };
  // one call on the Worker as it is now (a Worker that dies leaves it waiting: it's failed when the Worker's made again)
  const raw = (m, a, ms = 0) => new Promise((ok, no) => {
    if (!w) return no(why(ended ? "no" : "offline"));
    const id = ++n, p = { ok, no, m, t: ms ? setTimeout(() => { wait.delete(id); no(why("offline")); }, ms) : 0 };
    wait.set(id, p);
    try { w.postMessage({ id, m, a }); } catch (_) { wait.delete(id); clearTimeout(p.t); no(why("no")); }
  });
  const make = () => {
    w = new Worker(new URL("./core.js", import.meta.url), { type: "module", name: "chats-core" });
    w.addEventListener("message", onMsg);
    // (a Worker that fails to load or throws: every call waiting refused, offline, rather than waiting for ever; B0)
    w.addEventListener("error", () => { alive = false; failAll("offline"); });
    alive = true;
  };
  // hello, then start as the page is now (locked as Chat's lock says, read before the first call: S3-D14)
  const boot = async () => {
    const lk = lockKept();
    const v = await raw("hello", [PROTOCOL]);
    if (v?.protocol !== PROTOCOL) { stale = true; try { w?.terminate(); } catch (_) {} w = null; try { onStale?.(); } catch (_) {} throw why("no"); }
    const o = { visible: visible(), locked: lk.on, screen: !!starts?.screen };
    if (lk.uid) o.lockUid = lk.uid;
    const r = await raw("start", [o]);
    if (r?.state) setState(r.state);
    return r;
  };
  const failAll = (wy) => { for (const p of wait.values()) { clearTimeout(p.t); p.no(why(wy)); } wait.clear(); };
  const restart = () => restarting ||= (async () => {
    try { w?.terminate(); } catch (_) {}
    w = null; failAll("offline");
    if (ended || stale) return;
    make();
    await boot().catch(() => {});
  })().finally(() => { restarting = null; });
  // a call: after the first start, and while the Worker's being made again (5 s at most, then "offline")
  const call = async (m, ...a) => {
    if (ended) throw why("no");
    if (stale) throw why("no");
    if (state === "device" && !w) throw why("device");
    await ready;
    if (restarting) {
      let t = 0;
      const late = new Promise((_, no) => { t = setTimeout(() => no(why("offline")), RESTART_WAIT); });
      try { await Promise.race([restarting, late]); } finally { clearTimeout(t); }
    }
    if (m === "start" && a[0] && typeof a[0] === "object") starts = { ...(starts || {}), ...a[0] };
    return raw(m, a);
  };
  const on = (topic, fn) => {
    if (typeof topic !== "string" || typeof fn !== "function") return () => {};
    const l = subs.get(topic) || new Set();
    l.add(fn); subs.set(topic, l);
    if (topic === "*") for (const [k, v] of last) { try { fn({ topic: k, data: v }); } catch (_) {} }
    return () => l.delete(fn);
  };
  let offs = [];
  const release = ({ terminate } = {}) => {
    if (!terminate) return;
    ended = true;
    for (const off of offs) { try { off?.(); } catch (_) {} }
    offs = [];
    try { w?.terminate(); } catch (_) {}
    w = null; failAll("no"); subs.clear(); last.clear();
  };
  const svc = {
    protocol: PROTOCOL,
    get state() { return state; },
    call, on, facade: null, release,
  };
  // Send: Chat's send sheet in a framework sheet (S3-D7); not ready → false (a card's Send then goes to /chats/#share=)
  const share = async (words, packed, { to } = {}) => {
    if (state !== "ready") return false;
    const x = await cardFrom(ui, words, packed).catch(() => null);
    if (!x) return false;
    const m = await ui.lazy((q) => import("./send.js" + q));
    return m.openSend(ui, svc, { card: x.card, words: x.words, to: typeof to === "string" && /^[\w-]{1,64}$/.test(to) ? to : null });
  };
  // one tap to one friend (or group) whose keys are trusted and unchanged, as the sheet's Send; anyone else, the sheet
  // with them chosen (engineSendOne). Only from a real tap.
  const sendOne = async (id, words, packed) => {
    if (state !== "ready") return { ok: false, why: state };
    const x = await cardFrom(ui, words, packed).catch(() => null);
    if (!x) return { ok: false, why: "card" };
    if (typeof id !== "string" || !/^[\w-]{1,64}$/.test(id)) return share(words, packed, {});
    let rows = [];
    try { rows = await call("share", x.card, x.words); } catch (e) { return { ok: false, why: e.why || "failed" }; }
    const row = rows.find((r) => r.id === id);
    if (!row || !row.can || row.keyChanged) return share(words, packed, { to: id });
    let r;
    try { r = await call("sendRun", { card: x.card, words: x.words, pick: [id], when: "now" }); } catch (e) { return { ok: false, why: e.why || "failed" }; }
    if (!r?.sent?.length) return { ok: false, why: r?.why || "failed" };
    return { ok: true, say: r.say || "Sent" };
  };
  svc.facade = Object.freeze({
    get state() { return state; },
    share(words, packed, { to } = {}) { return share(words, packed, { to }).catch(() => false); },
    sendTo(id, words, packed) { return tapped() ? sendOne(id, words, packed).catch(() => ({ ok: false, why: "failed" })) : Promise.resolve({ ok: false, why: "tap" }); },
    // (as the engine took them: ids that can be ids, and of a stock only its symbol and name, never an amount)
    waiting({ ids, stocks } = {}) {
      const a = {};
      if (Array.isArray(ids)) a.ids = [...new Set(ids.filter((x) => typeof x === "string" && /^[\w-]{1,64}$/.test(x)))].slice(0, 50);
      if (Array.isArray(stocks)) a.stocks = stocks.filter((x) => x && typeof x === "object" && (typeof x.sym === "string" || typeof x.name === "string")).slice(0, 50)
        .map((x) => ({ ...(typeof x.sym === "string" ? { sym: x.sym.slice(0, 12) } : {}), ...(typeof x.name === "string" ? { name: x.name.slice(0, 60) } : {}) }));
      return call("waiting", a).catch(() => []);
    },
    since(id, t) { return call("since", id, t).catch(() => null); },
    refresh() { return call("sync", { quiet: true }).then((r) => !!r?.ok, () => false); },
    signOut() { return call("signOut").then(() => true, () => true); },
  });
  // a computer: no Worker, ever (S3-D13); the facade says device
  let ready;
  if (deviceOf() === "computer") { state = "device"; last.set("state", { state }); ready = Promise.resolve(); return ready.then(() => svc); }
  make();
  // (a Worker that never answered hello or start (its file not found, or it failed as it loaded): offline, not signed
  // out, so Today doesn't ask you to sign in; made again on the next visible)
  ready = boot().catch(() => { if (!stale && !ended) setState("offline"); });
  // the page's comings and goings, to the core; a Worker that died, made again (risk 6); a push, one quiet sync (S3-C5)
  const ping = () => { if (!w || ended || stale) return; raw("state", [], PING_WAIT).then(() => {}, () => { if (!ended && !stale) restart(); }); };
  offs.push(ui?.on?.("visible", () => { if (ended) return; if (!alive) restart(); else { ping(); call("start", { visible: true }).catch(() => {}); } }));
  offs.push(ui?.on?.("hidden", () => { if (!ended) call("start", { visible: false }).catch(() => {}); }));
  offs.push(ui?.on?.("push", () => { if (!ended) call("sync", { quiet: true }).catch(() => {}); }));
  return ready.then(() => svc);
}
