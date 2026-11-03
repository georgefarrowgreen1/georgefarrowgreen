// Chats' list (One roof, stage 3, spec §2.1, §3.1, S3-D10): the Chats section (Chat's vMessages): the key warning, the
// requests banner, the In the Air strip (pigeons on), pinned then recent chats and groups with their unread counts, the
// first-run card. No search field of its own (§2.4: the frame's Search finds everything). Rows come from the core's
// `rows` topic (Row: { id, kind, name, avatar, unread, flying, pinned, at, keyChanged, line? }); their last lines only
// for the rows this view asked for (`rows(from, to)`), drawn with textContent.
//   view(sectionEl, ctx) → { show(route), hide(), busy(), unmount() }; ctx = { fw, svc, store, open } (chats.js).
//   show(): subscribes to rows, air, requests, keywarn, me, friends; asks the core for the lines of the rows in sight;
//   the 1 s ticker for relative times and landing countdowns, while shown and visible. hide(): all of it let go.
//   openNewChat(ctx), openNewGroup(ctx): the New Chat / New Group sheets (data-sheet newmsg, newgroup) → the handle.
// Shared helpers for the module's views (time words, a keyed list patch) are exported here too.

// ---- helpers (the module's views share them) ----
export const DAY = 864e5;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
export const fmtTime = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
// (the list's time: "14:20", "Yesterday", "Mon", "03/11/26", as Chat's fmtListTime)
export function listTime(ts, now = Date.now()) {
  if (!ts) return "";
  if (sameDay(ts, now)) return fmtTime(ts);
  if (sameDay(ts, now - DAY)) return "Yesterday";
  const d = new Date(ts);
  return now - ts < 6 * DAY ? DOW[d.getDay()] : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}
// (a stretch header in a chat: "Today 17:24", "Yesterday 10:19", "Mon 13 Oct 09:02")
export function dayLabel(ts, now = Date.now()) {
  const d = new Date(ts);
  return sameDay(ts, now) ? "Today" : sameDay(ts, now - DAY) ? "Yesterday" : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}
// (a countdown: "12m", "2h 05m", "1d 4h", "now")
export function untilWords(ts, now = Date.now()) {
  const ms = ts - now;
  if (!(ms > 0)) return "now";
  const m = Math.ceil(ms / 6e4);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${pad2(m % 60)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
export const first = (name) => String(name || "").trim().split(/\s+/)[0] || String(name || "");
// (every [data-tick] under root: its time words written again; data-tick = "until:<ts>" | "list:<ts>")
export function tick(root, now = Date.now()) {
  for (const n of root.querySelectorAll("[data-tick]")) {
    const [k, v] = String(n.dataset.tick).split(":"), ts = Number(v);
    const t = k === "until" ? untilWords(ts, now) : k === "list" ? listTime(ts, now) : null;
    if (t != null && n.textContent !== t) n.textContent = t;
  }
}
// (a keyed patch of a list: children keyed by data-key, each made by make(item) → Element with a data-sig; an element
// whose sig hasn't changed stays as it is (focus, scroll and its listeners kept), one that has is replaced, the order
// follows items; anything else in box is left alone only if it carries no data-key)
export function patchList(box, items, keyOf, make) {
  const old = new Map();
  for (const n of [...box.children]) if (n.dataset.key) old.set(n.dataset.key, n);
  const keep = new Set(items.map(keyOf));
  for (const [k, n] of old) if (!keep.has(k)) n.remove();
  let at = null, i = 0;
  for (const it of items) {
    const k = keyOf(it), was = old.get(k);
    let n = make(it);
    n.dataset.key = k;
    if (was && was.dataset.sig === n.dataset.sig) n = was;
    else if (was) was.remove();
    if (box.children[i] !== n) (at ? at.after(n) : box.prepend(n));
    at = n; i++;
  }
}
// (box's children replaced by these, the null and false ones left out)
export const put = (box, ...kids) => box.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
// (one requestAnimationFrame per view: draw() asked many times in a frame runs once)
export function framed(fn) {
  let id = 0;
  const raf = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 16)), caf = globalThis.cancelAnimationFrame || clearTimeout;
  const run = () => { id = 0; try { fn(); } catch (e) { console.error(e); } };
  return Object.assign(() => { if (!id) id = raf(run); }, { now() { if (id) caf(id); run(); }, cancel() { if (id) caf(id); id = 0; } });
}
// (a 1 s ticker running only while on && the page visible)
export function ticker(fw, fn) {
  let t = 0, on = false, off = null;
  const go = () => { clearInterval(t); t = 0; if (on && fw.visible()) t = setInterval(fn, 1000); };
  return {
    start() { on = true; off ||= [fw.on("visible", go), fw.on("hidden", go)]; go(); },
    stop() { on = false; clearInterval(t); t = 0; for (const f of off || []) f?.(); off = null; },
  };
}
// (a row's sort: pinned first, then newest)
export const byPinAt = (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.at || 0) - (a.at || 0);

// ---- the Chats section ----
const LINES = 30;   // the rows whose last line the list asks for (the first screenful and a little more)

export function view(el, ctx) { return build(el, ctx); }
function build(sec, ctx) {
  const { fw, svc, store } = ctx, ui = fw.ui, el = ui.el;
  const warn = el("div", { class: "ch-warns" });
  const air = el("div", { class: "ch-air", hidden: true, aria: { label: "In the air" }, role: "region" });
  const box = el("div", { class: "ch-list", role: "list", aria: { label: "Chats" } });
  const empty = el("div", { class: "ch-empty" });
  sec.append(warn, air, box, empty);
  let offs = [], asked = "";
  const t = ticker(fw, () => tick(sec));

  function rowEl(r) {
    const name = r.name || "", line = r.line == null ? "" : String(r.line);
    const n = el("a", { class: `ch-row${r.unread ? " unread" : ""}${r.kind === "group" ? " group" : ""}`, href: fw.nav.href("open", r.id), role: "listitem",
      data: { act: "open", id: r.id, sig: [r.name, r.avatar, r.unread, r.flying, r.pinned, r.at, r.keyChanged, line].join("|") } },
      ui.avatar(name, {}),
      el("span", { class: "ch-rtext" },
        el("span", { class: "ch-rtop" },
          el("span", { class: "ch-rname", text: r.kind === "group" ? name : first(name) }),
          r.pinned ? el("span", { class: "ch-pin", text: "Pinned" }) : null,
          el("time", { class: "ch-rtime", data: { tick: `list:${r.at || 0}` }, text: listTime(r.at) })),
        el("span", { class: "ch-rbot" },
          el("span", { class: "ch-rline", text: r.keyChanged ? "Security key changed" : r.flying ? (line || "A pigeon’s on its way") : line }),
          r.unread ? ui.badge(r.unread, { label: `${r.unread} unread` }) : null)));
    return n;
  }
  function airEl(a) {
    return el("button", { type: "button", class: "ch-airp", data: { act: "air", id: a.chatId, msg: a.id, sig: `${a.landsAt}|${a.from}|${a.to}` },
      aria: { label: `A pigeon from ${a.from} to ${a.to}, lands in ${untilWords(a.landsAt)}` } },
      el("span", { class: "ch-airwho", text: `${first(a.from)} → ${first(a.to)}` }),
      el("span", { class: "ch-airt", data: { tick: `until:${a.landsAt}` }, text: untilWords(a.landsAt) }));
  }
  const drawWarn = () => {
    const kw = store.get("keywarn"), req = store.get("requests") || [], inc = req.filter((q) => q.dir === "in");
    put(warn,
      kw?.mine ? el("div", { class: "ch-warn strong", role: "note" }, el("b", { text: "Your security key doesn’t match" }), el("span", { text: "Friends can’t read new messages from this phone until it’s fixed on Chat’s own page." }),
        el("a", { class: "ifl-btn small", href: "/chats/in/#account", text: "Open Privacy & Security" })) : null,
      inc.length ? el("button", { type: "button", class: "ch-req", data: { act: "requests" } },
        el("span", { class: "ch-reqt", text: "Friend Requests" }),
        el("span", { class: "ch-reqs", text: inc.length === 1 ? `${inc[0].name} wants to be friends` : `${inc[0].name} and ${inc.length - 1} other${inc.length === 2 ? "" : "s"}` }),
        ui.badge(inc.length, { label: `${inc.length} requests` })) : null);
  };
  const drawAir = () => {
    const a = (store.get("air") || []).filter((x) => x && x.landsAt);
    air.hidden = !a.length || store.get("me")?.pigeons === false;
    if (air.hidden) { air.replaceChildren(); return; }
    if (!air.querySelector(".ch-airl")) air.replaceChildren(el("h2", { class: "ch-airl", text: "In the Air" }), el("div", { class: "ch-airs" }));
    patchList(air.querySelector(".ch-airs"), [...a].sort((x, y) => x.landsAt - y.landsAt), (x) => `a:${x.id}`, airEl);
  };
  const drawRows = () => {
    const rows = [...(store.get("rows") || [])].sort(byPinAt);
    patchList(box, rows, (r) => `r:${r.id}`, rowEl);
    const me = store.get("me"), friends = store.get("friends");
    empty.replaceChildren();
    if (rows.length) return;
    if (!friends || !friends.length) {
      empty.append(el("div", { class: "ch-first" },
        el("h2", { text: "Add a friend to start" }),
        el("p", { text: "Messages arrive as soon as you send them, end-to-end encrypted." }),
        me?.handle ? el("p", { class: "ch-me" }, "Your link: ", el("b", { text: `@${me.handle}` })) : null,
        ui.btn("Add Friend", { primary: true, act: "addfriend" })));
    } else empty.append(fw.ui.empty({ title: "No messages yet", body: "Tap New Chat to send your first." }));
  };
  const draw = framed(() => { drawWarn(); drawAir(); drawRows(); });
  // (the lines of the rows in sight: asked once per set of ids)
  const askLines = () => {
    const ids = [...(store.get("rows") || [])].sort(byPinAt).slice(0, LINES).map((r) => r.id).join();
    if (ids === asked) return;
    asked = ids;
    svc.call("rows", 0, LINES).catch(() => {});
  };
  const onClick = (e) => {
    const a = e.target.closest?.("[data-act]");
    if (!a || !sec.contains(a)) return;
    switch (a.dataset.act) {
      case "open": if (e.metaKey || e.ctrlKey) return; e.preventDefault(); fw.nav.go(fw.nav.href("open", a.dataset.id), { kind: "push" }); break;
      case "air": fw.nav.go(fw.nav.href("open", a.dataset.id), { kind: "push" }); break;
      case "requests": ctx.open.requests(); break;
      case "addfriend": ctx.open.addFriend(); break;
    }
  };
  sec.addEventListener("click", onClick);
  return {
    show() {
      if (!offs.length) offs = ["rows", "air", "requests", "keywarn", "me", "friends"].map((k) => store.on(k, () => { draw(); if (k === "rows") askLines(); }));
      asked = "";
      draw.now();
      askLines();
      t.start();
    },
    hide() { for (const f of offs) f(); offs = []; t.stop(); draw.cancel(); },
    busy: () => false,
    unmount() { this.hide(); sec.removeEventListener("click", onClick); sec.replaceChildren(); },
  };
}

// ---- New Chat, New Group (data-sheet newmsg, newgroup) ----
// (friends to pick from: the store's, by name)
const friendsOf = (store) => [...(store.get("friends") || [])].filter((f) => !f.blocked).sort((a, b) => String(a.name).localeCompare(String(b.name)));
export function openNewChat(ctx) {
  const { fw, store } = ctx, ui = fw.ui, el = ui.el;
  const fr = friendsOf(store);
  const body = el("div", { class: "ch-pick" });
  const h = fw.sheet.open({ sheet: "newmsg", app: "chats", title: "New Chat", body, acts: [{ label: "New Group", act: "newgroup", run: () => { h.close(); ctx.open.newGroup(); } }] });
  if (!fr.length) body.append(ui.empty({ title: "No friends yet", body: "Add a friend, and once they say yes you can message them." }), ui.btn("Add Friend", { primary: true, run: () => { h.close(); ctx.open.addFriend(); } }));
  else body.append(ui.list(fr.map((f) => ui.row({ lead: { avatar: f.name }, title: f.name, sub: `@${f.handle}`, act: "pick",
    run: () => { h.close(); fw.nav.go(fw.nav.href("open", f.id), { kind: "push" }); } })), { label: "Friends" }));
  return h;
}
export function openNewGroup(ctx) {
  const { fw, svc, store } = ctx, ui = fw.ui, el = ui.el;
  const fr = friendsOf(store), picked = new Set();
  let name = "";
  const body = el("div", { class: "ch-pick" });
  const say = el("p", { class: "ch-say", role: "status" });
  const make = async () => {
    if (!name.trim()) { say.textContent = "Give the group a name."; return; }
    if (picked.size < 2) { say.textContent = "Pick at least two friends."; return; }
    h.setBusy(true);
    const r = await svc.call("meta", "groups", { name: name.trim().slice(0, 60), members: [...picked] }).catch((e) => ({ err: e?.why || "failed" }));
    h.setBusy(false);
    if (!r || r.err || r.ok === false) { say.textContent = "Couldn’t make the group. Try again."; return; }
    h.close();
    const id = r.id || r.group?.id;
    if (id) fw.nav.go(fw.nav.href("open", id), { kind: "push" });
  };
  const h = fw.sheet.open({ sheet: "newgroup", app: "chats", title: "New Group", body, acts: [{ label: "Make Group", primary: true, act: "make", run: make }] });
  body.append(ui.field({ label: "Group name", placeholder: "Group name", onInput: (v) => { name = v; } }));
  if (!fr.length) body.append(ui.empty({ title: "No friends yet", body: "A group needs at least two friends." }));
  else body.append(ui.list(fr.map((f) => ui.row({ lead: { avatar: f.name }, title: f.name, sub: `@${f.handle}`, trail: "switch", checked: false, label: `Add ${f.name}`,
    onChange: (on) => { if (on) picked.add(f.id); else picked.delete(f.id); } })), { label: "Members" }));
  body.append(say);
  return h;
}
