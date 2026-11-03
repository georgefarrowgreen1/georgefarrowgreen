// Chats' Friends (One roof, stage 3, spec §2.1, §2.2, §3.1): the Friends section (Chat's vFriends): the requests row,
// friends' news (a lazy sheet), your friends by name with where they are or when they were last seen, your groups, the
// blocked count, and Add Friend. From the core's `friends`, `groups`, `requests` and `me` topics; every word through
// textContent.
//   view(sectionEl, ctx) → { show(), hide(), destroy() }; ctx = { fw, svc, store, open } (chats.js).
//   openRequests(ctx) → handle: Friend Requests (data-sheet requests): theirs to say yes or no to, yours waiting.
//   openAddFriend(ctx, handle?) → handle: Add Friend (data-sheet addfriend): a handle, sent as a request
//     (meta("friends", { handle })); handle from #add=<handle> filled in.
import { first, patchList, framed, listTime } from "./list.js";

// (under a friend's name: the place they share, else online / last seen)
export function friendSub(f, now = Date.now()) {
  if (f.blocked) return "Blocked";
  if (f.place) return String(f.place).replace(/, (the Moon|Mars)$/, "");
  if (f.online) return "online";
  if (f.lastSeen) return `last seen ${now - f.lastSeen < 864e5 ? listTime(f.lastSeen, now) : listTime(f.lastSeen, now).toLowerCase()}`;
  return `@${f.handle}`;
}

export function view(sec, ctx) {
  const { fw, store } = ctx, ui = fw.ui, el = ui.el;
  const top = el("div", { class: "ch-ftop" });
  const fhead = el("h2", { class: "ifl-label ch-fhead" });
  const fbox = el("div", { class: "ch-list ch-friends", role: "list", aria: { label: "Friends" } });
  const ghead = el("h2", { class: "ifl-label ch-ghead", text: "Groups" });
  const gbox = el("div", { class: "ch-list ch-groups", role: "list", aria: { label: "Groups" } });
  const foot = el("div", { class: "ch-ffoot" });
  sec.append(top, fhead, fbox, ghead, gbox, foot);
  let offs = [];

  const friendEl = (f) => el("a", { class: "ch-row ch-friend", href: fw.nav.href("open", f.id), role: "listitem",
    data: { act: "open", id: f.id, sig: [f.name, f.avatar, f.online, f.lastSeen, f.place, f.keyChanged, f.verified].join("|") } },
    ui.avatar(f.name),
    el("span", { class: "ch-rtext" },
      el("span", { class: "ch-rtop" }, el("span", { class: "ch-rname", text: first(f.name) }), f.verified ? el("span", { class: "ch-ver", text: "Verified" }) : null),
      el("span", { class: "ch-rbot" }, el("span", { class: "ch-rline", text: f.keyChanged ? "Security key changed" : friendSub(f) }))));
  const groupEl = (g) => el("a", { class: "ch-row ch-group", href: fw.nav.href("open", g.id), role: "listitem",
    data: { act: "open", id: g.id, sig: [g.name, g.muted, (g.members || []).map((m) => m.name).join(",")].join("|") } },
    ui.avatar(g.name),
    el("span", { class: "ch-rtext" },
      el("span", { class: "ch-rtop" }, el("span", { class: "ch-rname", text: g.name }), g.muted ? el("span", { class: "ch-pin", text: "Muted" }) : null),
      el("span", { class: "ch-rbot" }, el("span", { class: "ch-rline", text: (g.members || []).map((m) => first(m.name)).join(", ") }))));

  const draw = framed(() => {
    const all = store.get("friends") || [], groups = store.get("groups") || [], req = store.get("requests") || [], me = store.get("me");
    const fr = all.filter((f) => !f.blocked).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const blocked = all.length - fr.length, inc = req.filter((q) => q.dir === "in"), out = req.length - inc.length;
    top.replaceChildren(
      ui.btn("Add Friend", { primary: true, act: "addfriend" }),
      req.length ? el("button", { type: "button", class: "ch-req", data: { act: "requests" } },
        el("span", { class: "ch-reqt", text: "Friend Requests" }),
        el("span", { class: "ch-reqs", text: inc.length ? (inc.length === 1 ? `${inc[0].name} wants to be friends` : `${inc[0].name} and ${inc.length - 1} other${inc.length === 2 ? "" : "s"}`) : `${out} sent, waiting for a reply` }),
        inc.length ? ui.badge(inc.length, { label: `${inc.length} requests` }) : null) : null,
      me?.pigeons !== false ? el("button", { type: "button", class: "ch-news", data: { act: "news" }, text: "Friends’ News" }) : null);
    fhead.textContent = fr.length ? `${fr.length} friend${fr.length === 1 ? "" : "s"}` : "";
    fhead.hidden = !fr.length;
    patchList(fbox, fr, (f) => `f:${f.id}`, friendEl);
    ghead.hidden = !groups.length;
    patchList(gbox, [...groups].sort((a, b) => String(a.name).localeCompare(String(b.name))), (g) => `g:${g.id}`, groupEl);
    foot.replaceChildren(
      !fr.length ? ui.empty({ title: "No friends yet", body: me?.handle ? `Add someone by their handle, or share yours: @${me.handle}.` : "Add someone by their handle." }) : null,
      fr.length && me?.handle ? el("p", { class: "ch-foot" }, "Your handle is ", el("b", { text: `@${me.handle}` }), ". Share it so friends can add you.") : null,
      blocked ? el("p", { class: "ch-foot", text: `${blocked} blocked. Manage them in Privacy & Security.` }) : null);
  });
  const onClick = (e) => {
    const a = e.target.closest?.("[data-act]");
    if (!a || !sec.contains(a)) return;
    switch (a.dataset.act) {
      case "open": if (e.metaKey || e.ctrlKey) return; e.preventDefault(); fw.nav.go(fw.nav.href("open", a.dataset.id), { kind: "push" }); break;
      case "requests": ctx.open.requests(); break;
      case "addfriend": ctx.open.addFriend(); break;
      case "news": ctx.open.news(); break;
    }
  };
  sec.addEventListener("click", onClick);
  return {
    show() {
      if (!offs.length) offs = ["friends", "groups", "requests", "me"].map((k) => store.on(k, draw));
      draw.now();
    },
    hide() { for (const f of offs) f(); offs = []; draw.cancel(); },
    destroy() { this.hide(); sec.removeEventListener("click", onClick); sec.replaceChildren(); },
  };
}

// ---- Friend Requests (data-sheet requests) ----
export function openRequests(ctx) {
  const { fw, svc, store } = ctx, ui = fw.ui, el = ui.el;
  const body = el("div", { class: "ch-reqsheet" });
  const h = fw.sheet.open({ sheet: "requests", app: "chats", title: "Friend Requests", body, onClose: () => off() });
  const answer = async (q, yes) => {
    h.setBusy(true);
    const r = await svc.call("meta", "friends-respond", { id: q.id, accept: !!yes }).catch(() => null);
    h.setBusy(false);
    if (!r || r.err || r.ok === false) { fw.toast("Couldn’t answer just now. Try again."); return; }
    fw.toast(yes ? `You and ${first(q.name)} are friends` : "Request declined");
    svc.call("sync", { quiet: false }).catch(() => {});
  };
  const draw = () => {
    const req = store.get("requests") || [], inc = req.filter((q) => q.dir === "in"), out = req.filter((q) => q.dir !== "in");
    body.replaceChildren(
      inc.length ? ui.list(inc.map((q) => ui.row({ lead: { avatar: q.name }, title: q.name, sub: `@${q.handle}`,
        trail: el("span", { class: "ch-yesno" }, ui.btn("Accept", { small: true, primary: true, act: "accept", label: `Accept ${q.name}`, run: () => answer(q, true) }),
          ui.btn("Decline", { small: true, act: "decline", label: `Decline ${q.name}`, run: () => answer(q, false) })) })), { label: "Asking you" }) : null,
      out.length ? ui.list(out.map((q) => ui.row({ lead: { avatar: q.name }, title: q.name, sub: `@${q.handle} · waiting for a reply` })), { label: "Sent by you" }) : null,
      !req.length ? ui.empty({ title: "No requests", body: "When someone asks to be your friend, it shows here." }) : null,
      ui.btn("Add Friend", { act: "addfriend", run: () => { h.close(); ctx.open.addFriend(); } }));
  };
  const off = store.on("requests", draw);
  draw();
  return h;
}

// ---- Add Friend (data-sheet addfriend) ----
const HANDLE = /^@?([a-z0-9_.]{2,30})$/i;
export function openAddFriend(ctx, handle) {
  const { fw, svc, store } = ctx, ui = fw.ui, el = ui.el;
  let v = typeof handle === "string" ? handle : "";
  const say = el("p", { class: "ch-say", role: "status" });
  const send = async () => {
    const m = HANDLE.exec(String(v).trim());
    if (!m) { say.textContent = "That isn’t a handle. Handles are letters, numbers, dots and underscores."; return; }
    if (m[1].toLowerCase() === String(store.get("me")?.handle || "").toLowerCase()) { say.textContent = "That’s you."; return; }
    h.setBusy(true);
    const r = await svc.call("meta", "friends", { handle: m[1] }).catch(() => null);
    h.setBusy(false);
    if (!r || r.err || r.ok === false) { say.textContent = r?.err === "offline" ? "No signal. Try again when you’re back online." : "Couldn’t find anyone with that handle."; return; }
    h.close();
    fw.toast(`Request sent to @${m[1]}`);
    svc.call("sync", { quiet: false }).catch(() => {});
  };
  const f = ui.field({ label: "Their handle", placeholder: "@handle", value: v, onInput: (x) => { v = x; say.textContent = ""; }, onEnter: send });
  f.input.setAttribute("autocapitalize", "off");
  f.input.setAttribute("spellcheck", "false");
  const me = store.get("me");
  const body = el("div", { class: "ch-add" }, f, say,
    me?.handle ? el("p", { class: "ch-foot" }, "Yours is ", el("b", { text: `@${me.handle}` }), ". A friend can add you with it.") : null);
  const h = fw.sheet.open({ sheet: "addfriend", app: "chats", title: "Add Friend", body, focus: f.input, acts: [{ label: "Send Request", primary: true, act: "sendreq", run: send }] });
  return h;
}
