// Send to a friend under the roof (stage 3 spec S3-D7, §2.2): Chat's send sheet (openSendSheet/sendRows/drawSend,
// pigeon/app.js) in a framework sheet, data-sheet=send. Lazy, kept offline (connector.lazy). Sealing is the core's
// sendRun (trustedPub/keysOf gate every send); this file draws, picks and says.
// Frozen opener: openSend(ui, svc, { card, words, to }) → Promise<{ ok: true, say } | { ok: false, why }>
//   ui: F.forModule("chats") (a fw); svc: the full service ({ call, on }); card: a card object, or a packed one (the
//   string of #share=…&card=<packed>), checked exactly as engineCard did (readShareHash → normCard); words: ≤ 500
//   characters; to: a friend's or group's id to start picked. Added (optional): back, a path of this site's (hubPath's
//   rule) that Done, Back and a sent card return to (the #share=…&back= route's).
// The five not-ready states (S3-D7), from the core's state: signin "Sign in to send this" + Sign In; key "Unlock Chats
// on this phone to send this" + Unlock Chats; locked: the Chats screen's lock first, then this sheet (drawn as soon as
// the state is ready); device "Chats is on your phone"; offline: the sheet, with the outbox note. After signin/key the
// card isn't kept ("Unlock Chats, then tap Send again", S3-Q8). Progress from the core's `send` patches
// ({ id, step: "sealing" | "sent" | "failed", why }); sent: ui.toast with stillHere's words.
// Privacy: the words and the card cross to the core by postMessage only (never a URL, storage or a log); every string
// from data goes in through textContent; the card is drawn by cardview.js (its HTML escapes everything it's given).
import { readShareHash, normCard, cardWords, ASK_KINDS } from "../cards.js";
import { sheetCardHtml } from "../cardview.js";

export const SIGN_IN = "/chats/in/#signin-start&then=%2Fchats%2F";
// the why a sheet put away unsent gives (Chat's engine's word for it; not one of the core's refusals)
export const CLOSED = "closed";
const SEND_MAX = 12;
// the words for each state that stops a send here (S3-D7)
export const NOT_READY = Object.freeze({
  signin: { title: "Sign in to send this", body: "Sign in to Chats, then tap Send again.", act: "Sign In" },
  key: { title: "Unlock Chats on this phone to send this", body: "Unlock Chats, then tap Send again.", act: "Unlock Chats" },
  locked: { title: "Chats is locked", body: "Unlock Chats, and this is ready to send." },
  device: { title: "Chats is on your phone", body: "Open InFlite on your phone to send this to a friend." },
  ended: { title: "You’ve been signed out of Chats", body: "Sign in to Chats, then tap Send again.", act: "Sign In" },
});
export const OFFLINE_NOTE = "It’ll go when you’re back online";

// a path of this site's, as Chat's hubPath (back=)
export const hubPath = (p) => typeof p === "string" && p.length > 0 && p.length <= 200 && p[0] === "/" && p[1] !== "/" && !/[:\\\u0000-\u001f\u007f]/.test(p);
// as engineCard (pigeon/app.js): the words cleaned and cut, the packed card read through readShareHash; a card object
// through normCard as a #share= card is. → { card, words } | null
export function engineCard(words, card) {
  const w = String(words ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500);
  if (card && typeof card === "object") { const c = normCard(card, { from: "hash" }); return c ? { card: c, words: w } : null; }
  const c = typeof card === "string" && /^[A-Za-z0-9_-]+$/.test(card) ? `&card=${card}` : "";
  let r = null; try { r = readShareHash(`#share=${encodeURIComponent(w)}${c}`); } catch (_) {}
  return r?.card ? { card: r.card, words: typeof r.words === "string" ? r.words : w } : null;
}
// the #share=<words>&card=<packed>&back=<path> route's raw hash → { words, card (packed), back } (nothing kept)
export function shareOf(hash) {
  let q; try { q = new URLSearchParams(String(hash || "").replace(/^#/, "")); } catch (_) { return null; }
  if (!q.has("share")) return null;
  const back = q.get("back");
  return { words: q.get("share") || "", card: q.get("card") || "", back: hubPath(back) ? back : null };
}
export const stillHere = (say) => (/still here/i.test(say) ? say : `${String(say).replace(/[.\s]+$/, "")}. You’re still here`);
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
export function goLabel(names, busy) {
  if (busy) return `Sending ${busy[0]} of ${busy[1]}…`;
  if (!names.length) return "Choose a Friend";
  return names.length === 1 ? `Send to ${names[0]}` : names.length === 2 ? `Send to ${names[0]} and ${names[1]}` : `Send to ${names.length} Friends`;
}

let shown = null;

export function openSend(ui, svc, { card, words = "", to = null, back = null } = {}) {
  const x = engineCard(words, card);
  if (!x) return Promise.resolve({ ok: false, why: "card" });
  const goBack = hubPath(back) ? back : null;
  try { shown?.close(); } catch (_) {}
  const el = ui.ui.el;
  return new Promise((resolve) => {
    let done = false, h = null, state = null, rows = null, why = {}, err = "", busy = null, sending = false, drawnAs = null;
    const s = { pick: [], when: "now", ask: false, words: x.words, edited: false };
    const offs = [];
    const finish = (r) => {
      if (done) return;
      done = true;
      for (const f of offs.splice(0)) { try { f(); } catch (_) {} }
      resolve(r);
      if (goBack) ui.nav.go(goBack, { replace: true });
    };

    /* -- the card, as cardview.js draws it (escaped there) -- */
    function cardEl() {
      let html = "";
      try { html = sheetCardHtml(x.card, { viewAt: Date.now() }); } catch (_) {}
      const box = el("div", { class: "chsend-card" });
      if (html) { const t = box.ownerDocument.createElement("template"); t.innerHTML = html; box.append(t.content); }
      else box.append(el("p", { class: "chsend-say", text: x.card.say || cardWords(x.card) || "" }));
      return box;
    }
    function wordsEl() {
      const f = ui.ui.field({ value: s.words, placeholder: "Add a line", label: "Words to go with it", onInput: (v) => { s.words = String(v).slice(0, 500); s.edited = true; } });
      f.input.maxLength = 500;
      f.dataset.act = "words";
      return f;
    }

    /* -- not ready: words and the one way on -- */
    function notReady(box, st) {
      const w = NOT_READY[st];
      box.append(cardEl());
      const acts = w.act ? [{ label: w.act, primary: true, href: SIGN_IN, act: "signin" }] : [];
      const e = ui.ui.empty({ title: w.title, body: w.body, acts });
      e.dataset.state = st;
      box.append(e);
      if (st === "signin" || st === "key" || st === "ended") {
        // (the card isn't kept across the sign-in trip: S3-Q8)
        for (const a of e.querySelectorAll("a")) a.addEventListener("click", () => finish({ ok: false, why: st }));
      }
    }

    /* -- ready (or offline): the friends, ranked for the card -- */
    function sheet(box) {
      box.append(cardEl(), wordsEl());
      if (state === "offline") box.append(el("p", { class: "chsend-note", role: "status", data: { state: "offline" }, text: OFFLINE_NOTE }));
      if (!rows) { box.append(ui.ui.skeleton("rows", 3)); return; }
      if (!rows.length) {
        box.append(ui.ui.empty({ title: "No friends yet", body: "Add a friend in Chats, and you can send them this." }));
        return;
      }
      s.pick = s.pick.filter((id) => rows.some((r) => r.id === id && r.can !== false));
      const picks = rows.filter((r) => s.pick.includes(r.id));
      const names = picks.map((r) => (r.kind === "group" ? r.name : first(r.name)));
      const list = rows.map((r) => {
        const on = s.pick.includes(r.id), can = r.can !== false;
        const sub = !can ? (r.why || (r.keyChanged ? "Check the new safety number first" : "")) : why[r.id]?.why || (r.kind === "group" ? "Group" : "");
        const b = ui.ui.row({ lead: { avatar: r.name }, title: r.kind === "group" ? r.name : first(r.name), sub, run: () => pick(r.id) });
        b.setAttribute("role", "checkbox");
        b.setAttribute("aria-checked", String(on));
        b.dataset.act = "pick"; b.dataset.id = r.id;
        b.classList.add("chsend-row");
        if (!can) { b.classList.add("dim"); if (!on) b.disabled = true; }
        if (why[r.id]?.best || r.best) b.append(el("span", { class: "chsend-tag", text: "Best fit" }));
        return b;
      });
      box.append(ui.ui.list(list, { label: "Send To" }));
      const chip = (k, label) => el("button", { type: "button", role: "radio", class: "chsend-chip", data: { act: "when", value: k }, aria: { checked: String(s.when === k) }, text: label });
      const chips = el("div", { class: "chsend-chips", role: "radiogroup", "aria-label": "When it arrives" }, chip("now", "Now"), chip("asap", "By Pigeon"));
      chips.addEventListener("click", (e) => { const b = e.target.closest?.("[data-act=when]"); if (b && !sending) { s.when = b.dataset.value; redraw(); } });
      box.append(el("h3", { class: "ifl-label", text: "When It Arrives" }), chips);
      if (ASK_KINDS.includes(x.card.kind)) {
        const ask = ui.ui.row({ title: "Ask “How’s Yours?”", trail: "switch", checked: s.ask, onChange: (v) => { s.ask = !!v; } });
        ask.dataset.act = "ask";
        box.append(ui.ui.list([ask]));
      }
      const go = ui.ui.btn(goLabel(names, busy), { primary: true, act: "go", run: send });
      go.disabled = !picks.length || sending;
      box.append(el("div", { class: "chsend-go" }, go,
        goBack && !sending ? el("p", { class: "chsend-foot", text: "Once it’s sent, you’re back where you were." }) : null,
        err ? el("p", { class: "chsend-err", role: "alert", text: err }) : null));
    }

    function pick(id) {
      if (sending) return;
      const r = rows?.find((y) => y.id === id); if (!r) return;
      const i = s.pick.indexOf(id);
      if (i >= 0) s.pick.splice(i, 1);
      else {
        if (r.can === false) return;
        if (s.pick.length >= SEND_MAX) { ui.toast("12 at most, at one go."); return; }
        s.pick.push(id);
      }
      redraw();
    }

    async function send() {
      if (sending || !s.pick.length) return;
      sending = true; err = ""; busy = [1, s.pick.length];
      h?.setBusy?.(true);
      redraw();
      let r = null;
      try { r = await svc.call("sendRun", { card: x.card, words: (s.edited ? s.words : x.words).trim().slice(0, 500) || x.card.say || cardWords(x.card) || "", pick: [...s.pick], when: s.when, ask: !!s.ask }); }
      catch (e) { r = { ok: false, why: e?.why || "failed", sent: [], failed: [...s.pick] }; }
      sending = false; busy = null;
      h?.setBusy?.(false);
      if (r?.ok && !(r.failed || []).length) {
        const say = String(r.say || "Sent").slice(0, 200);
        ui.toast(stillHere(say));
        finish({ ok: true, say });
        try { h?.close(); } catch (_) {}
        return;
      }
      // (what went is no longer picked; what didn't stays, to try again)
      s.pick = s.pick.filter((id) => !(r?.sent || []).includes(id));
      err = r?.why === "offline" ? `No signal. ${OFFLINE_NOTE}.` : r?.why === "trust" ? "Check the new safety number first." : r?.say || "Couldn’t send it. Try again.";
      redraw();
    }

    let box = null;
    function redraw() {
      if (!h || h.closed) return;
      const keep = box?.querySelector?.("[data-act=words] input");
      if (keep) s.words = keep.value;
      box.replaceChildren();
      drawnAs = state;
      if (NOT_READY[state]) notReady(box, state);
      else sheet(box);
    }
    async function load() {
      try {
        const [r, k] = await Promise.all([svc.call("share", x.card, x.words), svc.call("rank", x.card).catch(() => ({}))]);
        rows = Array.isArray(r) ? r : [];
        why = k && typeof k === "object" ? k : {};
        if (to && !s.pick.length && rows.some((y) => y.id === to && y.can !== false)) s.pick = [to];
      } catch (e) {
        rows = [];
        if (NOT_READY[e?.why] || e?.why === "offline") state = e.why;
      }
      redraw();
    }

    h = ui.sheet.open({
      sheet: "send", title: "Send to a Friend", app: "chats",
      body: (b) => { box = el("div", { class: "chsend" }); b.append(box); },
      onClose: () => { if (shown === h) shown = null; finish({ ok: false, why: CLOSED }); },
    });
    shown = h;
    // progress, from the core's send patches
    if (svc.on) offs.push(svc.on("send", (d) => {
      if (!d || !sending || !busy) return;
      if (d.step === "sent" || d.step === "failed") { busy = [Math.min(busy[0] + 1, busy[1]), busy[1]]; redraw(); }
    }));
    // the state, as it changes: locked → ready draws the sheet (S3-D7); a sign-out mid-way says so
    if (svc.on) offs.push(svc.on("state", (d) => {
      const st = d?.state; if (!st || st === state) return;
      const was = state; state = st;
      if ((st === "ready" || st === "offline") && (rows == null || NOT_READY[was])) { rows = null; redraw(); load(); }
      else if (drawnAs !== st) redraw();
    }));
    svc.call("state").then((r) => {
      state = r?.state || "ready";
      redraw();
      if (!NOT_READY[state]) load();
    }, (e) => { state = NOT_READY[e?.why] || e?.why === "offline" ? e.why : "offline"; redraw(); if (state === "offline") load(); });
    redraw();
  });
}
