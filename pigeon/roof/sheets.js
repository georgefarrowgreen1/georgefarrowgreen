// Chat's sheets under the roof (stage 3 spec §2.2): a friend's and a group's info, adding people and a group's name,
// safety numbers, who has a group letter, a photo, when a pigeon should land, a time to talk, adding from the apps, and
// the hold menus as action sheets. Lazy, kept offline (connector.lazy). Each opener draws into
// fw.sheet.open({ sheet, app: "chats" }), reads through the service (svc.call, only the core's RPC methods; metadata
// through meta(name, args) with META's names) and the store (friends, groups, me, chat:<id>), and returns the handle.
// Frozen openers (ctx = { fw, svc, store, open }; open.* the bound openers of every file):
//   openFriendInfo(ctx, id) friendinfo · openGroupInfo(ctx, id) groupinfo · openGroupAdd(ctx, id) groupadd ·
//   openGroupRename(ctx, id) grouprename · openSafety(ctx, id) safety · openWhoHas(ctx, msgId) whohas ·
//   openView(ctx, msgId) view · openSchedule(ctx, id) schedule · openTimeTalk(ctx, id) timetalk ·
//   openFromApps(ctx, id) fromapps · openHold(ctx, target) hold
// Added (optional, for the chat view): a last argument of callbacks where the answer is the composer's —
//   openSchedule(ctx, id, { at, pick(at | null) }); openFromApps(ctx, id, { pick(card) });
//   openHold(ctx, target), target = { kind: "msg" | "fly" | "chat" | "group" | "out", chatId, msgId?, on?(act, id) } or
//   { title?, items: [{ label, sub?, act, destructive?, run }] }; on(act, id) is told the acts that are the view's
//   (reply, retry, delete).
// Every string from data goes in through textContent (fw.ui's builders); the QR code is qr.js's own SVG of digits only.
// Message words never leave the core but for the chat on screen, and nothing here writes them anywhere.
import { cardHtml } from "../cardview.js";
import { qrSvg } from "../qr.js";

// (a sheet of another of these files, opened straight from its own file through fw.lazy: never through ctx.open, whose
// names are the view's)
const LAZY = {
  sheets: (fw) => fw.lazy((q) => import("./sheets.js" + q)),
  flight: (fw) => fw.lazy((q) => import("./flight.js" + q)),
  media: (fw) => fw.lazy((q) => import("./media.js" + q)),
  scan: (fw) => fw.lazy((q) => import("./scan.js" + q)),
};
const FILE_OF = { openLoft: "flight", openMap: "flight", openBirds: "flight", openFlightLog: "flight", openFeathers: "flight", openMoonPick: "flight",
  openScan: "scan", openGifs: "media", pickPhoto: "media", recordVoice: "media", openSafety: "sheets" };
const hop = (ctx, name, ...a) => LAZY[FILE_OF[name]](ctx.fw).then((m) => m[name](ctx, ...a), () => ctx.fw.toast("That needs a connection. Try again when you’re back online."));

// markup made here or by cardview.js/qr.js (escaped there) → nodes ("template" content in a browser)
const frag = (near, html) => { const t = near.ownerDocument.createElement("template"); t.innerHTML = html; return t.content || t; };

export const GROUP_MAX = 12;
export const REACTIONS = Object.freeze(["❤️", "👍", "😂", "😮", "😢", "🙏"]);
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad2 = (n) => String(n).padStart(2, "0");
export const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
// the safety number: its digits (a string, or Chat's groups) in fives, and the code a friend's phone scans
export const digitsOf = (d) => (Array.isArray(d) ? d.join("") : String(d || "")).replace(/\D/g, "");
export const fives = (d) => digitsOf(d).match(/\d{1,5}/g) || [];
export const safetyCode = (d) => `inflight-safety:1:${digitsOf(d)}`;
export const safeState = (f) => (f?.keyChanged ? "warn" : f?.verified ? "ok" : "none");
const fmtTime = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmtShort = (t) => { const d = new Date(t); return `${d.getDate()} ${MON[d.getMonth()]}, ${fmtTime(t)}`; };
function seen(t) {
  if (!Number.isFinite(t)) return "";
  const m = Math.round((Date.now() - t) / MIN);
  return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : m < 24 * 60 ? `${Math.round(m / 60)} h ago` : fmtShort(t);
}
export function schedPresets(t = Date.now()) {
  const at = (days, h) => { const d = new Date(t); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return +d; };
  const out = [];
  if (at(0, 18) - t > HOUR) out.push(["This Evening", at(0, 18)]);
  out.push(["Tomorrow Morning", at(1, 8)], ["Tomorrow Evening", at(1, 18)]);
  const sat = (6 - new Date(t).getDay() + 7) % 7;
  if (sat > 1) out.push(["Saturday Morning", at(sat, 9)]);
  return out;
}
export const localInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

// the pieces every sheet here shares, bound to its ctx
function kit(ctx) {
  const { fw, svc, store, open = {} } = ctx, ui = fw.ui, el = ui.el;
  const get = (t) => store?.get?.(t);
  const friend = (id) => (get("friends") || []).find((f) => f.id === id) || null;
  const group = (id) => (get("groups") || []).find((g) => g.id === id) || null;
  const person = (id) => friend(id) || (get("groups") || []).flatMap((g) => g.members || []).find((p) => p.id === id) || null;
  // (a message of the chat on screen: the page holds no other's; ctx.chat names it when the view knows)
  const msgOf = (id) => {
    for (const c of [ctx.chat, ...(get("rows") || []).map((r) => r.id)]) { const v = c && get(`chat:${c}`), m = v?.msgs?.find((x) => x.id === id); if (m) return { m, chat: v }; }
    return null;
  };
  const meta = (name, args) => svc.call("meta", name, args);
  const say = (e, what = "Couldn’t do that just now. Try again.") => fw.toast(e?.why === "offline" ? "No signal. Try again when you’re back online." : what);
  const foot = (text) => el("p", { class: "chs-foot", text });
  const head = (name, sub, lead) => el("div", { class: "chs-head" }, lead || ui.avatar(name), el("b", { class: "chs-name", text: name }), sub ? el("span", { class: "chs-sub", text: sub }) : null);
  const go = (name, ...a) => () => { hop(ctx, name, ...a); };
  const row = (o, data = {}) => { const r = ui.row(o); for (const [k, v] of Object.entries(data)) if (v != null) r.dataset[k] = v; return r; };
  // a destructive step asked on a page of its own, with the one button that does it
  const confirm = (h, { title, body, label, run }) => h.push({ page: "confirm", title, body: (pg) => {
    pg.append(el("p", { class: "chs-ask", text: body }), el("div", { class: "chs-acts" },
      ui.btn(label, { destructive: true, act: "confirm", run: async () => { h.setBusy?.(true); try { await run(); } finally { h.setBusy?.(false); } } }),
      ui.btn("Cancel", { act: "cancel", run: () => h.pop() })));
  } });
  const gone = [];
  const sheet = (spec) => fw.sheet.open({ app: "chats", ...spec, onClose: () => { for (const f of gone.splice(0)) { try { f(); } catch (_) {} } spec.onClose?.(); } });
  return { fw, svc, store, open, ui, el, get, friend, group, person, msgOf, meta, say, foot, head, go, row, confirm, sheet, gone };
}
// a redraw of a sheet's body whenever the topics it reads change (let go of as the sheet closes)
function live(k, h, topics, draw) {
  for (const t of topics) if (k.store?.on) k.gone.push(k.store.on(t, () => { if (!h.closed) draw(); }));
}

/* ---------- a friend ---------- */
export function openFriendInfo(ctx, id) {
  const k = kit(ctx), { ui, el } = k;
  let box = null;
  const h = k.sheet({ sheet: "friendinfo", label: "Contact info", body: (b) => { box = el("div", { class: "chs" }); b.append(box); } });
  function draw() {
    box.replaceChildren();
    const f = k.friend(id), me = k.get("me") || {};
    if (!f) { box.append(ui.empty({ title: "Not a friend any more", body: "They’re not in your friends on this phone." })); return; }
    box.append(k.head(first(f.name), `@${f.handle || ""}`));
    if (me.pigeons !== false) box.append(ui.list([k.row({ lead: { icon: "bird" }, title: `Visit ${first(f.name)}’s Loft`, sub: "Their pigeons, badges and kit", trail: "chevron", run: k.go("openLoft", f.id) }, { act: "loft", id: f.id })]));
    const facts = [k.row({ lead: { icon: "locate" }, title: "Location", value: String(f.place || "Not set").replace(/, (the Moon|Mars)$/, "") })];
    if (f.online || f.lastSeen) facts.push(k.row({ lead: { icon: "clock" }, title: "Last Online", value: f.online ? "Online now" : seen(f.lastSeen) }));
    box.append(ui.list(facts));
    box.append(ui.list([
      k.row({ lead: { icon: "lock" }, title: "Safety Number", value: f.keyChanged ? "Key changed" : f.verified ? "Verified" : "", trail: "chevron", run: () => openSafety(ctx, f.id) }, { act: "safety", id: f.id }),
    ]));
    box.append(ui.list([
      k.row({ title: "Remove Friend", run: () => k.confirm(h, { title: "Remove Friend", body: `Remove ${first(f.name)} from your friends? Your chat stays on this phone until you clear it.`, label: "Remove Friend",
        run: async () => { try { await k.meta("friends", { method: "DELETE", id: f.id }); h.close(); k.fw.toast(`${first(f.name)} is no longer your friend.`); } catch (e) { k.say(e); } } }) }, { act: "unfriend", id: f.id }),
      k.row({ title: `Block @${f.handle || ""}`, run: () => k.confirm(h, { title: "Block", body: `Block @${f.handle || ""}? They can’t send you friend requests or pigeons, or see your picture or where you are. They aren’t told.`, label: "Block",
        run: async () => { try { await k.meta("block", { method: "POST", id: f.id }); h.close(); k.fw.toast(`@${f.handle || ""} is blocked.`); } catch (e) { k.say(e); } } }) }, { act: "block", id: f.id }),
    ]));
    for (const r of box.querySelectorAll("[data-act=unfriend],[data-act=block]")) r.classList.add("chs-danger");
  }
  draw();
  live(k, h, ["friends", "me"], draw);
  return h;
}

/* ---------- a group ---------- */
export function openGroupInfo(ctx, id) {
  const k = kit(ctx), { ui, el } = k;
  let box = null;
  const h = k.sheet({ sheet: "groupinfo", label: "Group info", body: (b) => { box = el("div", { class: "chs" }); b.append(box); } });
  function draw() {
    box.replaceChildren();
    const g = k.group(id), me = k.get("me") || {};
    if (!g) { box.append(ui.empty({ title: "Not in this group any more", body: "It isn’t on this phone." })); return; }
    const members = g.members || [];
    box.append(k.head(g.name, `${members.length} people`));
    const ppl = members.map((p) => (p.id === me.id
      ? k.row({ lead: { avatar: p.name }, title: first(p.name), sub: "You" })
      : k.row({ lead: { avatar: p.name }, title: first(p.name), sub: k.friend(p.id) ? "Friend" : "In this group", trail: "chevron", label: `${first(p.name)}: safety number`, run: () => openSafety(ctx, p.id) }, { act: "safety", id: p.id })));
    if (members.length < GROUP_MAX) ppl.push(k.row({ lead: { icon: "plus" }, title: "Add People", run: () => openGroupAdd(ctx, g.id) }, { act: "groupadd", id: g.id }));
    box.append(ui.list(ppl, { label: "People" }), k.foot("Only friends see where each other are. Anyone in the group can add their own friends. Tap someone for their safety number."));
    box.append(ui.list([
      k.row({ title: "Mute Notifications", sub: g.muted ? "No notifications or emails from this group" : "", trail: "switch", checked: !!g.muted,
        onChange: async (v) => { try { await k.meta("group-mute", { method: "POST", id: g.id, muted: !!v }); } catch (e) { k.say(e); draw(); } } }, { key: "muted" }),
      k.row({ title: "Group Name", value: g.name, trail: "chevron", run: () => openGroupRename(ctx, g.id) }, { act: "grouprename", id: g.id }),
    ]));
    const leave = k.row({ title: "Leave Group", run: () => k.confirm(h, { title: "Leave Group", body: `Leave ${g.name}? You won’t get its messages any more, and it goes from this phone.`, label: "Leave Group",
      run: async () => { try { await k.meta("group-leave", { method: "POST", id: g.id }); h.close(); k.fw.toast(`You’ve left ${g.name}.`); } catch (e) { k.say(e); } } }) }, { act: "groupleave", id: g.id });
    leave.classList.add("chs-danger");
    box.append(ui.list([leave]));
  }
  draw();
  live(k, h, ["groups", "friends"], draw);
  return h;
}

export function openGroupAdd(ctx, id) {
  const k = kit(ctx), { ui, el } = k, pick = new Set();
  let box = null;
  const h = k.sheet({ sheet: "groupadd", title: "Add People", body: (b) => { box = el("div", { class: "chs" }); b.append(box); } });
  function draw() {
    box.replaceChildren();
    const g = k.group(id); if (!g) { box.append(ui.empty({ title: "Not in this group any more" })); return; }
    const inIt = new Set((g.members || []).map((p) => p.id));
    const pool = (k.get("friends") || []).filter((f) => !inIt.has(f.id) && !f.blocked).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!pool.length) { box.append(ui.empty({ title: "Everyone’s already here", body: "All your friends are in this group." })); return; }
    const n = pick.size + inIt.size;
    box.append(ui.list(pool.map((f) => {
      const r = k.row({ lead: { avatar: f.name }, title: first(f.name), sub: f.place || "", run: () => { if (pick.has(f.id)) pick.delete(f.id); else pick.add(f.id); draw(); } }, { act: "pick", id: f.id });
      r.setAttribute("role", "checkbox"); r.setAttribute("aria-checked", String(pick.has(f.id)));
      return r;
    }), { label: "Your friends" }));
    box.append(k.foot(n > GROUP_MAX ? `Groups can have up to ${GROUP_MAX} people.` : `${n} people, including you.`));
    const add = ui.btn(pick.size ? `Add ${pick.size === 1 ? "1 Person" : `${pick.size} People`}` : "Choose People", { primary: true, act: "add", run: async () => {
      if (!pick.size || n > GROUP_MAX) return;
      h.setBusy?.(true);
      try { await k.meta("group-add", { method: "POST", id: g.id, members: [...pick] }); h.close(); k.fw.toast("Added."); }
      catch (e) { k.say(e, "Couldn’t add them just now. Try again."); }
      finally { h.setBusy?.(false); }
    } });
    add.disabled = !pick.size || n > GROUP_MAX;
    box.append(el("div", { class: "chs-acts" }, add));
  }
  draw();
  live(k, h, ["groups", "friends"], draw);
  return h;
}

export function openGroupRename(ctx, id) {
  const k = kit(ctx), { ui, el } = k, g = k.group(id);
  let name = g?.name || "";
  const save = async () => {
    const v = String(name).trim().slice(0, 40);
    if (!v || !g) return;
    h.setBusy?.(true);
    try { await k.meta("group-name", { method: "POST", id: g.id, name: v }); h.close(); }
    catch (e) { k.say(e, "Couldn’t rename it just now. Try again."); }
    finally { h.setBusy?.(false); }
  };
  const f = ui.field({ value: name, placeholder: "Group name", label: "Group name", onInput: (v) => { name = v; }, onEnter: save });
  f.input.maxLength = 40;
  f.dataset.act = "name";
  const h = k.sheet({ sheet: "grouprename", title: "Group Name", focus: f.input,
    body: (b) => b.append(el("div", { class: "chs" }, f, k.foot("Everyone in the group sees the new name."))), acts: [{ label: "Save", primary: true, act: "save", run: save }] });
  return h;
}

/* ---------- safety numbers (public keys only: the core's safety, verify and trust) ---------- */
export function openSafety(ctx, id) {
  const k = kit(ctx), { ui, el } = k;
  let box = null, s = null;
  const h = k.sheet({ sheet: "safety", title: "Safety Number", body: (b) => { box = el("div", { class: "chs chs-safety" }); b.append(box); } });
  const digits = () => {
    const d = el("div", { class: "chs-digits", "aria-label": "Safety number", data: { k: "digits" } }, fives(s.digits).map((x) => el("span", { text: x })));
    const copy = ui.btn("Copy", { small: true, act: "copy", run: () => { navigator.clipboard?.writeText(fives(s.digits).join(" ")).then(() => k.fw.toast("Copied."), () => {}); } });
    return el("div", { class: "chs-safedig" }, d, copy);
  };
  async function act(fn, ok) { h.setBusy?.(true); try { await fn(); if (ok) k.fw.toast(ok); await load(); } catch (e) { k.say(e); } finally { h.setBusy?.(false); } }
  function draw() {
    box.replaceChildren();
    const p = k.person(id), name = first(p?.name || "your friend");
    if (!s) { box.append(ui.skeleton("rows", 2)); return; }
    const st = s.keyChanged ? "warn" : s.verified ? "ok" : "none";
    box.dataset.state = st;
    box.append(k.head(name, { ok: "Verified in person", warn: "Their key changed", none: "Not verified yet" }[st]));
    if (st === "warn") {
      box.append(el("p", { class: "chs-warn", role: "alert", text: `${name}’s key changed. Only trust it once these digits match on both phones.` }), digits(),
        el("div", { class: "chs-acts" }, ui.btn("They Match: Trust New Key", { primary: true, act: "trust", run: () => act(() => k.svc.call("trust", id), "Trusted. Messages can go to them again.") })));
    } else if (st === "ok") {
      box.append(k.foot(`Your safety numbers matched, so only you and ${name} can read your messages. If ${name}’s key ever changes, you’ll be told.`), digits(),
        el("div", { class: "chs-acts" }, ui.btn("Clear Verification", { destructive: true, act: "unverify", run: () => act(() => k.svc.call("verify", id, false), "Verification cleared.") })));
    } else {
      const qr = el("div", { class: "chs-qr" });
      try { qr.append(frag(box, qrSvg(safetyCode(s.digits), { title: `Your safety number with ${name}, as a QR code` }))); } catch (_) {}
      box.append(el("h3", { class: "ifl-label", text: "1. Scan each other’s code" }), k.foot("Hold your phones up together, or on a video call."), qr,
        el("div", { class: "chs-acts" }, ui.btn(`Scan ${name}’s Code`, { act: "scan", run: k.go("openScan", { id, digits: digitsOf(s.digits) }) })),
        el("h3", { class: "ifl-label", text: "2. Or compare these 60 digits" }), k.foot("Read them out to each other. They’re the same on both phones."), digits(),
        el("div", { class: "chs-acts" }, ui.btn("Mark as Verified", { primary: true, act: "verify", run: () => act(() => k.svc.call("verify", id, true), "Verified.") })),
        k.foot("If they match, only the two of you can read your messages. Not even the server could swap in a different key."));
    }
  }
  async function load() {
    try { s = await k.svc.call("safety", id); } catch (e) { box.replaceChildren(ui.error({ title: "Can’t show the safety number", body: e?.why === "offline" ? "No signal." : "Try again in a moment." })); return; }
    if (!h.closed) draw();
  }
  draw();
  load();
  return h;
}

/* ---------- who has a group letter ---------- */
export function openWhoHas(ctx, msgId) {
  const k = kit(ctx), { ui, el } = k;
  let box = null;
  const h = k.sheet({ sheet: "whohas", title: "Who Has It", body: (b) => { box = el("div", { class: "chs" }); b.append(box); } });
  function draw() {
    box.replaceChildren();
    const x = k.msgOf(msgId), g = x && k.group(x.chat.id);
    if (!x || !g) { box.append(ui.empty({ title: "It isn’t on screen any more" })); return; }
    const { m } = x, me = k.get("me") || {}, flock = Array.isArray(m.flock) ? m.flock : null;
    const st = (p) => { const f = flock?.find((y) => y.to === p.id); return f ? (f.readAt ? `Read ${fmtShort(f.readAt)}` : f.lost ? "Lost" : f.deliverAt && f.deliverAt <= Date.now() ? `Landed ${fmtShort(f.deliverAt)}` : f.deliverAt ? `Lands ${fmtTime(f.deliverAt)}` : "On its way") : m.read ? "Read" : m.delivered ? "Landed" : m.flight?.flying ? "On its way" : ""; };
    const ppl = (g.members || []).filter((p) => p.id !== me.id);
    box.append(ui.list(ppl.map((p) => k.row({ lead: { avatar: p.name }, title: first(p.name), value: st(p) }, { id: p.id }))));
    if (m.flight?.flying) box.append(ui.list([k.row({ lead: { icon: "map" }, title: "Watch on Map", trail: "chevron", run: k.go("openMap", msgId) }, { act: "map", id: msgId })]));
  }
  draw();
  const chat = k.msgOf(msgId)?.chat?.id;
  live(k, h, chat ? [`chat:${chat}`, "groups"] : ["groups"], draw);
  return h;
}

/* ---------- a photo (decrypted in the core, its object URL made and let go of by media.js) ---------- */
export function openView(ctx, msgId) {
  const k = kit(ctx), { ui, el } = k;
  let box = null, url = null;
  const h = k.sheet({ sheet: "view", label: "Photo", body: (b) => { box = el("div", { class: "chs-view" }); b.append(box); }, onClose: () => { url?.revoke?.(); url = null; } });
  box.append(ui.skeleton("hero"));
  const x = k.msgOf(msgId), ref = x?.m?.media?.ref || msgId;
  Promise.all([k.svc.call("photo", ref), k.fw.lazy((q) => import("./media.js" + q))]).then(([blob, M]) => {
    if (h.closed) return;
    if (!blob) { box.replaceChildren(ui.empty({ title: "This photo isn’t on this phone any more" })); return; }
    url = M.blobUrl(blob);
    box.replaceChildren(el("img", { src: url.url, alt: "Photo", class: "chs-photo" }), el("p", { class: "chs-foot", text: "Decrypted on this phone." }));
  }, (e) => { if (!h.closed) box.replaceChildren(ui.error({ title: "Can’t open the photo", body: e?.why === "offline" ? "No signal." : "Try again in a moment." })); });
  return h;
}

/* ---------- when a pigeon should land ---------- */
export function openSchedule(ctx, id, { at = null, pick } = {}) {
  const k = kit(ctx), { ui, el } = k, f = k.friend(id), now = Date.now();
  const choose = (t) => { try { pick?.(t); } catch (_) {} h.close(); };
  const inp = el("input", { type: "datetime-local", "aria-label": "When it lands", class: "chs-dt", data: { act: "at" } });
  inp.min = localInput(now + 10 * MIN); inp.max = localInput(now + 30 * DAY);
  inp.value = localInput(at ?? Math.max(now + HOUR, schedPresets(now)[0][1]));
  const set = () => { const t = new Date(inp.value).getTime(); if (!Number.isFinite(t) || t < now + 10 * MIN || t > now + 30 * DAY) { k.fw.toast("Choose a time in the next 30 days."); return; } choose(t); };
  const h = k.sheet({ sheet: "schedule", title: "When Should It Land?", acts: [{ label: "Set", primary: true, act: "set", run: set }], body: (b) => {
    const rows = schedPresets(now).map(([label, t]) => { const r = k.row({ title: label, value: `${DOW[new Date(t).getDay()]} ${fmtTime(t)}`, run: () => choose(t) }, { act: "preset", at: String(t) }); if (at === t) r.setAttribute("aria-current", "true"); return r; });
    b.append(el("div", { class: "chs" }, ui.list(rows), el("label", { class: "chs-line" }, el("span", { text: "Another Time" }), inp),
      k.foot(`It waits in your loft and takes off in time to land then. ${first(f?.name || "They")} won’t know it’s coming until it takes off. Up to 30 days ahead.`),
      at != null ? el("div", { class: "chs-acts" }, ui.btn("Send It Now Instead", { act: "unschedule", run: () => choose(null) })) : null));
  } });
  return h;
}

/* ---------- a time to talk: a call or a meeting, asked in a message (one to one) ---------- */
export const WHEN_LENGTHS = Object.freeze([15, 30, 60, 120]);
export function whenOf(s) {
  if (!Number.isFinite(s.start) || !WHEN_LENGTHS.includes(s.mins) || !/^(call|meet)$/.test(s.kind)) return null;
  let tz = "UTC"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) {}
  return { kind: s.kind, start: s.start, mins: s.mins, tz, opts: [...s.opts].filter(Number.isFinite).sort((a, b) => a - b).slice(0, 3) };
}
export function openTimeTalk(ctx, id) {
  const k = kit(ctx), { ui, el } = k, f = k.friend(id), name = first(f?.name || "your friend");
  const t0 = Date.now(), s = { kind: "call", mins: 30, opts: [], start: Math.ceil((t0 + HOUR) / (15 * MIN)) * 15 * MIN, busy: false };
  let box = null;
  const h = k.sheet({ sheet: "timetalk", title: "A Time to Talk", body: (b) => { box = el("div", { class: "chs" }); b.append(box); } });
  const chip = (act, v, on, text, role = "radio") => el("button", { type: "button", role, class: "chsend-chip", data: { act, value: String(v) }, aria: { checked: String(on) }, text });
  const dayOf = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function draw() {
    box.replaceChildren();
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(t0); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d.getTime(); });
    const day = dayOf(s.start), mins = new Date(s.start).getHours() * 60 + new Date(s.start).getMinutes();
    const at = (q) => { const d = new Date(day); d.setHours(Math.floor(q / 60), q % 60, 0, 0); return d.getTime(); };
    const dayName = (d, i) => (i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${DOW_LONG[new Date(d).getDay()]} ${new Date(d).getDate()} ${MON[new Date(d).getMonth()]}`);
    const kind = el("div", { class: "chsend-chips", role: "radiogroup", "aria-label": "Call or meet" }, chip("kind", "call", s.kind === "call", "Call"), chip("kind", "meet", s.kind === "meet", "Meet"));
    const daySel = el("select", { class: "chs-sel", "aria-label": "Day", data: { act: "day" } }, days.map((d, i) => { const o = el("option", { value: String(d), text: dayName(d, i) }); if (d === day) o.selected = true; return o; }));
    const timeSel = el("select", { class: "chs-sel", "aria-label": "Time", data: { act: "time" } }, Array.from({ length: 96 }, (_, i) => i * 15).filter((q) => at(q) > Date.now()).map((q) => { const o = el("option", { value: String(q), text: `${pad2(Math.floor(q / 60))}:${pad2(q % 60)}` }); if (q === mins) o.selected = true; return o; }));
    daySel.addEventListener("change", () => { const d = new Date(+daySel.value); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0); s.start = Math.max(d.getTime(), Math.ceil(Date.now() / (15 * MIN)) * 15 * MIN); s.opts = []; draw(); });
    timeSel.addEventListener("change", () => { s.start = at(+timeSel.value); s.opts = []; draw(); });
    const lens = el("div", { class: "chsend-chips", role: "radiogroup", "aria-label": "How long" }, WHEN_LENGTHS.map((m) => chip("mins", m, s.mins === m, m < 60 ? `${m} min` : m === 60 ? "1 hour" : `${m / 60} hours`)));
    const others = el("div", { class: "chsend-chips" }, [30, 60, 120].map((d) => s.start + d * MIN).map((o) => chip("opt", o, s.opts.includes(o), fmtTime(o), "checkbox")));
    box.append(kind, el("label", { class: "chs-line" }, el("span", { text: "Day" }), daySel), el("label", { class: "chs-line" }, el("span", { text: "Time" }), timeSel),
      el("h3", { class: "ifl-label", text: "How Long" }), lens, el("h3", { class: "ifl-label", text: "Other Times That Work" }), others);
    const go = ui.btn(s.busy ? "Sending…" : `Ask ${name}`, { primary: true, act: "ask", run: ask });
    go.disabled = s.busy || !whenOf(s);
    box.append(el("div", { class: "chs-acts" }, go), k.foot(`Only the time and that it’s a ${s.kind === "meet" ? "meeting" : "call"} reach InFlite, to put it in Today for you both once ${name} says yes. Never what you write.`));
  }
  box.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-act=kind],[data-act=mins],[data-act=opt]"); if (!b || s.busy) return;
    const v = b.dataset.value;
    if (b.dataset.act === "kind") s.kind = v;
    else if (b.dataset.act === "mins") s.mins = +v;
    else { const o = +v; s.opts = s.opts.includes(o) ? s.opts.filter((x) => x !== o) : [...s.opts, o]; }
    draw();
  });
  // (the invite goes as a message at once: the words say when; the core seals them like anything typed)
  async function ask() {
    const w = whenOf(s); if (!w || s.busy) return;
    if (!(w.start > Date.now())) { k.fw.toast("That time has passed."); return; }
    s.busy = true; draw();
    const d = new Date(w.start), words = `${w.kind === "meet" ? "Meet" : "A call"} ${dayOf(w.start) === dayOf(Date.now()) ? "today" : `on ${DOW_LONG[d.getDay()]}`} at ${fmtTime(w.start)}, for ${w.mins < 60 ? `${w.mins} minutes` : w.mins === 60 ? "an hour" : `${w.mins / 60} hours`}?`;
    try { await k.svc.call("sendText", id, words, { kind: "instant" }); h.close(); k.fw.toast(`Asked ${name}.`); }
    catch (e) { s.busy = false; draw(); k.say(e, "Couldn’t send it. Try again."); }
  }
  draw();
  return h;
}

/* ---------- adding from the apps: a photo, a GIF, a card, a time to talk ---------- */
export const FROM_KINDS = Object.freeze([["weather", "Weather here"], ["fitness", "Today’s session"]]);
export function openFromApps(ctx, id, { pick } = {}) {
  const k = kit(ctx), { ui, el } = k, f = k.friend(id), cards = {};
  let box = null;
  const h = k.sheet({ sheet: "fromapps", title: "Add to Your Message", body: (b) => { box = el("div", { class: "chs" }); b.append(box); } });
  const take = (card) => { if (!card) return; try { pick?.(card); } catch (_) {} h.close(); };
  function draw() {
    box.replaceChildren();
    const rows = [k.row({ lead: { icon: "photo" }, title: "Photo", trail: "chevron", run: () => { h.close(); k.go("pickPhoto", id)(); } }, { act: "photo" }),
      k.row({ lead: { icon: "gif" }, title: "GIF", trail: "chevron", run: () => { h.close(); k.go("openGifs", id)(); } }, { act: "gif" })];
    for (const [kind, label] of FROM_KINDS) {
      const c = cards[kind];
      if (c === null) continue;
      const r = k.row({ lead: { icon: kind === "weather" ? "rain" : "bolt" }, title: label, sub: c ? (c.say || "") : "…", trail: "chevron", run: () => take(c) }, { act: "card", kind });
      if (!c) r.disabled = true;
      rows.push(r);
    }
    if (f) rows.push(k.row({ lead: { icon: "clock" }, title: "A Time to Talk", sub: "A call or a meeting, at a time you choose", trail: "chevron", run: () => { h.close(); openTimeTalk(ctx, id); } }, { act: "timetalk" }));
    box.append(ui.list(rows), k.foot("Cards go sealed in your message, as anything you write does."));
  }
  draw();
  let tz = "UTC"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (_) {}
  for (const [kind] of FROM_KINDS) {
    k.meta("my-card", { method: "GET", kind, tz }).then((r) => { cards[kind] = r?.card || null; }, () => { cards[kind] = null; }).then(() => { if (!h.closed) draw(); });
  }
  return h;
}

/* ---------- hold menus, as action sheets ---------- */
// → [{ label, sub?, act, destructive?, run }] for a target the view held
export function holdItems(ctx, target = {}) {
  const k = kit(ctx), on = (act, id) => () => target.on?.(act, id);
  if (Array.isArray(target.items)) return target.items;
  const { kind, chatId, msgId } = target;
  const x = msgId ? k.msgOf(msgId) : null, m = x?.m;
  if (kind === "msg") {
    const items = [{ label: "Reply", act: "reply", run: on("reply", msgId) }];
    if (m?.text && !m.recalled) items.push({ label: "Copy", act: "copy", run: () => navigator.clipboard?.writeText(m.text).then(() => k.fw.toast("Copied."), () => {}) });
    if (m?.card) items.push({ label: "Send to a Friend", act: "cardfwd", run: () => k.fw.lazy((q) => import("./send.js" + q)).then((S) => S.openSend(k.fw, k.svc, { card: m.card, words: m.card.say || "" })) });
    if (m?.flight && (m.flight.flying || m.flight.way)) items.push({ label: "Show the Flight", act: "map", run: k.go("openMap", msgId) });
    return items;
  }
  if (kind === "fly") {
    const items = [];
    if (m?.flight?.waiting) return [{ label: "Cancel Pigeon", act: "recall", destructive: true, run: () => k.svc.call("recall", chatId, msgId).catch((e) => k.say(e)) }];
    items.push({ label: "Watch on Map", act: "map", run: k.go("openMap", msgId) });
    items.push({ label: "Call It Back", act: "recall", destructive: true, run: () => k.svc.call("recall", chatId, msgId).catch((e) => k.say(e)) });
    return items;
  }
  if (kind === "chat") return [
    { label: "Contact Info", act: "friendinfo", run: () => openFriendInfo(ctx, chatId) },
    { label: "Safety Number", act: "safety", run: () => openSafety(ctx, chatId) },
  ];
  if (kind === "group") return [
    { label: "Group Info", act: "groupinfo", run: () => openGroupInfo(ctx, chatId) },
    { label: "Add People", act: "groupadd", run: () => openGroupAdd(ctx, chatId) },
  ];
  if (kind === "out") return [{ label: "Send Now", act: "retry", run: on("retry", target.id) }, { label: "Delete", act: "delete", destructive: true, run: on("delete", target.id) }];
  return [];
}
export function openHold(ctx, target = {}) {
  const k = kit(ctx), { ui, el } = k;
  const items = holdItems(ctx, target), x = target.msgId ? k.msgOf(target.msgId) : null, m = x?.m;
  const h = k.sheet({ sheet: "hold", title: target.title || "", label: target.title ? null : "Actions", body: (b) => {
    const box = el("div", { class: "chs chs-hold" });
    if (target.kind === "msg" && m && !m.recalled) {
      const mine = m.mine || "";
      const rr = el("div", { class: "chs-react", role: "group", "aria-label": "React" }, REACTIONS.map((e) => {
        const btn = el("button", { type: "button", class: "chs-emoji", data: { act: "react", value: e }, aria: { pressed: String(mine === e), label: `React ${e}` }, text: e });
        btn.addEventListener("click", () => { h.close(); k.svc.call("react", x.chat.id, m.id, e).catch((err) => k.say(err)); });
        return btn;
      }));
      box.append(rr);
      // (a card in it, as the chat draws it: cardview.js escapes everything it's given)
      let card = ""; try { card = m.card ? cardHtml(m.card, { viewAt: Date.now() }) : ""; } catch (_) {}
      if (card) { box.append(el("div", { class: "chs-card" }, frag(box, card))); }
      if (Number.isFinite(m.at)) box.append(el("p", { class: "chs-foot", text: `Sent ${fmtShort(m.at)}` }));
    }
    box.append(ui.list(items.map((it) => {
      const r = k.row({ title: it.label, sub: it.sub, run: () => { h.close(); try { it.run?.(); } catch (_) {} } }, { act: it.act });
      if (it.destructive) r.classList.add("chs-danger");
      return r;
    })));
    b.append(box);
  } });
  return h;
}
