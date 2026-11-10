// Chats' chat (One roof, stage 3, spec §2.1, §3.1, S3-D10, S3-D17): a chat or a group (Chat's vChat, vGroupChat and its
// messages), with the composer under it. The words of the chat on screen are in this view's DOM while you read it, and
// nowhere else in the page: on hide() the messages are taken out of the DOM, the store's chat:<id> is let go of (the
// core sends null on leave), and only the id of the message at the top is kept (module memory) to come back to it.
//   view(hostEl, ctx) → { show(route), hide(), busy(), unmount(), back(), id }; ctx = { fw, svc, store, open } (chats.js).
//   show(route): route.arg (or an id) is the chat; fw.fill(true) (compact header, no window scroll), the tab bar away (the composer is up), the header (Back
//     "Back to Chats", the name, online / last seen / "lands in 12m", no switcher, Info), svc.call("open", id); an id
//     that isn't a chat on this phone → the list and a toast. The scroller is sized from visualViewport (resize listener
//     removed on hide); it starts at the bottom, sticks there while you're there, anchors when older() adds above, and
//     comes back to the message that was at its top the last time this chat showed. The 1 s ticker (landing countdowns)
//     runs while shown and visible. The draft goes to the core as you type (a second after) and at once on `hidden`.
//   hide(): all of that undone, the draft flushed, the messages out of the DOM.
//   busy(): the composer has words in it, or a send is on its way.
import { put, first, dayLabel, fmtTime, untilWords, tick, ticker, framed, patchList } from "./list.js";
import { friendSub } from "./friends.js";
import { cardHtml } from "../cardview.js";
import { linkParts } from "../links.js";
import { cardWords } from "../cards.js";

const STICK_PX = 64;          // this near the bottom counts as at the bottom
const OLDER_PX = 240;         // this near the top asks for older messages
const GAP = 3600e3;           // a stamp over each stretch an hour apart (as Chat's TIME_GAP)
const DRAFT_MS = 1000;
const MAX_TEXT = 4000;
// (per chat, in module memory: the message at the top when it was left, and how far below the scroller's top it sat)
const anchors = new Map();

// (the words of a message, with its web addresses as links; a Text node per part, never markup)
function wordsEl(doc, text) {
  const p = doc.createElement("span");
  p.className = "ch-words";
  for (const part of linkParts(text)) {
    if (part.href) {
      const a = doc.createElement("a");
      a.setAttribute("href", part.href); a.setAttribute("rel", "noopener noreferrer"); a.setAttribute("target", "_blank"); a.textContent = part.text;
      p.append(a);
    } else p.append(doc.createTextNode(part.text));
  }
  return p;
}
// (a card drawn by cardview.js, whose HTML has everything in it escaped, parsed in an inert template)
function cardEl(doc, card, o) {
  const html = cardHtml(card, o);
  if (!html) return null;
  const t = doc.createElement("template");
  t.innerHTML = html;
  return t.content;
}
const safeWords = (c) => { try { return cardWords(c) || c.say || ""; } catch (_) { return typeof c?.say === "string" ? c.say : ""; } };
const reactWords = (r) => Object.entries(r || {}).filter(([, n]) => n > 0);

export function view(el, ctx) { return build(el, ctx); }
function build(host, ctx) {
  const { fw, svc, store } = ctx, ui = fw.ui, el = ui.el, doc = host.ownerDocument;
  const warn = el("div", { class: "ch-cwarn" });
  const msgs = el("div", { class: "ch-msgs", role: "log", aria: { live: "polite", label: "Messages" } });
  const typing = el("div", { class: "ch-typing", data: { k: "typing" }, hidden: true, text: "typing…" });
  const scroller = el("div", { class: "ch-scroller", data: { k: "scroller" }, tabindex: "0", aria: { label: "Messages" } }, warn, msgs, typing);
  const input = el("textarea", { class: "ch-input", rows: "1", maxlength: String(MAX_TEXT), placeholder: "Message", aria: { label: "Message" }, autocomplete: "off" });
  const sendBtn = el("button", { type: "button", class: "ch-send", data: { act: "send" }, aria: { label: "Send" }, disabled: true }, ui.icon("up"));
  const attach = el("button", { type: "button", class: "ch-attach", data: { act: "photo" }, aria: { label: "Send a photo" } }, ui.icon("plus"));
  const voice = el("button", { type: "button", class: "ch-voice", data: { act: "voice" }, aria: { label: "Record a voice pigeon" } }, ui.icon("mic"));
  const latest = el("button", { type: "button", class: "ch-latest", data: { act: "latest" }, hidden: true, aria: { label: "Jump to latest messages" } }, ui.icon("down"), el("span", { text: "Latest messages" }));
  const replyName = el("b"), replyText = el("span");
  const reply = el("div", { class: "ch-reply", hidden: true, role: "group", aria: { label: "Replying to a message" } },
    el("div", { class: "ch-reply-copy" }, replyName, replyText),
    el("button", { type: "button", class: "ch-reply-cancel", data: { act: "cancel-reply" }, aria: { label: "Cancel reply" } }, ui.icon("x")));
  const composer = el("form", { class: "ch-composer", data: { k: "composer" }, aria: { label: "Write a message" } }, latest, attach, el("div", { class: "ch-field" }, el("div", { class: "ch-entry" }, reply, input), voice), sendBtn);
  const box = el("div", { class: "ch-chat", hidden: true }, scroller, composer);
  host.append(box);

  let headerAvatar = null, headerName = "";
  let id = null, offs = [], stick = true, sending = 0, draftT = 0, draftSent = "", asking = false, lastFirst = null;
  let episode = 0, replyTo = null, replyAt = 0;
  // Only identities in the current rendered window are remembered. A receipt,
  // sync or older page may replace a keyed row without making it a new arrival.
  let paintedMessages = null, newestMessageAt = 0;
  const vv = globalThis.visualViewport;
  const t = ticker(fw, () => { tick(msgs); header(); });

  // ---- the header ----
  const who = () => {
    const g = (store.get("groups") || []).find((x) => x.id === id);
    if (g) return { kind: "group", g, name: g.name };
    const f = (store.get("friends") || []).find((x) => x.id === id);
    const c = store.get(`chat:${id}`);
    return { kind: c?.kind === "group" ? "group" : "friend", f, name: f?.name || (store.get("rows") || []).find((r) => r.id === id)?.name || "" };
  };
  function header() {
    if (!id) return;
    const w = who(), c = store.get(`chat:${id}`), flying = (c?.msgs || []).filter((m) => m.flight?.flying && m.flight.landsAt).sort((a, b) => a.flight.landsAt - b.flight.landsAt)[0];
    const line = flying ? `Pigeon in flight · ${untilWords(flying.flight.landsAt)}` : w.g ? (w.g.members || []).map((m) => first(m.name)).join(", ") : w.f ? friendSub(w.f) : "";
    if (headerName !== w.name) { headerName = w.name; headerAvatar = ui.avatar(w.name); }
    fw.header.set({ conversation: true, avatar: headerAvatar, title: w.kind === "group" ? w.name : first(w.name) || "Chat", compactTitle: w.kind === "group" ? w.name : first(w.name) || "Chat", line, pick: null, sections: false, back: { label: "Back to Chats" },
      acts: [{ icon: "info", label: w.kind === "group" ? "Group Info" : "Info", run: () => (w.kind === "group" ? ctx.open.groupInfo(id) : ctx.open.friendInfo(id)) }] });
  }

  // ---- a message ----
  const nameOf = (from) => {
    if (from === "me") return "You";
    if (from === "them") return first(who().name);
    const g = who().g, m = g?.members?.find((x) => x.id === from);
    return first(m?.name || "Someone");
  };
  function bubbleEl(m) {
    const mine = m.from === "me", fl = m.flight, w = who(), group = w.kind === "group";
    const sig = [m.kind, m.text, m.read, m.delivered, m.recalled, m.expires, fl && [fl.flying, fl.sentAt, fl.landsAt, fl.lost, fl.waiting].join(","), JSON.stringify(m.reactions || {}), m.mine, m.media?.ref, m.card ? 1 : 0, m.opened || 0].join("|");
    const row = el("div", { class: `ch-m${mine ? " me" : " them"}`, data: { k: "msg", id: m.id, from: m.from, mid: m.id, sig } });
    if (m.kind === "system" || m.recalled) {
      row.className = "ch-m sys";
      row.append(el("p", { class: "ch-sys", text: m.recalled ? (mine ? "You called this message back." : `${nameOf(m.from)} called their message back.`) : String(m.text || "") }));
      return row;
    }
    // theirs still in the air: sealed until it lands
    if (!mine && fl && fl.flying) {
      const progress = el("progress", { class: "ch-flight-progress", max: "1", value: "0", data: { from: fl.sentAt || m.at, to: fl.landsAt }, aria: { hidden: "true" } });
      row.append(el("button", { type: "button", class: "ch-b ch-bubble sealed", data: { act: "map", id: m.id },
        aria: { label: `A pigeon from ${nameOf(m.from)}, sealed until it lands in ${untilWords(fl.landsAt)}. Watch it on the map.` } },
        el("span", { class: "ch-sealed-head" }, ui.icon("mail"), el("b", { text: "Sealed letter" })),
        el("span", { class: "ch-sealed-time" }, "Lands in ", el("span", { data: { tick: `until:${fl.landsAt}` }, text: untilWords(fl.landsAt) })),
        el("span", { class: "ch-flight-track" }, progress, ui.icon("bird"))));
      return row;
    }
    if (fl && fl.lost) {
      row.className = "ch-m sys";
      row.append(el("p", { class: "ch-sys", text: mine ? "Your pigeon was lost on the way." : `${nameOf(m.from)}’s pigeon was lost on the way.` }));
      return row;
    }
    const b = el("div", { class: `ch-b ch-bubble k-${m.kind}${fl?.flying ? " up" : ""}`, role: "button", tabindex: "0", data: { act: fl?.flying && mine ? "map" : "hold", id: m.id }, aria: { haspopup: "dialog" } });
    b.append(el("span", { class: "sr", text: `${mine ? "You" : nameOf(m.from)}: ` }));
    if (group && !mine) b.append(el("span", { class: "ch-from", text: nameOf(m.from) }));
    if (m.replyTo) b.append(el("span", { class: "ch-quote", text: "Reply" }));
    switch (m.kind) {
      case "photo":
        b.append(el("button", { type: "button", class: "ch-photo", data: { act: "view", id: m.id }, text: "Photo" }));
        break;
      case "viewonce":
        // (as the full app has it: yours, what became of it, never to open (it isn't kept on this phone); theirs, a button
        // until it's opened, then only that it was)
        if (mine || m.opened) b.append(el("span", { class: "ch-photo done", text: mine ? (group && m.opened ? `Opened by ${m.opened}` : m.opened ? "Opened" : "Photo · view once") : "Opened" }));
        else b.append(el("button", { type: "button", class: "ch-photo", data: { act: "view", id: m.id }, text: "View photo, once" }));
        break;
      case "voice":
        b.append(el("button", { type: "button", class: "ch-vn", data: { act: "play", id: m.id }, text: `Voice pigeon${m.media?.secs ? ` · ${Math.floor(m.media.secs / 60)}:${String(Math.round(m.media.secs % 60)).padStart(2, "0")}` : ""}` }));
        break;
      case "card": case "ask": case "plan": case "answer": case "when": {
        const c = m.card ? cardEl(doc, m.card, { mine, sentAt: m.at, viewAt: Date.now(), who: nameOf(m.from) }) : null;
        if (c) b.append(el("div", { class: "ch-card" }, c));
        // (a card this phone can't draw: its own sentence, else just what it is, never an empty bubble)
        else if (!m.text) b.append(el("span", { class: "ch-words", text: (m.card && safeWords(m.card)) || (m.kind === "card" ? "A card" : "A question") }));
        break;
      }
    }
    if (fl?.way === "pigeon" && !fl.flying && m.kind === "text") b.prepend(el("span", { class: "ch-letter-label", text: "Letter" }));
    if (m.text) b.append(wordsEl(doc, m.text));
    // yours in the air: when it lands
    if (mine && fl?.flying) b.append(el("span", { class: "ch-ft" }, fl.waiting ? "sends at " : "lands in ", el("span", { data: { tick: `until:${fl.landsAt}` }, text: untilWords(fl.landsAt) })));
    // (a bubble with a link, a card's link or a photo's button in it isn't a button itself: those are its taps, and
    // a tap beside them still opens its menu)
    if (b.querySelector("a[href], button")) { b.removeAttribute("role"); b.removeAttribute("tabindex"); b.removeAttribute("aria-haspopup"); }
    row.append(b);
    const rx = reactWords(m.reactions);
    if (rx.length) row.append(el("div", { class: "ch-rx", aria: { label: "Reactions" } }, rx.map(([e, n]) => el("span", { class: `ch-r${m.mine === e ? " mine" : ""}`, text: n > 1 ? `${e} ${n}` : e }))));
    if (m.expires) row.append(el("div", { class: "ch-meta", text: "Disappears soon" }));
    return row;
  }
  // (the stretch stamps between messages, and the read line under your latest)
  function itemsOf(c) {
    const out = [];
    let last = 0;
    const list = c?.msgs || [];
    const lastMine = [...list].reverse().find((m) => m.from === "me" && !m.flight?.flying && !m.recalled);
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!last || dayLabel(m.at) !== dayLabel(last)) out.push({ stamp: m.at });
      if (m.recalled) {
        let j = i + 1;
        while (j < list.length && list[j].recalled) j++;
        if (j - i > 1) { out.push({ recalls: list.slice(i, j) }); last = list[j - 1].at; i = j - 1; continue; }
      }
      last = m.at;
      out.push({ m });
      if (!m.recalled && !m.flight?.flying) out.push({ time: m.at, mid: m.id, mine: m.from === "me" });
      if (lastMine && m.id === lastMine.id && who().kind !== "group") out.push({ status: m.read ? "Read" : m.delivered ? "Delivered" : "Sent", at: m.id });
    }
    return out;
  }
  const itemEl = (it) => {
    if (it.stamp) return el("div", { class: "ch-stamp", data: { sig: dayLabel(it.stamp) } }, el("b", { text: dayLabel(it.stamp) }));
    if (it.time) return el("time", { class: `ch-time${it.mine ? " me" : ""}`, datetime: new Date(it.time).toISOString(), data: { sig: it.time }, text: fmtTime(it.time) });
    if (it.recalls) return el("details", { class: "ch-recalls", data: { mid: it.recalls[0].id, sig: it.recalls.map((m) => m.id).join(",") } },
      el("summary", {}, ui.icon("back"), el("span", { text: `${it.recalls.length} messages called back` })),
      el("div", { class: "ch-recall-events" }, it.recalls.map((m) => el("div", {}, el("time", { datetime: new Date(m.at).toISOString(), text: `${dayLabel(m.at)} ${fmtTime(m.at)}` }), bubbleEl(m)))));
    if (it.status) return el("div", { class: "ch-status", data: { sig: it.status }, text: it.status });
    return bubbleEl(it.m);
  };
  const keyOf = (it) => (it.stamp ? `s:${it.stamp}` : it.time ? `t:${it.mid}` : it.recalls ? `r:${it.recalls[0].id}` : it.status ? `st:${it.at}` : `m:${it.m.id}`);

  // ---- the scroller ----
  const atBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_PX;
  const toBottom = () => { scroller.scrollTop = scroller.scrollHeight; latest.hidden = true; };
  const topMsg = () => {
    const top = scroller.getBoundingClientRect?.().top ?? 0;
    for (const n of msgs.querySelectorAll("[data-mid]")) { const r = n.getBoundingClientRect?.(); if (r && r.bottom > top) return { mid: n.dataset.mid, off: r.top - top }; }
    return null;
  };
  const restore = (a) => {
    const n = a && msgs.querySelector(`[data-mid="${CSS?.escape ? CSS.escape(a.mid) : a.mid}"]`);
    if (!n) return false;
    scroller.scrollTop += (n.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - a.off;
    return true;
  };
  function arrivals(c) {
    const list = c.msgs || [], previous = paintedMessages;
    const next = new Map(list.map((m) => [m.id, m.from !== "me" && !!m.flight?.flying]));
    const allowed = previous && stick && fw.visible() && fw.motion?.() === "full" && !doc.documentElement?.hasAttribute?.("data-motion-paused");
    const fresh = allowed ? list.filter((m) => !previous.has(m.id) && m.at >= newestMessageAt && m.kind !== "system" && !m.recalled) : [];
    const arriving = new Set(fresh.length <= 3 ? fresh.map((m) => m.id) : []);
    const revealed = new Set(allowed ? list.filter((m) => previous.get(m.id) === true && !next.get(m.id) && !m.recalled && m.kind !== "system").map((m) => m.id) : []);
    paintedMessages = next;
    newestMessageAt = list.reduce((at, m) => Math.max(at, Number(m.at) || 0), newestMessageAt);
    if (!arriving.size && !revealed.size) return;
    for (const row of msgs.querySelectorAll(".ch-m[data-mid]")) {
      if (arriving.has(row.dataset.mid)) row.classList.add("ch-arriving");
      else if (revealed.has(row.dataset.mid)) row.classList.add("ch-revealing");
    }
  }
  const settleMotion = () => {
    for (const row of msgs.querySelectorAll(".ch-arriving, .ch-revealing")) row.classList.remove("ch-arriving", "ch-revealing");
  };
  const onMotionEnd = (e) => {
    if (e.target.parentNode === msgs && (e.animationName === "ch-message-enter" || e.animationName === "ch-message-reveal")) e.target.classList.remove("ch-arriving", "ch-revealing");
  };
  const draw = framed(() => {
    if (!id) return;
    const c = store.get(`chat:${id}`), hold = !stick && msgs.children.length ? topMsg() : null;
    const now = Date.now();
    if (!c) { msgs.replaceChildren(el("p", { class: "ch-opening", text: "Opening your messages…" })); return; }
    if (msgs.firstElementChild?.classList.contains("ch-opening") || msgs.firstElementChild?.classList.contains("ch-hello")) msgs.replaceChildren();
    if (!c.msgs?.length) {
      const w = who();
      msgs.replaceChildren(el("p", { class: "ch-hello" }, el("b", { text: "Say hello" }), el("span", { text: `Messages to ${w.kind === "group" ? w.name : first(w.name)} are end-to-end encrypted.` })));
    } else patchList(msgs, itemsOf(c), keyOf, itemEl);
    arrivals(c);
    drawReply();
    tick(msgs, now);
    put(warn, who().f?.keyChanged ? el("div", { class: "ch-warn", role: "note" },
      el("span", { text: `${first(who().name)}’s security key has changed. Check the safety number before you send anything.` }),
      ui.btn("Check", { small: true, act: "safety" })) : null);
    if (stick) toBottom();
    else if (hold) restore(hold);
    latest.hidden = stick || atBottom();
    lastFirst = c.msgs?.[0]?.id || null;
    header();
  });
  const onScroll = () => {
    stick = atBottom();
    latest.hidden = stick;
    const c = id && store.get(`chat:${id}`);
    if (c?.older && !asking && scroller.scrollTop < OLDER_PX && c.msgs?.length) {
      asking = true;
      const was = topMsg();
      svc.call("older", id, c.msgs[0].id).then(() => { draw.now(); restore(was); }).catch(() => {}).finally(() => { asking = false; });
    }
  };
  const fit = () => {
    // iOS may shrink the layout viewport along with the keyboard, particularly on the Home Screen. In that case
    // compare the focused composer's viewport with the screen too, as the standalone chat does. Pinching isn't typing.
    const ih = globalThis.innerHeight, screen = globalThis.screen;
    const portrait = globalThis.matchMedia?.("(orientation: portrait)").matches;
    const tall = screen ? (portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)) : 0;
    const kb = !!vv && (vv.scale || 1) === 1 && (vv.height < ih - 80 ||
      (doc.activeElement === input && globalThis.matchMedia?.("(any-pointer: coarse)").matches && tall - vv.height > 260));
    box.classList.toggle("ch-kbup", kb);
    // Keep the whole composer inside what is actually visible. The shared Home Screen correction describes the
    // screen outside that viewport; adding it here puts the input and send button below the screen after resume.
    const h = vv ? vv.height : ih;
    box.style.setProperty("--ch-vvh", `${Math.round(h)}px`);
    if (vv) box.style.setProperty("--ch-vvtop", `${Math.round(vv.offsetTop || 0)}px`);
    if (stick) toBottom();
  };

  // ---- the composer ----
  const sizeInput = () => { input.style.setProperty("--ch-rows", String(Math.min(6, Math.max(1, input.value.split("\n").length)))); };
  const words = () => input.value.replace(/\s+$/, "");
  function drawReply() {
    const m = replyTo && store.get(`chat:${id}`)?.msgs?.find((m) => m.id === replyTo && !m.recalled);
    if (replyTo && !m) { replyTo = null; replyAt++; }
    reply.hidden = !m;
    reply.setAttribute("aria-label", m ? `Replying to ${nameOf(m.from)}` : "Replying to a message");
    replyName.textContent = m ? nameOf(m.from) : "";
    replyText.textContent = m ? String(m.text || (m.card && safeWords(m.card)) || (m.kind === "voice" ? "Voice message" : m.kind === "photo" || m.kind === "viewonce" ? "Photo" : "Message")).replace(/\s+/g, " ").slice(0, 200) : "";
  }
  function selectReply(mid) {
    replyTo = mid; replyAt++;
    drawReply();
    if (stick) toBottom();
  }
  const flushDraft = () => {
    clearTimeout(draftT); draftT = 0;
    if (!id) return;
    const v = input.value;
    if (v === draftSent) return;
    draftSent = v;
    svc.call("draft", id, v).catch(() => {});
  };
  const onInput = () => {
    sendBtn.disabled = !words().trim();
    sizeInput();
    clearTimeout(draftT);
    draftT = setTimeout(flushDraft, DRAFT_MS);
  };
  async function send() {
    const text = words();
    if (!text.trim() || !id) return;
    if (text.length > MAX_TEXT) { fw.toast("That’s too long to send in one message."); return; }
    sending++;
    const was = text, cid = id, at = episode, quoted = replyTo;
    selectReply(null);
    const clearedReplyAt = replyAt;
    input.value = ""; draftSent = ""; onInput(); clearTimeout(draftT);
    stick = true;
    try {
      const r = await svc.call("sendText", cid, was, quoted ? { replyTo: quoted } : {});
      if (!r || r.ok === false || r.err) throw r;
      if (id === cid && episode === at && !input.value) svc.call("draft", cid, "").catch(() => {});
    } catch (e) {
      if (id !== cid || episode !== at) return;
      const why = e?.why || e?.err;
      if (!input.value) { input.value = was; if (replyAt === clearedReplyAt) selectReply(quoted); onInput(); }
      fw.toast(why === "trust" ? "Check the safety number first: their key has changed." : why === "offline" ? "No signal. It’ll go when you’re back online." : why === "locked" ? "Chats is locked." : e?.said || "Couldn’t send that. Try again.");
    } finally { sending--; }
  }
  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } };
  const onSubmit = (e) => { e.preventDefault(); send(); };

  // ---- taps ----
  const onClick = (e) => {
    const a = e.target.closest?.("[data-act]");
    if (!a || !box.contains(a) || e.target.closest?.(".ch-words a[href]")) return;
    const mid = a.dataset.id;
    switch (a.dataset.act) {
      case "latest": e.preventDefault(); stick = true; toBottom(); break;
      case "cancel-reply": selectReply(null); input.focus({ preventScroll: true }); break;
      case "send": e.preventDefault(); send(); break;
      case "photo": ctx.open.photo(id); break;
      case "voice": ctx.open.voice(id); break;
      case "view": e.stopPropagation(); ctx.open.view(mid); break;
      case "play": e.stopPropagation(); ctx.open.view(mid); break;
      case "map": ctx.open.map(mid); break;
      case "hold": {
        const cid = id, at = episode;
        let focusReply = false;
        const current = () => id === cid && episode === at && !box.hidden;
        ctx.open.hold({ kind: "msg", chatId: cid, msgId: mid,
          on: (act) => { if (act === "reply" && current()) { selectReply(mid); focusReply = replyTo === mid; } },
          onClose: () => { if (focusReply && current() && replyTo === mid) input.focus({ preventScroll: true }); } });
        break;
      }
      case "safety": ctx.open.safety(id); break;
    }
  };
  const onMessageKey = (e) => {
    if ((e.key === "Enter" || e.key === " ") && !e.repeat && e.target.matches?.('.ch-b[role="button"]')) { e.preventDefault(); onClick(e); }
  };
  const onHidden = () => { flushDraft(); settleMotion(); };
  // (the chat on screen and the page in sight: marked read, as Chat's loadChat does)
  const markRead = () => { if (id && fw.visible()) svc.call("read", id).catch(() => {}); };
  box.addEventListener("click", onClick);
  box.addEventListener("keydown", onMessageKey);
  composer.addEventListener("submit", onSubmit);
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKey);
  input.addEventListener("focus", fit);
  input.addEventListener("blur", fit);
  scroller.addEventListener("scroll", onScroll, { passive: true });
  msgs.addEventListener("animationend", onMotionEnd);
  msgs.addEventListener("animationcancel", onMotionEnd);

  let hiddenOff = null;
  function leave() {
    if (!id) return;
    flushDraft();
    const a = topMsg();
    if (a && !stick) anchors.set(id, a); else anchors.delete(id);
    for (const f of offs) f();
    offs = [];
    t.stop();
    hiddenOff?.(); hiddenOff = null;
    vv?.removeEventListener("resize", fit);
    vv?.removeEventListener("scroll", fit);
    draw.cancel();
    // (the words leave the page with you: the DOM emptied, the store's copy let go of)
    msgs.replaceChildren(); warn.replaceChildren(); input.value = ""; draftSent = ""; latest.hidden = true;
    episode++; selectReply(null);
    paintedMessages = null; newestMessageAt = 0;
    store.apply(`chat:${id}`, null);
    store.apply(`typing:${id}`, null);
    headerAvatar = null; headerName = "";
    fw.header.set({ conversation: false, avatar: null });
    id = null;
    box.hidden = true;
  }
  return {
    async show(route) {
      const cid = typeof route === "string" ? route : route?.arg;
      if (!cid) return false;
      if (id && id !== cid) leave();
      if (id === cid) { header(); return true; }
      id = cid; episode++; stick = true; lastFirst = null;
      box.hidden = false;
      fw.fill(true);
      fw.tabs?.away?.(true);
      msgs.replaceChildren(el("p", { class: "ch-opening", text: "Opening your messages…" }));
      offs = [
        store.on(`chat:${cid}`, draw),
        store.on(`typing:${cid}`, (v) => { typing.hidden = !v?.on; if (stick) toBottom(); }),
        store.on("friends", header), store.on("groups", header),
      ];
      vv?.addEventListener("resize", fit);
      vv?.addEventListener("scroll", fit);
      hiddenOff = fw.on("hidden", onHidden);
      const visOff = fw.on("visible", () => { fit(); markRead(); });
      offs.push(visOff);
      fit();
      header();
      t.start();
      const r = await svc.call("open", cid).catch((e) => ({ err: e?.why || "failed" }));
      if (id !== cid) return false;
      if (!r || r.err || r.ok === false) {
        const why = r?.err || r?.why;
        if (why === "no" || why === "failed" || why == null) return false;     // (chats.js says it and goes to the list)
        msgs.replaceChildren(el("p", { class: "ch-opening", text: why === "offline" ? "No signal. This chat will open when you’re back online." : "This chat couldn’t open just now." }));
        return true;
      }
      if (r.id === cid && Array.isArray(r.msgs)) store.apply(`chat:${cid}`, r);
      const a = anchors.get(cid);
      draw.now();
      if (a && restore(a)) stick = atBottom(); else { stick = true; toBottom(); }
      latest.hidden = stick;
      markRead();
      return true;
    },
    hide() {
      if (!id) return;
      leave();
      fw.tabs?.away?.(false);
      fw.fill(false);
    },
    busy: () => !!(id && (words().trim() || sending)),
    flush() { flushDraft(); return { lost: 0 }; },
    back: () => false,
    get id() { return id; },
    unmount() {
      this.hide();
      box.removeEventListener("click", onClick);
      box.removeEventListener("keydown", onMessageKey);
      composer.removeEventListener("submit", onSubmit);
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey);
      input.removeEventListener("focus", fit);
      input.removeEventListener("blur", fit);
      scroller.removeEventListener("scroll", onScroll);
      msgs.removeEventListener("animationend", onMotionEnd);
      msgs.removeEventListener("animationcancel", onMotionEnd);
      box.remove();
    },
  };
}
