// The site's admin, on its admin's account page (account/app.js): its own file, fetched only for the account that's the
// site's admin, so no one else's page carries it. The page hands over what it draws with (setup), and gets back the
// Admin row for the page and the Admin sheet.
export function setup({ $, sheetEl, API, S, Sheet, again, ago, avatar, busy, call, day, draw, field, freshly, grow, h, icon, ms, openSheet, passkeysView, patch, photo, post, pushSheet, redraw, row, say, section, siteUrl, still, toast, tok, when }) {
  // ---- the site's admin: only on the linked account's page (linked once from the old dashboard: functions/api/pigeon).
  // Each sheet asks for what it shows when it's opened. Looking needs you to have shown it's you in the last 12 hours,
  // a change in the last 10 minutes: the server says when, and it's asked for here as for anything else ----
  const AD = { sum: null, asked: false, data: {}, busy: {}, more: {}, err: {}, q: "", note: "", link: null, invite: null, fresh: new Set(), msgOpen: null };
  // (asked again while it's being asked: again once that's in, so a change just made is in it)
  const admAsk = (key, again) => {
    if (AD.busy[key]) { if (again) AD.more[key] = true; return AD.data[key]; }
    if (!again && (AD.data[key] || AD.err[key])) return AD.data[key];
    AD.busy[key] = true; AD.err[key] = null;
    freshly(() => call(`admin/${key}`)).then((x) => { AD.data[key] = x; if (key === "summary") { AD.sum = x; patch(); } else if (!AD.sum) admChanged(); },
      (e) => { AD.err[key] = e.quiet ? "Confirm it’s you to see this." : e.message; })
      .finally(() => { AD.busy[key] = false; if (AD.more[key]) { AD.more[key] = false; admAsk(key, true); } redraw(); });
    return AD.data[key];
  };
  // (Admin's figures: asked once, and again after a change)
  function admSum() {
    if (AD.asked) return;
    AD.asked = true;
    admAsk("summary", true);
  }
  // (after a change: the figures and the log asked again)
  function admChanged() { AD.asked = false; AD.data.log = null; AD.err.log = null; patch(); }
  // (a change: where it needs you to confirm it's you, that's asked there, in the sheet)
  const admPost = (b, label, path, body) => freshly(() => busy(b, label, () => post(`admin/${path}`, body)), b);
  const admWait = (key) => AD.err[key]
    ? h("div.group", {}, h("div.empty", { text: AD.err[key] }), h("button.row.action", { type: "button", onclick: () => { admAsk(key, true); redraw(); } }, "Try again"))
    : h("div.group.adm-wait", {}, h("div.empty", {}, h("span.spin")));
  const admInfo = (t, v, warn) => h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: t })), h("span.val" + (warn ? ".warn" : ""), { text: String(v) }));
  const num = (n) => Number(n || 0).toLocaleString("en-GB"), pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const nOf = (n, one, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;
  const upper = (s) => s[0].toUpperCase() + s.slice(1);
  const isOn = (u) => !!u.last_seen && Date.now() - u.last_seen < 150e3;      // (the app checks in every 15 s, noted once a minute)
  function seenAt(t) {
    if (!t) return "Never";
    const d = new Date(t), hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (d.toDateString() === new Date().toDateString()) return `Today ${hm}`;
    if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return "Yesterday";
    return Date.now() - t < 6 * 864e5 ? `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${hm}` : day(t);
  }
  function admAvatar(u, xl) {
    const hue = ([...String(u.handle || u.id)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0) % 5 + 1;
    const el = h(`span.adm-av.h${hue}${xl ? ".xl" : ""}`, { "aria-hidden": "true" }, [...String(u.name || u.handle).trim().split(/\s+/).map((w) => [...w][0] || "").join("")].slice(0, 2).join("").toUpperCase());
    if (u.avatar_at) el.append(photo(`${API}/admin/avatar?id=${encodeURIComponent(u.id)}&v=${u.avatar_at}`, { loading: "lazy" }));
    return el;
  }
  const onNow = (u) => isOn(u) && [" · ", h("span.adm-on", { text: "Online now" })];
  // (a link shown once, to copy: a reset link, an invite)
  const admCopy = (url, note) => [h("div.group", {}, h("div.row.plain", {}, h("code.adm-code", { text: url })),
    h("button.row.action", { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(url); toast("Copied."); } catch (_) { toast("Couldn’t copy it: select it instead.", true); } } }, "Copy link")),
    h("p.hint", { text: note })];

  // Admin: a row under your card (how many accounts, who's been on, a count of new messages; or what needs you), that
  // opens into its folder: the figures first, anything that needs you, then People (accounts, invites, messages), The
  // site (its use, its storage, its email, the log) and the Home page, each a step further in
  function adminRow(m) {
    if (!m.admin.ready) return section(null, h("div.group.glass", {},
      row({ icon: "sliders", tint: "indigo", title: "Admin", value: h("span.mini.go", { text: "Add a passkey" }), onclick: () => openSheet(passkeysView) })));
    admSum();
    const s = AD.sum, alert = s && admAlerts(s)[0];
    return section(null, h("div.group.glass", {},
      row({ icon: "sliders", tint: "indigo", title: "Admin", sub: alert ? alert.title : s ? `${nOf(s.accounts, "account")} · ${num(s.today)} active today` : null, subWarn: !!alert,
        value: s?.unread ? newCount(s.unread) : null, onclick: () => openSheet(adminView) })));
  }
  // (a count of what's new, as a badge)
  const newCount = (n) => h("span.count", {}, num(n), h("span.vh", { text: " new" }));
  // what needs you, most pressing first: email off or failing, landings nobody's been told of
  function admAlerts(s) {
    const out = [];
    if (!s.email) out.push({ title: "Email is off", text: "Password resets and notifications can’t be emailed.", open: admEmailView });
    else if (s.mailFail) out.push({ title: "Email isn’t sending", text: `The last ${s.mailFail.n} failed · since ${seenAt(s.mailFail.since).replace(/^Today /, "").replace(/^Yesterday/, "yesterday")}`, open: admEmailView });
    if (s.late) out.push({ title: `${nOf(s.late, "landing")} not told yet`, text: "Notifications are running late.", open: admInsightsView });
    // (the scheduled jobs that send notifications: one that's run before but not in the last 20 minutes, said; and the server's errors today)
    const stale = [["InFlight", s.ticks?.inflight], ["Weather", s.ticks?.weather]].filter(([, k]) => k && Date.now() - k.at > 20 * 60e3);
    if (s.ticks && stale.length) out.push({ title: `${stale.map(([n]) => n).join(" and ")} notifications aren’t running`,
      text: stale.map(([n, k]) => (k ? `${n}: last ran ${seenAt(k.at)}` : `${n}: hasn’t run yet`)).join(" · "), open: admServerView });
    if (s.errors?.length) out.push({ title: `${nOf(s.errors.length, "server error")} today`, text: `Latest: ${s.errors[0].src} · ${seenAt(s.errors[0].at)}`, open: admServerView });
    return out;
  }
  // The server: when the scheduled jobs last ran, and its errors today (newest first: where, what, when)
  function admServerView() {
    const s = AD.sum || {}, k = s.ticks || {}, errs = s.errors || [];
    const info = (t, v) => h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: t })), h("span.val", { text: v }));
    const ran = (x) => (x ? `${seenAt(x.at)} · ${(x.ms / 1000).toFixed(1)} s` : "Not yet");
    return { title: "Server", body: [
      h("div.group", {}, info("InFlight’s notifications", ran(k.inflight)), info("Weather’s notifications", ran(k.weather))),
      h("p.hint", { text: "Each runs every few minutes (on a schedule, and whenever the apps are used). Over 20 minutes since the last run means notifications are late." }),
      errs.length ? h("div.group", {}, errs.map((e) => h("div.row.plain", {}, h("span.tx", {}, h("b", { text: e.src }), h("small", { text: `${e.msg} · ${seenAt(e.at)}` })))))
        : h("div.group", {}, h("div.empty", { text: "No errors today." }))] };
  }
  function adminView() {
    admSum();
    const s = AD.sum;
    if (!s) return { title: "Admin", body: [admWait("summary")] };
    const tile = (n, what, cls = "") => h("div.adm-tile" + cls, {}, h("b", { text: num(n) }), h("span", { text: what }));
    const home = s.home || {};
    return { title: "Admin", body: [
      h("div.adm-tiles", {}, tile(s.accounts, s.accounts === 1 ? "account" : "accounts"), tile(s.today, "active today"),
        s.unread ? tile(s.unread, s.unread === 1 ? "new message" : "new messages", ".new") : tile(s.messages, s.messages === 1 ? "message" : "messages")),
      ...admAlerts(s).map((a) => h("button.adm-alert", { type: "button", onclick: () => pushSheet(a.open) },
        icon("alert", 22, 2.2), h("span.tx", {}, h("b", { text: a.title }), h("small", { text: a.text })), h("span.mini", { text: "Check" }))),
      h("h4.app-k", { text: "People" }),
      h("div.group", {},
        row({ icon: "people", tint: "blue", title: "Accounts", sub: s.newWeek ? `${num(s.newWeek)} new this week` : null, value: num(s.accounts), onclick: () => pushSheet(admAccountsView) }),
        h("div.row-plus", {},
          row({ icon: "link", tint: "indigo", title: "Invites", value: s.invites ? `${num(s.invites)} waiting` : "None waiting", onclick: () => { AD.invite = null; pushSheet(admInvitesView); } }),
          h("button.plus", { type: "button", "aria-label": "Make an invite", onclick: (e) => admQuickInvite(e.currentTarget) }, icon("plus", 18, 2.6))),
        row({ icon: "bubble", tint: "teal", title: "Messages", sub: s.lastMessage ? `${s.lastMessage.name} · ${seenAt(s.lastMessage.at)}` : "None yet",
          value: s.unread ? newCount(s.unread) : s.messages ? num(s.messages) : null,
          onclick: () => { AD.data.messages = null; AD.err.messages = null; AD.fresh = new Set(); AD.msgOpen = null; pushSheet(admMessagesView); } })),
      h("h4.app-k", { text: "The site" }),
      h("div.group", {},
        row({ icon: "chart", tint: "green", title: "Insights", value: s.online ? `${num(s.online)} online now` : null, onclick: () => pushSheet(admInsightsView) }),
        row({ icon: "db", tint: "grey", title: "Storage", value: s.storage == null ? null : bytes(s.storage), onclick: () => pushSheet(admStorageView) }),
        row({ icon: "mail", tint: "red", title: "Email", value: !s.email ? "Off" : s.mailFail ? "Not sending" : h("span.adm-ok", {}, icon("check", 15, 3), "Working"),
          warn: !s.email || !!s.mailFail, onclick: () => pushSheet(admEmailView) }),
        ((late) => row({ icon: "info", tint: "blue", title: "Server", value: late ? "Late" : s.errors?.length ? nOf(s.errors.length, "error") : h("span.adm-ok", {}, icon("check", 15, 3), "Running"),
          warn: late || !!s.errors?.length, onclick: () => pushSheet(admServerView) }))(!!s.ticks && [s.ticks.inflight, s.ticks.weather].some((k) => k && Date.now() - k.at > 20 * 60e3)),
        row({ icon: "clock", tint: "amber", title: "Admin log", value: s.logAt ? upper(when(s.logAt)) : null, onclick: () => pushSheet(admLogView) })),
      h("h4.app-k", { text: "Home page" }),
      h("div.group", {},
        row({ icon: "home", tint: "green", title: "Home page", sub: [nOf(home.photos || 0, "photo"), home.editedAt && `words changed ${when(home.editedAt)}`].filter(Boolean).join(" · "),
          value: h("span.mini.go", { text: "Edit" }), onclick: () => { location.href = siteUrl("") + "#edit"; } })),
    ] };
  }
  // + on Invites: a link made there and then, to share or copy (a name for it, and the list, are in Invites)
  async function admQuickInvite(b) {
    try {
      const r = await admPost(b, "", "invite", {});
      AD.data.invites = null; admChanged();
      pushSheet(() => admNewInviteView(r.url));
    } catch (err) { if (!err.quiet) toast(err.message, true); }
  }
  function admNewInviteView(url) {
    const share = typeof navigator.share === "function" && h("button.btn", { type: "button", onclick: () => navigator.share({ title: "An invite", url }).catch(() => {}) }, icon("share", 19, 2.2), "Share");
    const copy = h("button.btn" + (share ? ".quiet" : ""), { type: "button", onclick: async () => {
      try { await navigator.clipboard.writeText(url); toast("Copied."); } catch (_) { toast("Couldn’t copy it: select it instead.", true); }
    } }, "Copy link");
    return { title: "New invite", body: [
      h("div.adm-ready", {}, h("span.big", {}, icon("link", 30, 2.2)), h("b", { text: "Invite ready" }), h("span", { text: "It makes one account. Copy it now: it isn’t shown again." })),
      h("div.group", {}, h("div.row.plain", {}, h("code.adm-code", { text: url }))),
      h("div.adm-two", {}, share, copy)] };
  }

  // Messages: what's been sent through the home page's Get in touch (it comes by email too), newest first: the new ones
  // in full, each to reply to or delete (seen now, so new no more next time); the rest a line each, opened with a tap
  function admMessagesView() {
    const x = admAsk("messages");
    if (!x) return { title: "Messages", body: [admWait("messages")] };
    if (!x.messages.length) return { title: "Messages", body: [h("div.group", {}, h("div.empty", { text: "No messages yet." }))] };
    const unseen = x.messages.filter((m) => m.new && !AD.fresh.has(m.id)).map((m) => m.id);
    if (unseen.length) {
      unseen.forEach((id) => AD.fresh.add(id));
      post("admin/messages-read", { ids: unseen }).then(() => { if (AD.sum) { AD.sum.unread = Math.max(0, AD.sum.unread - unseen.length); patch(); } }, () => {});
    }
    const acts = (m) => h("div.adm-acts", {},
      h("a.pill", { href: `mailto:${encodeURIComponent(m.email).replace(/%40/g, "@")}?subject=${encodeURIComponent("Re: your message")}` }, icon("mail", 17), "Reply"),
      h("button.pill.quiet", { type: "button", onclick: async (e) => {
        try { const r = await admPost(e.currentTarget, "Deleting…", "message-delete", { id: m.id }); x.messages = x.messages.filter((y) => y.id !== m.id);
          if (AD.sum) AD.sum.messages = x.messages.length; redraw(); patch(); toast(r.message); }
        catch (err) { if (!err.quiet) toast(err.message, true); }
      } }, icon("trash", 17), "Delete"));
    const head = (m, dot) => h("div.row.plain", {}, dot && h("span.adm-dot", { "aria-hidden": "true" }), h("span.tx", {}, h("b", { text: m.name }), h("small", { text: `${m.email} · ${seenAt(m.at)}` })));
    const fresh = x.messages.filter((m) => AD.fresh.has(m.id)), older = x.messages.filter((m) => !AD.fresh.has(m.id));
    const opened = (m) => h("div.adm-open", { tabindex: "-1", "data-msg": m.id }, head(m), h("p.adm-body", { text: m.body }), acts(m));
    // (opened where it is, going from a line to its full size, the one open before going back to a line: the rest of
    // the sheet stays as it is, scrolled where it was)
    const into = (from, to) => {
      const h0 = from.offsetHeight; from.replaceWith(to);
      if (still.matches) return;
      to.style.overflow = "hidden";
      to.animate([{ height: `${h0}px` }, { height: `${to.offsetHeight}px` }], { duration: ms("--dur-base"), easing: tok("--ease-glide") }).finished.then(() => { to.style.overflow = ""; }, () => {});
    };
    const line = (m) => AD.msgOpen === m.id ? opened(m)
      : h("button.row.adm-line", { type: "button", "data-msg": m.id, onclick: (e) => {
        const was = sheetEl.querySelector(".adm-open"), o = opened(m);
        AD.msgOpen = m.id;
        if (was) into(was, line(x.messages.find((y) => y.id === was.dataset.msg)));
        into(e.currentTarget, o); o.focus({ preventScroll: true });
        o.querySelector(".adm-body").animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms("--dur-base"), easing: tok("--ease-out") });
      } }, h("span.tx", {}, h("b", { text: m.name }), h("small", { text: m.body })), h("span.val", { text: seenAt(m.at) }));
    return { title: "Messages", body: [
      fresh.length > 0 && h("h4.app-k", { text: "New" }),
      ...fresh.map((m) => h("div.group.adm-msg", {}, head(m, true), h("p.adm-body", { text: m.body }), acts(m))),
      fresh.length > 0 && older.length > 0 && h("h4.app-k", { text: "Earlier" }),
      older.length > 0 && h("div.group", {}, older.map(line))] };
  }

  // Accounts: everyone, newest first, to search; each a tap from its own sheet
  function admAccountsView() {
    const x = admAsk("users");
    if (!x) return { title: "Accounts", body: [admWait("users")] };
    const q = h("input", { type: "search", placeholder: "Search accounts", "aria-label": "Search accounts", value: AD.q, autocomplete: "off", spellcheck: "false" });
    const list = h("div.group");
    const fill = () => {
      const t = AD.q.trim().toLowerCase(), us = x.users.filter((u) => !t || [u.name, u.handle, u.email].some((v) => String(v || "").toLowerCase().includes(t)));
      list.replaceChildren(...(us.length ? us.map((u) => h("button.row", { type: "button", onclick: () => { AD.link = null; pushSheet(() => admAccountView(u.id)); } },
        admAvatar(u), h("span.tx", {}, h("b", { text: u.name }), h("small", {}, `@${u.handle}`, onNow(u))),
        !isOn(u) && h("span.val", { text: seenAt(u.last_seen) }), h("span.chev", {}, icon("chev", 16, 2.4))))
        : [h("div.empty", { text: x.users.length ? "No accounts match." : "No one has signed up yet." })]));
    };
    q.addEventListener("input", () => { AD.q = q.value; fill(); });
    fill();
    return { title: "Accounts", body: [h("label.field.adm-search", {}, icon("search", 18, 2.2), q), list] };
  }
  // One account: who, how much, pigeons to give; a reset (by email, or a link to send yourself), signing them out,
  // and deleting it (at once, typed to confirm)
  const GIFTS = [["rocket", "Rocket", "9× faster · 1 a day"], ["turbo", "Turbo", "3× faster · 3 a day"], ["swift", "Swift", "2× faster · 9 a day"]];
  function admAccountView(id) {
    const u = AD.data.users?.users.find((x) => x.id === id);
    if (!u) return { title: "Account", body: [h("div.group", {}, h("div.empty", { text: "That account doesn’t exist any more." }))] };
    const said = h("p.said", { role: "alert" }), link = AD.link?.id === u.id ? AD.link.url : null, me = u.id === S.me.id;
    const act = (label, path, body, done) => async (e) => {
      say(said, "");
      try { const r = await admPost(e.currentTarget, label, path, { id: u.id, ...body }); admChanged(); if (done) done(r); else toast(r.message); }
      catch (err) { if (!err.quiet) say(said, err.message); }
    };
    return { title: u.name, body: [
      h("div.adm-head", {}, admAvatar(u, true), h("b", { text: u.name }), h("small", {}, `@${u.handle}`, onNow(u))),
      h("div.group", {}, admInfo("Email", u.email), admInfo("Last online", isOn(u) ? "Now" : seenAt(u.last_seen)), admInfo("Joined", day(u.created_at)),
        admInfo("Friends", num(u.friends)), admInfo("Pigeons sent", num(u.sent)), admInfo("Groups", num(u.groups)),
        admInfo("Signed in on", `${u.sessions} device${u.sessions === 1 ? "" : "s"}`), admInfo("Passkeys", u.passkeys || "None")),
      h("h4.app-k", { text: "Pigeons" }),
      h("div.group", {}, GIFTS.map(([k, name, sub]) => h("div.row.plain", {}, h("span.tx", {}, h("b", { text: name }), h("small", { text: sub })),
        h("span.val", { text: String(u.pigeons?.[k] ?? 0) }),
        h("button.mini.go", { type: "button", "aria-label": `Give 1 ${name.toLowerCase()} pigeon`,
          onclick: act("", "pigeons", { kind: k, add: 1 }, (r) => { u.pigeons = { ...u.pigeons, [k]: r.count }; toast(r.message); redraw(); }) }, "+1")))),
      h("div.group", {},
        AD.sum?.email !== false && h("button.row.action", { type: "button", onclick: act("Sending…", "reset", { mode: "email" }) }, "Email a reset link"),
        h("button.row.action", { type: "button", onclick: act("Making it…", "reset", { mode: "link" }, (r) => {
          AD.link = { id: u.id, url: r.url }; redraw();
          $(".sheet-body:not(.going) .adm-code", sheetEl)?.scrollIntoView({ block: "nearest", behavior: still.matches ? "auto" : "smooth" });      // (the link, brought into view)
        }) }, "Make a reset link"),
        h("button.row.action", { type: "button", disabled: !u.sessions, onclick: act("Signing out…", "signout", {}, (r) => { u.sessions = 0; toast(r.message); redraw(); }) }, "Sign out everywhere")),
      link && admCopy(link, "Works once, for 24 hours. Send it to them privately."),
      said,
      !me && h("div.group.apart", {}, h("button.row.action.danger", { type: "button", onclick: () => pushSheet(() => admDeleteView(u)) }, "Delete account…"))] };
  }
  function admDeleteView(u) {
    const said = h("p.said", { role: "alert" });
    const sure = h("input", { type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false", placeholder: u.handle, "aria-label": `Type ${u.handle} to confirm` });
    const go = h("button.btn.danger", { type: "submit", disabled: true }, "Delete account");
    sure.addEventListener("input", () => { go.disabled = sure.value.trim().replace(/^@/, "").toLowerCase() !== u.handle; });
    return { title: "Delete account", body: [
      h("p", { text: `This deletes @${u.handle}’s account now, with every letter they sent or received. It can’t be undone.` }),
      h("form.form", { onsubmit: async (e) => {
        e.preventDefault(); say(said, "");
        try {
          const r = await admPost(go, "Deleting…", "delete", { id: u.id, confirm: sure.value });
          AD.data.users.users = AD.data.users.users.filter((x) => x.id !== u.id); admChanged();
          Sheet.stack.length = Math.max(1, Sheet.stack.indexOf(admAccountsView) + 1); draw("back"); toast(r.message);
        } catch (err) { if (!err.quiet) say(said, err.message); }
      } }, field(`Type ${u.handle} to confirm`, h("div.at", {}, "@", sure)), go),
      said] };
  }

  // Invites: sign-up is by a link made here, good for one account (shown once: only its fingerprint's kept)
  function admInvitesView() {
    const x = admAsk("invites"), said = h("p.said", { role: "alert" });
    // (what's typed kept across a redraw, as the list comes in)
    const note = h("input", { placeholder: "Who it’s for (optional)", maxlength: "60", autocomplete: "off", "aria-label": "Who it’s for", value: AD.note });
    note.addEventListener("input", () => { AD.note = note.value; });
    const make = h("button.btn", { type: "submit" }, icon("link", 20, 2.2), "Make an invite link");
    const open = (i) => !i.usedAt && !i.revokedAt;
    const item = (i) => h("div.row", {}, h(`span.ic.${i.usedAt ? "green" : "blue"}`, {}, icon(i.usedAt ? "people" : "link", 19)),
      h("span.tx", {}, h("b", { text: i.note || "Invite" }), h("small", { text: i.usedAt ? `Used by ${i.by?.handle ? "@" + i.by.handle : "an account since deleted"} · ${day(i.usedAt)}`
        : `Unused · made ${when(i.createdAt)}` })),
      open(i) && h("button.mini", { type: "button", onclick: async (e) => {
        say(said, "");
        try { await admPost(e.currentTarget, "", "invite-revoke", { id: i.id }); i.revokedAt = Date.now(); admChanged(); redraw(); toast("Invite cancelled."); }
        catch (err) { if (!err.quiet) say(said, err.message); }
      } }, "Cancel"));
    return { title: "Invites", body: [
      h("form.form", { onsubmit: async (e) => {
        e.preventDefault(); say(said, "");
        try { const r = await admPost(make, "Making it…", "invite", { note: AD.note }); AD.invite = r.url; AD.note = ""; admAsk("invites", true); admChanged(); redraw(); }
        catch (err) { if (!err.quiet) say(said, err.message); }
      } }, h("label.field", {}, note), make),
      AD.invite && admCopy(AD.invite, "Copy it now: it isn’t shown again. It makes one account, then stops working."),
      said,
      // (the unused first, then those used; one cancelled isn't shown again)
      !x ? admWait("invites") : ((list) => list.length > 0 && h("div.group", {}, list.map(item)))([...x.invites.filter(open), ...x.invites.filter((i) => i.usedAt).slice(0, 20)])] };
  }

  // Insights: how InFlight is used, in totals over everyone (functions/_insights.js), never who sent what to whom
  const KINDS = { standard: "Standard", swift: "Swift", turbo: "Turbo", rocket: "Rocket", dumb: "Dumb (the secret one)", lunar: "Lunar", laser: "Laser", orbital: "Orbital" };
  // (grow: the first time its figures are shown, each column grows up into place, one after the next: styles.css)
  function admBars(title, vals, grow) {
    const top = Math.max(1, ...vals), total = vals.reduce((a, b) => a + b, 0);
    return h("div.adm-chart" + (grow ? ".grow" : ""), { role: "img", "aria-label": `${title}: ${num(total)} in the last ${vals.length} days` },
      h("div.adm-chead", {}, h("b", { text: title }), h("span", { text: `${num(total)} in ${vals.length} days` })),
      h("div.adm-bars", { "aria-hidden": "true" }, vals.map((v, j) => { const i = h("i"); i.style.height = `${(v / top) * 100}%`; i.style.setProperty("--j", j); return i; })));
  }
  function admMeter(label, n, of, val, j = 0) {
    const i = h("i"); i.style.width = `${of ? Math.max(n ? 2 : 0, (n / of) * 100) : 0}%`; i.style.setProperty("--j", j);
    return h("div.adm-meter", {}, h("span.ml", { text: label }), h("span.mbar", { "aria-hidden": "true" }, i), h("span.mv", { text: val ?? `${num(n)} · ${pct(n, of)}%` }));
  }
  function admInsightsView() {
    const x = admAsk("insights");
    if (!x) return { title: "Insights", body: [admWait("insights")] };
    const P = x.people, R = x.retention, F = x.features, U = x.adoption, H = x.health, kindsN = x.kinds.reduce((a, k) => a + k.n, 0);
    // (its charts grow in when it's first shown with them: gone on to, or once they've come; not when it's drawn again
    // with them counted again, nor with Reduce Motion)
    const grow = !still.matches && (Sheet.mode !== "same" || Sheet.waited), g = grow ? ".grow" : "";
    const stat = (n, label) => h("div.stat", {}, h("b", { text: String(n) }), h("span", { text: label }));
    const meters = (list, of) => h("div.group.adm-meters" + g, {}, list.map(([l, n], j) => admMeter(l, n, of, null, j)));
    return { title: "Insights", body: [
      h("div.stats", {}, stat(num(P.today), "today"), stat(num(P.week), "this week"), stat(num(P.month), "this month"), stat(R.old ? `${pct(R.back, R.old)}%` : "–", "came back")),
      admBars("Pigeons sent", x.days.sent, grow), admBars("People active", x.days.active, grow), admBars("New accounts", x.days.joined, grow),
      h("h4.app-k", { text: "Coming back" }),
      h("div.group.adm-meters" + g, {}, R.weeks.length ? R.weeks.map((w, j) => { const n = w.secondWeek ?? w.back;
        return admMeter(`Joined ${w.weeksAgo}–${w.weeksAgo + 1} weeks ago`, n, w.joined, `${num(n)} of ${num(w.joined)}`, j); })
        : h("div.empty", { text: "No one’s been here long enough yet." })),
      h("h4.app-k", { text: `Pigeons, last 30 days · ${num(F.total)}` }),
      x.kinds.length ? meters(x.kinds.map((k) => [KINDS[k.kind] || upper(k.kind), k.n]), kindsN) : h("div.group", {}, h("div.empty", { text: "None sent yet." })),
      h("h4.app-k", { text: "Features used" }),
      meters([["To a group", F.group], ["With a photo or voice", F.photo], ["Mystery pigeon", F.mystery], ["Scheduled", F.sched], ["With a stopover", F.via],
        ["Cheered on", F.cheered], ["Scenic or safe route", F.styled], ["To or from space", F.space], ["Disappearing", F.vanish], ["Pigeon Death on", F.risky], ["Called back", F.recalled]], F.total),
      h("h4.app-k", { text: `Accounts · ${num(P.total)}` }),
      meters([["Have a friend", U.friends], ["In a group", U.groups], ["Notifications on", U.push], ["Email confirmed", U.email], ["Passkey", U.passkey],
        ["Named pigeons", U.birds], ["Pigeon Death on", U.risky], ["Approximate location", U.approx], ["Living in space", U.space]], P.total),
      h("h4.app-k", { text: "Landing on time" }),
      h("div.group", {}, admInfo("In the air now", num(H.flying)), admInfo("Landed today", num(H.landed)), admInfo("Lost to Pigeon Death today", num(H.lost)),
        admInfo("Landings not told yet", H.late ? num(H.late) : "None", !!H.late)),
      h("div.group", {}, h("button.row.action", { type: "button", onclick: () => { admAsk("insights", true); redraw(); } }, AD.busy.insights ? "Counting…" : "Count again"))] };
  }

  // Storage: what's kept across the site, and how much, by app; each app's own page one tap on (functions/_retention.js)
  const bytes = (n) => (n == null ? "–" : n < 1024 ? `${Math.round(n)} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
  const ST_APPS = [["fitness", "Fitness", "#f2552c"], ["inflight", "InFlight", "#2f7bf6"], ["home", "Home page", "#a855f7"], ["weather", "Weather", "#3ab0f0"], ["account", "Accounts", "#8e8e93"]];
  const ST_KINDS = { photos: "Photos and voice", group: "Group photos", avatars: "Profile pictures", posters: "Card photos", bg: "Site backgrounds",
    rides: ["Ride and run files", "FIT, GPX and TCX"], garmin: "From Garmin, not yet read", strava: "From Strava, not yet read" };
  const ROWS = { fx_acts: "Activities", fx_well: "Nights and check-ins", fx_health: "From Apple Health", fx_health_key: "Apple Health links", fx_state: "Plans and settings",
    fx_garmin: "Linked to Garmin", fx_garmin_new: "Waiting from Garmin", fx_strava: "Linked to Strava", fx_strava_new: "Waiting from Strava", fx_push: "Phones with reminders", fx_meta: "Its own notes",
    wx_subs: "Places with notifications", wx_devs: "Devices", wx_accts: "Accounts’ places and settings", wx_obs: "Observations kept", wx_meta: "Its own notes",
    messages: "Messages from the contact form",
    pg_users: "People", pg_sessions: "Signed in", pg_passkeys: "Passkeys", pg_challenges: "Sign-ins under way", pg_resets: "Password resets", pg_handoff: "Into an app, signed in",
    pg_handback: "Back from an app, signed in", pg_handles_held: "Handles held", pg_invites: "Invites", pg_events: "Account emails’ links", pg_limits: "Rate limits",
    pg_errors: "Server errors", pg_admin_log: "Admin log", pg_meta: "Its own notes", pg_active: "Days active",
    pg_msgs: "Letters", pg_gmsgs: "Group letters", pg_gdeliv: "Group deliveries", pg_flights: "Flights", pg_reacts: "Reactions", pg_near: "Near misses", pg_flyover: "Fly-overs",
    pg_stamped: "Stamps", pg_passport: "Passport places", pg_postmarks: "Postmarks", pg_feathers: "Feathers", pg_birds: "Named pigeons", pg_kit: "Kit", pg_links: "Friends",
    pg_groups: "Groups", pg_group_members: "Group members", pg_gevents: "Group events", pg_push: "Phones with notifications", pg_streaks: "Streaks", pg_ids: "Message IDs",
    pg_wxcache: "Weather on the way", pg_vanish: "Vanishing chats" };
  // (each app: its share of the database (an estimate: its tables' share of what's in them), its files, its tables)
  function storageApps(s) {
    const raw = {}, all = s.tables.reduce((a, t) => a + (t.bytes || 0), 0);
    for (const t of s.tables) raw[t.app] = (raw[t.app] || 0) + (t.bytes || 0);
    return ST_APPS.map(([id, name, colour]) => {
      const files = s.files.filter((f) => f.app === id), fn = files.reduce((a, f) => a + f.n, 0), fb = files.reduce((a, f) => a + f.bytes, 0);
      const db = s.dbBytes != null && all ? (s.dbBytes * (raw[id] || 0)) / all : null;
      return { id, name, colour, db, files, fn, fb, total: (db || 0) + fb, tables: s.tables.filter((t) => t.app === id) };
    }).sort((a, b) => b.total - a.total);
  }
  const rowsIn = (s, ...names) => s.tables.filter((t) => names.includes(t.name)).reduce((a, t) => a + t.rows, 0);
  const filesIn = (s, ...kinds) => s.files.filter((f) => kinds.includes(f.kind)).reduce((a, f) => a + f.n, 0);
  const storageSub = (s, id) => ({
    fitness: () => `${nOf(filesIn(s, "rides"), "ride file")} · ${nOf(rowsIn(s, "fx_acts"), "activity", "activities")}`,
    inflight: () => `${nOf(filesIn(s, "photos", "group"), "photo")} · ${nOf(rowsIn(s, "pg_msgs", "pg_gmsgs"), "letter")}`,
    home: () => `${nOf(filesIn(s, "bg"), "background")} · ${nOf(rowsIn(s, "messages"), "message")}`,
    weather: () => `${nOf(rowsIn(s, "wx_subs"), "place")} · ${nOf(rowsIn(s, "wx_devs"), "device")}`,
    account: () => `${nOf(rowsIn(s, "pg_users"), "person", "people")} · ${nOf(filesIn(s, "avatars", "posters"), "profile photo")}`,
  })[id]();
  const appPic = (id, size = 30) => ["fitness", "inflight", "weather"].includes(id) ? h("img.st-pic", { src: `/apps/${id}.png`, alt: "", width: size, height: size })
    : h(`span.ic.${id === "home" ? "indigo" : "grey"}${size > 30 ? ".big" : ""}`, {}, icon(id === "home" ? "home" : "person", size > 30 ? 34 : 19));
  const painted = (el, props) => { for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v); return el; };
  const countAgain = () => h("div.group", {}, h("button.row.action", { type: "button", onclick: () => { admAsk("storage", true); redraw(); } }, AD.busy.storage ? "Counting…" : "Count again"));
  function admStorageView() {
    const s = admAsk("storage");
    if (!s) return { title: "Storage", body: [admWait("storage")] };
    const apps = storageApps(s), total = apps.reduce((a, x) => a + x.total, 0), files = s.files.reduce((a, f) => ({ n: a.n + f.n, b: a.b + f.bytes }), { n: 0, b: 0 });
    return { title: "Storage", body: [
      h("div.st-total", {},
        h("div.st-big", {}, h("b", { text: bytes(total) }), h("span", { text: "across the site" })),
        h("div.st-stack", { "aria-hidden": "true" }, apps.filter((a) => a.total > 0).map((a) => painted(h("i"), { flex: `${a.total} 0 0`, background: a.colour }))),
        h("div.st-legend", {}, apps.map((a) => h("span", {}, painted(h("i"), { background: a.colour }), a.name, h("em", { text: bytes(a.total) })))),
        h("div.st-split", {}, h("span", {}, "Database ", h("b", { text: bytes(s.dbBytes) })), h("span", {}, "Files ", h("b", { text: `${num(files.n)} · ${bytes(files.b)}` })))),
      h("h4.app-k", { text: "By app" }),
      h("div.group", {}, apps.map((a) => h("button.row.st-app", { type: "button", "data-k": `st-${a.id}`, onclick: () => pushSheet(() => admStorageApp(a.id)) },
        appPic(a.id),
        h("span.tx", {}, h("b", { text: a.name }), h("small", { text: storageSub(s, a.id) }),
          h("span.st-bar", { "aria-hidden": "true" }, painted(h("i"), { width: `${total ? Math.max(1, (a.total / total) * 100) : 0}%`, background: a.colour }))),
        h("span.val", { text: bytes(a.total) }), h("span.chev", {}, icon("chev", 16, 2.4))))),
      h("h4.app-k", { text: "Cleaning up" }),
      h("div.group", {}, admInfo("Last run", s.keptAt ? seenAt(s.keptAt) : "Not yet"), admInfo(`Messages over ${s.keepDays} days`, num(s.due)), admInfo("Unused accounts warned", num(s.warned))),
      countAgain()] };
  }
  // one app's: its total and share, its database and files, its files by kind, and its tables' rows
  function admStorageApp(id) {
    const s = admAsk("storage");
    const a = s && storageApps(s).find((x) => x.id === id);
    if (!a) return { title: ST_APPS.find((x) => x[0] === id)[1], body: [admWait("storage")] };
    const total = storageApps(s).reduce((t, x) => t + x.total, 0);
    return { title: a.name, quiet: true, body: [
      h("div.app-head.set", {}, appPic(a.id, 64), h("b", { text: a.name }), h("span", { text: `${bytes(a.total)} · ${pct(a.total, total)}% of the site` })),
      h("div.group", {}, admInfo("Database", a.db == null ? "–" : `About ${bytes(a.db)}`), admInfo("Files", `${num(a.fn)} · ${bytes(a.fb)}`),
        id === "inflight" && [admInfo("Message words", bytes(s.words)), admInfo("Flight paths", bytes(s.ways))]),
      a.files.length > 0 && [h("h4.app-k", { text: "Files" }),
        h("div.group", {}, a.files.map((f) => { const k = ST_KINDS[f.kind] || f.prefix, [t, sub] = Array.isArray(k) ? k : [k];
          return h("div.row.plain.info", {}, h("span.tx", {}, h("b", { text: t }), sub && h("small", { text: sub })), h("span.val", { text: `${num(f.n)}${f.more ? "+" : ""} · ${bytes(f.bytes)}` })); }))],
      h("h4.app-k", { text: "Rows" }),
      h("div.group", {}, a.tables.length ? a.tables.map((t) => admInfo(ROWS[t.name] || t.name, num(t.rows))) : h("div.empty", { text: "Nothing kept yet." })),
      h("p.hint", { text: "The database’s size is for the whole site: each app’s is its share of what’s in it, so an estimate. Files are exact." })] };
  }

  // Email: whether it's on, who it's from, and a test to your own inbox
  function admEmailView() {
    const s = admAsk("summary"), said = h("p.said", { role: "alert" });
    if (!s) return { title: "Email", body: [admWait("summary")] };
    return { title: "Email", body: [
      s.mailFail && h("div.adm-alert.still", {}, icon("alert", 22, 2.2),
        h("span.tx", {}, h("b", { text: `The last ${nOf(s.mailFail.n, "email")} failed` }), h("small", { text: `${s.mailFail.why} · ${seenAt(s.mailFail.at)}` }))),
      h("div.group", {}, admInfo("Emails", s.email ? "On" : "Off", !s.email),
        s.email && h("div.row.plain", {}, h("span.tx", {}, h("b", { text: "From" }), h("small", { text: s.from }))),
        s.email && h("div.row.plain", {}, h("span.tx", {}, h("b", { text: "Tests go to" }), h("small", { text: s.testTo })))),
      s.email ? h("div.group", {}, h("button.row.action", { type: "button", onclick: async (e) => {
        say(said, "");
        try { const r = await admPost(e.currentTarget, "Sending…", "test-email", {}); admChanged(); toast(r.message, false, 4500); }
        catch (err) { if (!err.quiet) say(said, err.message); }
      } }, "Send a test email")) : h("p.hint", { text: "Add RESEND_API_KEY in Cloudflare to switch emails on." }),
      said] };
  }

  // The admin log: what's been done here (and by the site itself: unused accounts warned and deleted)
  const LOG = { "pigeons-added": ["Pigeons given", "gift", "amber"], "test-email": ["Test email sent", "mail", "blue"], "reset-emailed": ["Reset link emailed", "mail", "blue"],
    "reset-link": ["Reset link made", "link", "indigo"], "reset-used": ["Password reset", "key", "green"], "signed-out": ["Signed out everywhere", "signout", "grey"],
    deleted: ["Account deleted", "trash", "red"], "idle-warned": ["Unused account warned", "mail", "grey"], "idle-deleted": ["Unused account deleted", "trash", "grey"],
    "invite-made": ["Invite made", "link", "blue"], "invite-cancelled": ["Invite cancelled", "link", "grey"], linked: ["Admin linked to your account", "shield", "green"] };
  function admLogView() {
    const x = admAsk("log");
    if (!x) return { title: "Admin log", body: [admWait("log")] };
    return { title: "Admin log", body: [h("div.group", {}, x.log.length ? x.log.map((l) => { const [label, ic, tint] = LOG[l.action] || [l.action, "clock", "grey"];
      return h("div.row", {}, h(`span.ic.${tint}`, {}, icon(ic, 19)), h("span.tx", {}, h("b", { text: label }), h("small", { text: [l.detail, seenAt(l.at)].filter(Boolean).join(" · ") })));
    }) : h("div.empty", { text: "Nothing yet." }))] };
  }

  return { adminRow, adminView };
}
