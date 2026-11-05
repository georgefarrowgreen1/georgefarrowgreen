// The site's admin, on its admin's account page (account/app.js): its own file, fetched only for the account that's the
// site's admin, so no one else's page carries it. The page hands over what it draws with (setup), and gets back the
// Admin row for the page and the Admin sheet.
export function setup({ $, sheetEl, API, S, Sheet, again, ago, avatar, busy, call, day, draw, field, freshly, grow, h, homeVia, icon, ms, openSheet, passkeysView, patch, photo, popSheet, post, pushSheet, redraw, row, say, section, siteUrl, still, toast, tok, when }) {
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
    // (the scheduled jobs that send notifications, late; and anything on the Incident Desk that needs you: an incident
    // going on first, by its title)
    const stale = [["Chat", s.ticks?.inflight], ["Weather", s.ticks?.weather]].filter(([, k]) => k && Date.now() - k.at > 20 * 60e3);
    if (s.ticks && stale.length) out.push({ title: `${stale.map(([n]) => n).join(" and ")} notifications aren’t running`,
      text: stale.map(([n, k]) => (k ? `${n}: last ran ${seenAt(k.at)}` : `${n}: hasn’t run yet`)).join(" · "), open: admDeskView });
    const inc = s.statusOpen || [], n = s.deskNeeds ?? (inc.length + (s.errors?.length ? 1 : 0));
    if (inc.length) out.push({ title: inc.length > 1 ? `${nOf(inc.length, "incident")} going on` : inc[0].title, text: `Since ${seenAt(inc[inc.length - 1].started)} · on the Incident Desk`, open: admDeskView });
    else if (n) out.push({ title: n === 1 ? "1 thing needs you" : `${num(n)} things need you`, text: "On the Incident Desk", open: admDeskView });
    return out;
  }
  // ---- The Incident Desk: everything that's gone wrong, in one place (functions/_desk.js). A summary first; each app's
  // state in a strip, a tap to see only its items; then Needs you, Watching and Done. A code is marked fixed (back in
  // Needs you if it's seen again) or muted for a day, by a swipe or on its own page; an incident's open with a progress
  // bar and an update box at the foot, and once it's over, finished with two answers (a real outage? and a write-up).
  // Routine changes undo from the message that says they're done; what the public sees, or uptime, shows its result
  // before it's made. Colour never alone: each tone has its own shape ----
  const deskOpen = () => { desk(true); pushSheet(admDeskView); };
  const DK = { filter: null, showDone: false, code: null, inc: null, kind: null, text: "", vis: "pub", reason: "check", line: null, cause: null, fix: null, prevent: null, summary: null, sumOn: true };
  const desk = (again) => admAsk("desk", again);
  const deskChanged = () => { desk(true); admChanged(); };
  const TONE_SHAPE = {
    bad: '<circle cx="5" cy="5" r="4.2" fill="currentColor"/>',
    warn: '<path d="M5 .9L9.4 8.9H.6z" fill="currentColor"/>',
    ok: '<path d="M1.5 5.2l2.3 2.3L8.5 2.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    info: '<rect x="1.2" y="1.2" width="7.6" height="7.6" rx="1.6" fill="currentColor"/>',
    grey: '<circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  };
  const mark = (tone) => { const t = document.createElement("template"); t.innerHTML = `<span class="dk-mark" data-t="${tone}" aria-hidden="true"><svg viewBox="0 0 10 10" width="10" height="10">${TONE_SHAPE[tone]}</svg></span>`; return t.content.firstChild; };
  const TONE_WORD = { bad: "Failed", warn: "Slow, handled", ok: "Resolved", info: "Marked fixed", grey: "Muted" };
  const toneOf = (x) => x.type === "incident" ? (!x.ended ? "bad" : x.bucket === "done" ? "grey" : "ok")
    : x.state === "muted" ? "grey" : x.state === "fixed" ? (x.bucket === "done" ? "grey" : "info") : x.bucket === "done" ? "grey" : x.sev === "slow" ? "warn" : "bad";
  const clock = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const whenShort = (t) => seenAt(t).replace(/^Today /, "");
  const mins = (n) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60 ? `${n % 60} min` : ""}`.trim());
  const undoToast = (text, fn) => toast(text, false, 8000, { label: "Undo", fn: () => Promise.resolve(fn()).then(deskChanged, (e) => { if (!e.quiet) toast(e.message, true); }) });
  const deskPost = (path, body) => freshly(() => post(`admin/${path}`, body));
  const subOf = (x) => {
    if (x.type === "incident") return !x.ended ? `${x.stage} · since ${whenShort(x.started)}`
      : `Resolved ${whenShort(x.ended)} after ${mins(x.mins)}${x.outage === false ? " · not an outage" : ""}${x.bucket === "watching" ? ((n) => ` · ${n === 1 ? "1 thing" : `${n} things`} to finish`)([x.outage === null, !x.writeup].filter(Boolean).length) : ""}`;
    if (x.state === "fixed") return x.bucket === "done" ? `Fixed ${whenShort(x.fixedAt)} · quiet since` : `Marked fixed ${whenShort(x.fixedAt)} · watching`;
    if (x.state === "muted") return `Muted until ${whenShort(x.until)}`;
    const how = `${x.count > 1 ? `${num(x.count)} times, last ` : ""}${whenShort(x.last)}`;
    return `${x.state === "back" ? "Back again · " : x.sev === "slow" ? "Slow, handled · " : ""}${how}${x.after && x.state !== "back" ? ` · ${mins(x.after.mins)} after a deploy` : ""}`;
  };
  // (a row: its tone as a bar and a shape; a code's swipes underneath (Fixed and Mute; or back to new))
  function deskRow(x) {
    const tone = toneOf(x);
    const open = () => { if (x.type === "incident") { DK.inc = x.id; DK.kind = null; DK.text = ""; DK.vis = "pub"; pushSheet(admIncidentView); } else { DK.code = x.id; pushSheet(admCodeView); } };
    const r = h("button.row.dk-row", { type: "button", "data-k": x.id, onclick: (e) => { if (r.dataset.swiped) { delete r.dataset.swiped; e.preventDefault(); return; } open(); } },
      h("span.dk-bar", { "data-t": tone }),
      h("span.tx", {}, h("b", {}, mark(tone), h("span", { text: x.title })), h("small", { text: subOf(x) })),
      x.code && x.type === "error" ? h("code.adm-chip", { text: x.code }) : x.type === "incident" && !x.ended ? h("span.dk-live", { text: "Live" }) : null,
      h("span.chev", {}, icon("chev", 16, 2.4)));
    if (x.type !== "error") return r;
    const act = (state, label, ic, cls) => h(`button.dk-act.${cls}`, { type: "button", onclick: () => codeTo(x, state) }, icon(ic, 18, 2.4), h("span", { text: label }));
    const under = h("div.dk-under", {}, ...(x.state === "new" || x.state === "back" ? [act("fixed", "Fixed", "check", "fix"), act("muted", "Mute", "bell", "mute")] : [act("new", x.state === "muted" ? "Unmute" : "Not fixed", "undo", "mute")]));
    swipeable(r, under.children.length * 78);
    return h("div.dk-swipe", {}, under, r);
  }
  // (a row dragged left shows what's under it, and only then: a tap, even one that wobbles a little, opens the row; a
  // drag counts once it's clearly sideways. Let go past halfway and it stays open, where a tap closes it again)
  function swipeable(r, w) {
    let x0 = null, y0 = 0, dx = 0, open = false, moving = false;
    const box = () => r.parentElement;
    const settle = (on) => {
      open = on; r.classList.remove("dragging"); r.style.transform = on ? `translateX(${-w}px)` : "";
      box()?.classList.toggle("open", on);
      if (!on) setTimeout(() => { if (!open) box()?.classList.remove("swiping"); }, 260);
    };
    r.addEventListener("pointerdown", (e) => { if (e.button) return; x0 = e.clientX; y0 = e.clientY; dx = open ? -w : 0; moving = false; });
    r.addEventListener("pointermove", (e) => {
      if (x0 == null) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!moving) {
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { x0 = null; return; }
        if (Math.abs(mx) < 14 || Math.abs(mx) < Math.abs(my) * 1.5) return;
        moving = true; r.setPointerCapture?.(e.pointerId); r.classList.add("dragging"); box()?.classList.add("swiping");
      }
      dx = Math.min(0, Math.max(-w - 24, mx + (open ? -w : 0)));
      r.style.transform = `translateX(${dx}px)`;
    });
    const end = () => {
      if (x0 == null) return;
      x0 = null;
      if (!moving) return;
      settle(dx < -w / 2); r.dataset.swiped = "1";
      setTimeout(() => delete r.dataset.swiped, 350);
    };
    r.addEventListener("pointerup", end); r.addEventListener("pointercancel", end);
    // (a tap on a row that's open closes it, rather than opening it)
    r.addEventListener("click", (e) => { if (open && !r.dataset.swiped) { e.stopImmediatePropagation(); e.preventDefault(); settle(false); } }, true);
  }
  async function codeTo(x, state) {
    const was = x.state === "back" ? "fixed" : x.state;
    try {
      await deskPost("desk-code", { code: x.code, state });
      deskChanged();
      const said = state === "fixed" ? "Marked fixed. It comes back if it’s seen again." : state === "muted" ? "Muted until this time tomorrow." : "Back in Needs you.";
      undoToast(said, () => deskPost("desk-code", { code: x.code, state: was === "new" ? "new" : was }));
    } catch (e) { if (!e.quiet) toast(e.message, true); }
  }
  // (each app's state: red where something of it is live or failing, amber where it's slow, else fine)
  const appTone = (d, a) => { const live = d.items.filter((x) => x.bucket === "needs" && (x.app === a || x.apps?.includes(a))); return live.some((x) => toneOf(x) === "bad") ? "bad" : live.length ? "warn" : "ok"; };
  function admDeskView() {
    const d = desk();
    if (!d) return { title: "Incident Desk", body: [admWait("desk")] };
    const of = (x) => !DK.filter || x.app === DK.filter || x.apps?.includes(DK.filter);
    const all = d.items, needsAll = all.filter((x) => x.bucket === "needs"), vis = all.filter(of);
    const needs = vis.filter((x) => x.bucket === "needs"), watching = vis.filter((x) => x.bucket === "watching"), done = vis.filter((x) => x.bucket === "done");
    const worst = needsAll.find((x) => toneOf(x) === "bad") || needsAll[0], st = !needsAll.length ? "ok" : needsAll.some((x) => toneOf(x) === "bad") ? "down" : "warn";
    const lastInc = all.filter((x) => x.type === "incident").map((x) => x.ended || Date.now()).sort((a, b) => b - a)[0];
    const sec = (title, list, empty) => [h("h4.app-k", { text: `${title}${list.length ? ` · ${list.length}` : ""}` }),
      h("div.group.dk-list", {}, list.length ? list.map(deskRow) : h("div.empty", { text: empty }))];
    const late = d.jobs.filter((j) => j.s === "down" || (j.at && Date.now() - j.at > 20 * 60e3));
    const today = d.deploys.filter((x) => Date.now() - x.at < 864e5);
    const w = d.week || {};
    return { title: "Incident Desk", body: [
      h("div.adm-sv", { "data-s": st }, h("span.adm-halo", {}, icon(st === "ok" ? "check" : "alert", 18, 2.6)),
        h("span.tx", {}, h("b", { text: !needsAll.length ? "All clear" : needsAll.length === 1 ? "1 thing needs you" : `${needsAll.length} things need you` }),
          h("small", { text: !needsAll.length ? `Every job on time${lastInc ? ` · last incident ${ago(lastInc)}` : ""}` : `${worst.title} · ${worst.type === "incident" ? "live" : TONE_WORD[toneOf(worst)].toLowerCase()}` }))),
      h("div.dk-apps", { role: "group", "aria-label": "Show one app’s" }, d.apps.map((a) => h("button.dk-app", { type: "button", "aria-pressed": String(DK.filter === a), onclick: () => { DK.filter = DK.filter === a ? null : a; redraw(); } }, mark(appTone(d, a)), a))),
      sec("Needs you", needs, DK.filter ? `Nothing of ${DK.filter}’s needs you.` : "Nothing needs you."),
      watching.length ? sec("Watching", watching, "") : null,
      done.length ? [h("h4.app-k.dk-k", {}, h("span", { text: `Done · ${done.length}` }), h("button.link.dk-more", { type: "button", onclick: () => { DK.showDone = !DK.showDone; redraw(); } }, DK.showDone ? "Hide" : "Show")),
        DK.showDone ? h("div.group.dk-list", {}, done.map(deskRow)) : null] : null,
      h("h4.app-k", { text: "The site" }),
      h("div.group", {},
        row({ icon: "clock", tint: late.length ? "red" : "green", title: late.length ? `${nOf(late.length, "job")} not running` : `${nOf(d.jobs.length, "job")} on time`, sub: d.jobs.length ? `Every 5 minutes · slowest ${d.jobs.slice().sort((a, b) => (b.ms || 0) - (a.ms || 0))[0]?.name || "—"}` : null, warn: !!late.length, onclick: () => pushSheet(admJobsView) }),
        row({ icon: "share", tint: "blue", title: today.length ? `${nOf(today.length, "deploy")} today` : "No deploys today", sub: d.deploys[0] ? `Latest ${seenAt(d.deploys[0].at)} · ${d.deploys[0].what}${d.deploys[0].version ? ` ${d.deploys[0].version}` : ""}` : "None this week", onclick: () => pushSheet(admDeploysView) })),
      h("h4.app-k", { text: "This week" }),
      h("div.dk-week", {}, h("div", {}, h("b", { text: num(w.incidents || 0) }), h("small", { text: w.incidents === 1 ? "incident" : "incidents" })),
        h("div", {}, h("b", { text: w.typicalMins != null ? mins(w.typicalMins) : "—" }), h("small", { text: "to resolve, typical" })),
        h("div", {}, h("b", { text: w.uptime != null ? `${w.uptime}%` : "—" }), h("small", { text: "uptime" }))),
      w.causes?.length ? h("div.group", {}, w.causes.map((c) => h("div.row.plain", {}, h("span.tx", {}, h("b", { text: c.cause }), h("small", { text: "This month’s write-ups" })), h("span.val", { text: num(c.n) })))) : null,
      h("h4.app-k", { text: "Status page" }),
      h("div.group", {},
        h("a.row.action", { href: statusUrl(), target: "_blank", rel: "noopener" }, "Open the status page"),
        row({ icon: "alert", tint: "red", title: "Start an incident", sub: "For what the checks can’t see", onclick: () => { AD.pick = new Set(); AD.title = ""; AD.text = ""; pushSheet(admStartView); } }),
        row({ icon: "clock", tint: "indigo", title: "Plan maintenance", sub: "Announced ahead; it doesn’t count against uptime", onclick: () => { AD.pick = new Set(); AD.title = ""; AD.text = ""; AD.when = null; admAsk("status", true); pushSheet(admMaintView); } }),
        row({ icon: "bell", tint: "blue", title: "Maintenance and alerts", sub: d.maint?.length ? `${nOf(d.maint.length, "planned")} · how you’re told` : "How you’re told", onclick: () => { admAsk("status", true); pushSheet(admStatusView); } })),
      h("p.hint", { text: "Swipe a code’s row left to mark it fixed or mute it. An incident opens by itself when something fails two checks in a row, and closes once it’s working again." })] };
  }
  // (the scheduled jobs: when each last ran, and how long it took)
  function admJobsView() {
    const d = desk(), t = Date.now();
    const jobs = (d?.jobs || []).map((j) => ({ ...j, late: j.at && t - j.at > 20 * 60e3 }));
    const sub = (j) => !j.at ? "Not run yet" : j.s === "down" ? `Failed at ${clock(j.at)}` : j.late ? `Late · last ran ${whenShort(j.at)}` : `Every 5 min · ran ${clock(j.at)}${j.ms ? ` · ${(j.ms / 1000).toFixed(1)} s` : ""}`;
    return { title: "Scheduled jobs", body: [h("div.group", {}, jobs.length ? jobs.map((j) => h("div.row.plain", {}, mark(j.s === "down" || j.late ? "bad" : j.s === "none" ? "grey" : "ok"), h("span.tx", {}, h("b", { text: j.name }), h("small", { text: sub(j) })))) : h("div.empty", { text: "No jobs have reported yet." }))] };
  }
  function admDeploysView() {
    const d = desk();
    return { title: "Deploys", body: [h("div.group", {}, d?.deploys?.length ? d.deploys.map((x) => h("div.row.plain", {}, mark("info"), h("span.tx", {}, h("b", { text: `${x.what}${x.version ? ` ${x.version}` : ""}` }), h("small", { text: `${seenAt(x.at)}${x.note ? ` · ${x.note}` : ""}` })))) : h("div.empty", { text: "No deploys this week." })),
      h("p.hint", { text: "The site’s own deploys as its workflow says; the apps’ as the checks see their versions change." })] };
  }
  // (a dock at the foot of a sheet: its main actions, in reach of a thumb)
  const dock = (...kids) => h("div.dk-dock", {}, ...kids);
  // One code: what people saw first, then why (each part's time, where it was timed), the day with deploys marked, what
  // it is, and the raw detail folded away
  function admCodeView() {
    const d = desk(), x = d?.items.find((i) => i.id === DK.code);
    if (!d) return { title: "Code", body: [admWait("desk")] };
    if (!x) return { title: DK.code || "Code", body: [h("div.group", {}, h("div.empty", { text: "That code isn’t on the Desk any more." }))] };
    const tone = toneOf(x), steps = x.detail?.steps || [], limit = x.detail?.limit || null, max = Math.max(...steps.map((s) => s.ms), 1);
    const scale = Math.max(limit || 0, ...steps.map((s) => s.ms), 1), lead = steps.find((s) => s.ms === max);
    const why = steps.length ? [h("h4.app-k", { text: limit ? `Why · ${(steps.reduce((a, s) => Math.max(a, s.ms), 0) / 1000).toFixed(1)} s, of a ${(limit / 1000).toFixed(0)} s limit` : "Why" }),
      h("div.group.dk-steps", {}, steps.map((s) => h("div.dk-step" + (s === lead ? ".lead" : ""), {}, h("span", { text: s.name }), h("span.dk-track", {}, h("i", { style: `width:${Math.max(3, (s.ms / scale) * 100)}%`, "data-slow": s === lead ? "1" : null })), h("em", { text: `${(s.ms / 1000).toFixed(1)} s${s.done ? "" : "+"}` }))),
        h("p.dk-note", { text: `${lead.name} took longest${lead.done ? "" : " (still going when time ran out)"}.` }))]
      : x.sev === "slow" ? [h("h4.app-k", { text: "Why" }), h("div.group", {}, h("div.empty", { text: "This one came before each part’s time was kept. The next will say which part was slow." }))] : null;
    return { title: x.code, body: [
      h("div.dk-impact", {}, h("span.dk-pill", { "data-t": tone }, mark(tone), x.state === "back" ? "Back again" : TONE_WORD[tone]), h("h3", { text: x.title }), h("p", { text: x.saw })),
      why,
      x.today.length ? [h("h4.app-k", { text: "The last 24 hours" }), h("div.group.dk-chart", {}, dayChart(x.today, d.deploys), h("p.dk-note", { text: x.after ? `Dashed lines are deploys. It was first seen ${mins(x.after.mins)} after ${x.after.what}${x.after.version ? ` ${x.after.version}` : ""} was deployed.` : "Dashed lines are deploys." }))] : null,
      h("h4.app-k", { text: "About it" }),
      h("div.group", {},
        admInfo("Happened", x.count === 1 ? `Once, ${seenAt(x.last)}` : `${num(x.count)} times this week`),
        x.count > 1 ? admInfo("First and last", `${seenAt(x.first)} · ${seenAt(x.last)}`) : null,
        x.versions.length ? admInfo("Version", x.versions.join(", ")) : null,
        x.after ? admInfo("Started", `${mins(x.after.mins)} after a deploy`) : null,
        x.filed ? admInfo("Filed", "As an issue on GitHub") : null),
      x.notes.length ? [h("h4.app-k", { text: "What people wrote" }), h("div.group", {}, x.notes.map((n) => h("div.row.plain", {}, h("span.tx", {}, h("small.adm-note", { text: `“${n}”` })))))] : null,
      h("details.dk-tech", {}, h("summary", {}, "Technical detail"), h("pre", { text: [`code     ${x.code}`, `source   ${x.source}${x.kind ? ` · ${x.kind}` : ""}`, x.words && `message  ${x.words}`, x.where && `where    ${x.where}`, limit && `limit    ${limit} ms`, x.stack && `\n${x.stack}`].filter(Boolean).join("\n") })),
      dock(x.state === "new" || x.state === "back"
        ? h("div.dk-btns", {}, h("button.btn", { type: "button", onclick: () => codeTo(x, "fixed") }, icon("check", 18, 2.4), "Mark fixed"),
          h("button.btn.ghost", { type: "button", "aria-label": "Mute for a day", onclick: () => codeTo(x, "muted") }, "Mute"),
          h("button.btn.ghost.dk-sq", { type: "button", "aria-label": "Open an incident from this", onclick: () => { AD.pick = new Set(x.app ? [] : []); AD.title = x.title; AD.text = `${x.saw} (${x.code})`; admAsk("status"); pushSheet(admStartView); } }, icon("alert", 18, 2.2)))
        : h("div.dk-btns", {}, h("button.btn.ghost", { type: "button", onclick: () => codeTo(x, "new") }, x.state === "muted" ? "Unmute" : "Move back to Needs you")))] };
  }
  // (the last day, its occurrences as dots along it, its deploys as dashed lines)
  function dayChart(times, deploys) {
    const t1 = Date.now(), t0 = t1 - 864e5, X = (t) => 8 + ((t - t0) / (t1 - t0)) * 284;
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 300 70"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${times.length} in the last 24 hours`);
    const el = (n, a) => { const e = document.createElementNS(ns, n); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); svg.append(e); return e; };
    el("line", { x1: 8, y1: 60, x2: 292, y2: 60, class: "dk-axis" });
    for (const dpl of deploys.filter((x) => x.at > t0)) el("line", { x1: X(dpl.at), y1: 6, x2: X(dpl.at), y2: 60, class: "dk-dep" });
    const seen = new Map();
    for (const t of times) { const col = Math.round(X(t) / 6), n = seen.get(col) || 0; seen.set(col, n + 1); el("circle", { cx: X(t), cy: 52 - Math.min(n, 5) * 8, r: 3.6, class: "dk-hit" }); }
    const box = h("div.dk-svg", {}); box.append(svg);
    box.append(h("div.dk-ax", {}, h("span", { text: clock(t0) }), h("span", { text: clock(t0 + 432e5) }), h("span", { text: "Now" })));
    return box;
  }
  // One incident: open, a progress bar, what it affects, its timeline and an update box at the foot (suggested words,
  // Public or Private, Preview); over, a banner, what's left to finish it, its timeline, and notes for yourself
  const STAGES = ["Investigating", "Identified", "Monitoring", "Resolved"];
  const SUGGEST = {
    Investigating: [["Looking into it", "Investigating", (x) => `${x.title.replace(/ not (answering|running|working)$/, "")} isn’t working as it should. We’re looking into it.`], ["Found the cause", "Identified", () => "We’ve found the cause and are working on a fix."]],
    Identified: [["Fix on its way", "Identified", () => "A fix is on its way."], ["Working again", "Monitoring", () => "It’s working again. We’re keeping an eye on it."]],
    Monitoring: [["Still watching", "Monitoring", () => "Still working normally. We’ll close this soon."]],
  };
  function timeline(x) {
    const evs = [
      ...x.updates.map((u) => ({ at: u.at, t: u.k === "Resolved" ? "ok" : u.k === "Spotted" ? "bad" : u.by === "owner" ? "pub" : "grey", head: u.k === "Spotted" ? "Spotted" : u.k, sub: u.w, tag: u.by === "owner" ? "Public" : null })),
      ...x.notes.map((n) => ({ at: n.at, t: "me", head: "Your note", sub: n.w, tag: "Private" })),
      ...x.deploys.map((dp) => ({ at: dp.at, t: "dep", head: `Deploy · ${dp.what}${dp.version ? ` ${dp.version}` : ""}`, sub: dp.note || "" })),
    ].sort((a, b) => a.at - b.at);
    return h("div.group.dk-tl", {}, evs.map((e) => h("div.dk-ev", { "data-t": e.t }, h("span.dk-pin"), h("div.dk-evh", {}, h("time", { text: clock(e.at) }), h("b", { text: e.head }), e.tag ? h("span.dk-tag", { "data-p": e.tag === "Private" ? "1" : null, text: e.tag }) : null), e.sub ? h("p", { text: e.sub }) : null)),
      x.codes.length ? h("div.dk-codes", {}, h("small", { text: "Errors while it lasted" }), ...x.codes.map((c) => h("button.adm-chip.dk-codebtn", { type: "button", onclick: () => { DK.code = c; pushSheet(admCodeView); } }, c))) : null);
  }
  function admIncidentView() {
    const d = desk(), x = d?.items.find((i) => i.id === DK.inc && i.type === "incident");
    if (!d) return { title: "Incident", body: [admWait("desk")] };
    if (!x) return { title: "Incident", body: [h("div.group", {}, h("div.empty", { text: "That incident isn’t there any more." }))] };
    const said = h("p.said", { role: "alert" }), more = h("button.x.dk-more-btn", { type: "button", "aria-label": "More", onclick: () => pushSheet(admIncidentMore) }, icon("sliders", 17, 2.2));
    const text = h("textarea.dk-text", { rows: x.ended ? "2" : "3", maxlength: "600", placeholder: x.ended ? "A note for yourself" : "What’s happening, in a sentence or two", "aria-label": x.ended ? "A note for yourself" : "The update" });
    text.value = DK.text || ""; text.addEventListener("input", () => { DK.text = text.value; });
    const priv = !!x.ended || DK.vis === "priv";
    const go = h("button.btn.dk-post", { type: "button", onclick: () => postUpdate(x, go, said) }, icon(priv ? "pencil" : "share", 18, 2.2), priv ? "Add note" : DK.kind === "Resolved" ? "Post and close" : "Post");
    const box = h("div.dk-composer", {},
      !x.ended ? h("div.dk-suggest", {}, [...(SUGGEST[x.stage] || []), ["Resolved", "Resolved", () => "It’s working normally again. Sorry for the trouble."]].map(([label, kind, f]) =>
        h("button.adm-kind", { type: "button", "aria-checked": String(DK.kind === kind && DK.text === f(x)), role: "checkbox", onclick: () => { DK.kind = kind; DK.text = f(x); DK.vis = "pub"; redraw(); } }, label))) : null,
      text,
      h("div.dk-crow", {},
        x.ended ? h("small.dk-hint", { text: "Once it’s over, notes are yours alone" })
          : h("div.dk-seg", { role: "group", "aria-label": "Who sees it" }, [["pub", "Public"], ["priv", "Private"]].map(([k, l]) => h("button", { type: "button", "aria-pressed": String(DK.vis === k), onclick: () => { DK.vis = k; redraw(); } }, l))),
        !priv ? h("button.link", { type: "button", onclick: () => pushSheet(admPreviewView) }, "Preview") : null,
        h("span.dk-grow"), go));
    const stageIx = x.ended ? 4 : STAGES.indexOf(x.stage);
    const body = !x.ended ? [
      h("div.dk-impact", {}, h("span.dk-pill", { "data-t": "bad" }, mark("bad"), `Live · since ${clock(x.started)}`), h("h3", { text: x.title }), h("p", { text: x.updates[0]?.w || "" }),
        h("div.dk-stepper", {}, STAGES.map((s, i) => h("div", { "data-s": i < stageIx ? "done" : i === stageIx ? "now" : null }, h("i"), s)))),
      h("h4.app-k", { text: "Affects" }),
      h("div.adm-kinds", { role: "group", "aria-label": "What it affects" }, (d.catalogue || []).filter((c) => x.svcs.includes(c.id) || ["today", "chat", "weather", "fitness", "markets", "mail", "auth"].includes(c.id)).map((c) =>
        h("button.adm-kind", { type: "button", role: "checkbox", "aria-checked": String(x.svcs.includes(c.id)), onclick: (e) => affects(x, c.id, e.currentTarget) }, c.name))),
    ] : [
      h("div.dk-banner", {}, icon("check", 20, 2.6), h("span", {}, h("b", { text: `Resolved after ${mins(x.mins)}` }), h("small", { text: `${seenAt(x.started)} to ${clock(x.ended)} · ${x.updates.find((u) => u.k === "Resolved")?.by === "owner" ? "closed by you" : "closed by itself when its checks passed"}` }))),
      h("h4.app-k", { text: "Finish up" }),
      h("div.group", {},
        h("button.row.dk-check", { type: "button", onclick: () => { DK.reason = "check"; DK.line = null; pushSheet(admOutageView); } }, h("span.dk-box", { "data-on": x.outage !== null ? "1" : null }, x.outage !== null ? icon("check", 14, 3) : null),
          h("span.tx", {}, h("b", { text: "Was it a real outage?" }), h("small", { text: x.outage === null ? "Until you say, it counts against uptime" : x.outage ? "Kept as an outage" : "Not an outage: taken out of uptime" })), h("span.chev", {}, icon("chev", 16, 2.4))),
        h("button.row.dk-check", { type: "button", onclick: () => { DK.cause = x.writeup?.cause || null; DK.fix = x.writeup?.fix ?? null; DK.prevent = x.writeup?.prevent ?? null; DK.summary = x.writeup?.summary ?? null; DK.sumOn = x.writeup ? !!x.writeup.summary : true; pushSheet(admWriteupView); } },
          h("span.dk-box", { "data-on": x.writeup ? "1" : null }, x.writeup ? icon("check", 14, 3) : null),
          h("span.tx", {}, h("b", { text: "Write it up" }), h("small", { text: x.writeup ? `Cause: ${x.writeup.cause.toLowerCase()}${x.writeup.fix ? ` · fixed by ${x.writeup.fix}` : ""}` : "What caused it, what fixed it, what stops it again" })), h("span.chev", {}, icon("chev", 16, 2.4)))),
    ];
    return { title: x.title, right: more, body: [...body, h("h4.app-k", { text: "Timeline" }), timeline(x), said, dock(box)] };
  }
  async function affects(x, id, b) {
    const svcs = x.svcs.includes(id) ? x.svcs.filter((s) => s !== id) : [...x.svcs, id], was = x.svcs;
    try { b.disabled = true; await deskPost("status-affects", { id: x.id, svcs }); deskChanged(); undoToast("What it affects changed on the status page.", () => deskPost("status-affects", { id: x.id, svcs: was })); }
    catch (e) { if (!e.quiet) toast(e.message, true); } finally { b.disabled = false; }
  }
  async function postUpdate(x, b, said) {
    say(said, "");
    const text = (DK.text || "").trim();
    if (!text) return say(said, x.ended ? "Write the note first." : "Write the update first, or tap a suggestion.");
    try {
      if (x.ended || DK.vis === "priv") {
        const r = await busy(b, "Adding…", () => deskPost("status-private", { id: x.id, text }));
        DK.text = ""; deskChanged();
        const at = r.notes?.[0]?.at;
        undoToast("Note added. Only you see it.", () => deskPost("status-private", { id: x.id, remove: at }));
      } else {
        const kind = DK.kind || (x.stage === "Investigating" ? "Update" : x.stage);
        const r = await busy(b, "Posting…", () => deskPost("status-note", { id: x.id, kind, text }));
        DK.text = ""; DK.kind = null; deskChanged();
        const at = r.incident?.updates?.[0]?.at;
        undoToast(kind === "Resolved" ? "Resolved. It’s on the status page." : `Posted to the status page${kind !== "Update" ? ` as ${kind}` : ""}.`, () => deskPost("status-unnote", { id: x.id, at }));
      }
    } catch (e) { if (!e.quiet) say(said, e.message); }
  }
  // (how the update will read on the status page)
  function admPreviewView() {
    const x = desk()?.items.find((i) => i.id === DK.inc);
    if (!x) return { title: "Preview", body: [] };
    const kind = DK.kind || (x.stage === "Investigating" ? "Update" : x.stage);
    const pub = x.updates.filter((u) => u.k !== "Spotted" || true).slice(0, 4);
    return { title: "Preview", body: [h("p.hint", { text: "How it will look on the status page when you post it." }),
      h("div.dk-public", {}, h("div.dk-ph", {}, h("b", { text: x.title }), h("span", { "data-k": kind === "Resolved" ? "ok" : "on", text: kind === "Resolved" ? "Resolved" : x.stage })),
        h("div.dk-up", {}, h("b", { text: `${kind} · now` }), h("span", { text: (DK.text || "").trim() || "Nothing written yet." })),
        ...pub.map((u) => h("div.dk-up", {}, h("b", { text: `${u.k} · ${clock(u.at)}` }), h("span", { text: u.w }))))] };
  }
  // (more: open it again, or the status page)
  function admIncidentMore() {
    const x = desk()?.items.find((i) => i.id === DK.inc), said = h("p.said", { role: "alert" });
    if (!x) return { title: "Incident", body: [] };
    const text = h("textarea", { rows: "2", maxlength: "600", "aria-label": "What the status page says", placeholder: "We’re looking at this again." });
    return { title: x.title, body: [
      h("div.group", {}, h("a.row.action", { href: statusUrl(), target: "_blank", rel: "noopener" }, "Open the status page")),
      x.ended ? [h("h4.app-k", { text: "Open it again" }), h("div.form", {}, h("label.field", {}, text),
        h("button.btn.ghost", { type: "button", onclick: async (e) => {
          try { await admPost(e.currentTarget, "Opening…", "status-reopen", { id: x.id, text: text.value }); deskChanged(); popSheet(); toast("Opened again. The status page says so."); }
          catch (err) { if (!err.quiet) say(said, err.message); }
        } }, "Reopen")), h("p.hint", { text: "It stays open until you post an update marked Resolved; the checks won’t close it." }), said] : null] };
  }
  // Was it a real outage? The answer's effect shown before it's made: uptime now and with it, and the status page's line
  const REASONS = [["check", "Our own check was wrong", (x) => `${x.title.replace(/ not (answering|running|working)$/, "")} kept working throughout. A fault in our own check reported it as down.`],
    ["noone", "Nobody was affected", () => "Nobody was affected: it was over before anyone could notice."], ["planned", "Planned work", () => "This was planned work, done without notice."]];
  function admOutageView() {
    const d = desk(), x = d?.items.find((i) => i.id === DK.inc), said = h("p.said", { role: "alert" });
    if (!x) return { title: "Not an outage?", body: [] };
    const r = REASONS.find((y) => y[0] === DK.reason) || REASONS[0];
    if (DK.line == null) DK.line = r[2](x);
    const line = h("textarea", { rows: "3", maxlength: "300", "aria-label": "What the status page will say" }); line.value = DK.line; line.addEventListener("input", () => { DK.line = line.value; });
    const svc = x.svcs.find((s) => d.uptime90?.[s]), u = svc ? d.uptime90[svc] : null, take = x.downN || 0;
    const pct = (n, dn) => (n ? `${(Math.floor(((n - dn) / n) * 10000) / 100).toFixed(2)}%` : "—");
    return { title: "Not an outage?", body: [
      h("p.hint", { text: "Mark it when what the checks saw wasn’t something people went without: it comes out of uptime, and the status page says what happened." }),
      h("h4.app-k", { text: "Why" }),
      h("div.adm-kinds", { role: "radiogroup" }, REASONS.map(([k, l, f]) => h("button.adm-kind", { type: "button", role: "radio", "aria-checked": String(DK.reason === k), onclick: () => { DK.reason = k; DK.line = f(x); redraw(); } }, l))),
      h("label.field", {}, h("span", { text: "What the status page will say" }), line),
      u ? [h("h4.app-k", { text: `${d.catalogue.find((c) => c.id === svc)?.name || svc}’s uptime, 90 days` }), h("div.dk-uptime", {}, h("div", {}, h("b", { text: pct(u[0], u[1]) }), h("small", { text: "now" })), icon("chev", 18, 2.4),
        h("div", {}, h("b.ok", { text: pct(u[0], Math.max(0, u[1] - (x.outage === false ? 0 : take))) }), h("small", { text: "with this" })))] : null,
      h("div.form", {},
        h("button.btn", { type: "button", onclick: async (e) => {
          say(said, "");
          try { await admPost(e.currentTarget, "Saving…", "status-outage", { id: x.id, outage: false, line: DK.line }); deskChanged(); popSheet(); undoToast("Not an outage: taken out of uptime.", () => deskPost("status-outage", { id: x.id, outage: true })); }
          catch (err) { if (!err.quiet) say(said, err.message); }
        } }, "Mark as not an outage"),
        h("button.btn.ghost", { type: "button", onclick: async (e) => {
          try { await admPost(e.currentTarget, "Saving…", "status-outage", { id: x.id, outage: true }); deskChanged(); popSheet(); toast("Kept as an outage."); }
          catch (err) { if (!err.quiet) say(said, err.message); }
        } }, "It was a real outage")),
      said] };
  }
  // The write-up: three answers, a minute's work; the summary on the status page if you want it there
  function admWriteupView() {
    const d = desk(), x = d?.items.find((i) => i.id === DK.inc), said = h("p.said", { role: "alert" });
    if (!x) return { title: "Write-up", body: [] };
    const area = (k, ph, rows = "2") => { const el = h("textarea", { rows, maxlength: "600", placeholder: ph, "aria-label": ph }); el.value = DK[k] || ""; el.addEventListener("input", () => { DK[k] = el.value; }); return el; };
    const fixes = [...x.deploys.map((dp) => `${dp.what}${dp.version ? ` ${dp.version}` : ""} · ${clock(dp.at)}`), "Nothing: it passed by itself"];
    return { title: "Write-up", body: [
      h("h4.app-k", { text: "What caused it" }),
      h("div.adm-kinds", { role: "radiogroup" }, (d.causes || []).map((c) => h("button.adm-kind", { type: "button", role: "radio", "aria-checked": String(DK.cause === c), onclick: () => { DK.cause = c; redraw(); } }, c))),
      h("h4.app-k", { text: "What fixed it" }),
      h("div.adm-kinds", { role: "radiogroup" }, fixes.map((f) => h("button.adm-kind", { type: "button", role: "radio", "aria-checked": String(DK.fix === f), onclick: () => { DK.fix = f; redraw(); } }, f))),
      h("label.field", {}, h("span", { text: "What stops it happening again" }), area("prevent", "A test, a check, a change", "3")),
      h("h4.app-k", { text: "On the status page" }),
      h("div.dk-seg.wide", { role: "group" }, [[true, "Show a summary"], [false, "Keep it private"]].map(([on, l]) => h("button", { type: "button", "aria-pressed": String(DK.sumOn === on), onclick: () => { DK.sumOn = on; redraw(); } }, l))),
      DK.sumOn ? h("label.field", {}, area("summary", "A sentence or two for anyone to read")) : null,
      h("div.form", {}, h("button.btn", { type: "button", onclick: async (e) => {
        say(said, "");
        if (!DK.cause) return say(said, "Pick what caused it.");
        try {
          await admPost(e.currentTarget, "Saving…", "status-writeup", { id: x.id, cause: DK.cause, fix: DK.fix || "", prevent: DK.prevent || "", summary: DK.sumOn ? DK.summary || "" : "" });
          deskChanged(); popSheet(); toast(x.outage !== null ? "Written up. It’s in Done now." : "Written up.");
        } catch (err) { if (!err.quiet) say(said, err.message); }
      } }, "Save write-up")),
      said] };
  }
  // (from an incident's notification, #admin=incident:<id>; or the Desk, #admin=desk: opened over Admin once it's loaded)
  function openTo(to) {
    const m = /^(desk|incident:(.+))$/.exec(String(to || ""));
    if (!m) return;
    pushSheet(admDeskView);
    if (m[2]) { DK.inc = m[2]; DK.kind = null; DK.text = ""; DK.vis = "pub"; desk(true); pushSheet(admIncidentView); }
  }

  // status.inflite.ai: its incidents (opened and closed by the checks themselves), and on each, an update written here,
  // shown there as it's posted: what's happening, in your words (functions/_status.js)
  const statusUrl = () => (/\/\/account\./.test(location.origin) ? location.origin.replace("//account.", "//status.") : "https://status.inflite.ai");
  const incWhen = (i) => `${i.ended ? "Resolved" : "Ongoing"} · ${seenAt(i.started)}${i.ended ? ` to ${new Date(i.ended).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
  const hm = (t) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const span = (m) => `${seenAt(m.starts).replace(/^Today /, "today ")}–${hm(m.ends)}`;
  function admStatusView() {
    const x = admAsk("status"), said = h("p.said", { role: "alert" });
    // (how you're told: each a switch, saved as it's flipped)
    const sw = (k, title, sub) => {
      const el = h("input.switch", { type: "checkbox", role: "switch", "aria-label": title, checked: !!x?.prefs?.[k] });
      el.onchange = async () => {
        say(said, "");
        try { const r = await admPost(el, "", "status-prefs", { [k]: el.checked }); x.prefs = r.prefs; }
        catch (err) { el.checked = !el.checked; if (!err.quiet) say(said, err.message); }
      };
      return h("label.row.plain", {}, h("span.tx", {}, h("b", { text: title }), h("small", { text: sub })), el);
    };
    const maint = (m) => h("div.row", {}, h("span.ic.indigo", {}, icon("clock", 19)),
      h("span.tx", {}, h("b", { text: m.title }), h("small", { text: `${Date.now() >= m.starts ? "Going on now, until " + hm(m.ends) : span(m)}${m.svcs.length ? ` · ${m.svcs.map((id) => x.catalogue.find((c) => c.id === id)?.name || id).join(", ")}` : " · everything"}` })),
      h("button.mini", { type: "button", onclick: async (e) => {
        say(said, "");
        try { await admPost(e.currentTarget, "", "status-maint", { cancel: m.id }); admAsk("status", true); admChanged(); toast("Maintenance called off."); }
        catch (err) { if (!err.quiet) say(said, err.message); }
      } }, "Cancel"));
    return { title: "Maintenance and alerts", body: [
      h("div.group", {}, h("a.row.action", { href: statusUrl(), target: "_blank", rel: "noopener" }, "Open the status page")),
      h("div.group", {},
        row({ icon: "alert", tint: "red", title: "Start an incident", sub: "For what the checks can’t see", onclick: () => { AD.pick = new Set(); AD.title = ""; AD.text = ""; pushSheet(admStartView); } }),
        row({ icon: "clock", tint: "indigo", title: "Plan maintenance", sub: "Announced ahead; it doesn’t count against uptime", onclick: () => { AD.pick = new Set(); AD.title = ""; AD.text = ""; AD.when = null; pushSheet(admMaintView); } })),
      said,
      x && x.maint.length ? [h("h4.app-k", { text: "Maintenance planned" }), h("div.group", {}, x.maint.map(maint))] : null,
      !x ? admWait("status") : null,
      x && [h("h4.app-k", { text: "Tell me when" }), h("div.group", {},
        sw("push", "An incident opens or closes", "A notification on your devices, whatever the hour"),
        sw("email", "And by email", "To the site’s admin address"),
        sw("burst", "The same bug, five times in ten minutes", "Opens an incident by itself"))]] };
  }
  // (what an incident or maintenance covers: any of the status page's addresses, jobs and outside services, or none)
  const pickChips = (x) => h("div.adm-kinds", { role: "group", "aria-label": "What’s affected" }, x.catalogue.map((c) => h("button.adm-kind", { type: "button", role: "checkbox", "aria-checked": String(AD.pick.has(c.id)),
    onclick: () => { AD.pick.has(c.id) ? AD.pick.delete(c.id) : AD.pick.add(c.id); redraw(); } }, c.name)));
  const kept = (el, k) => { el.value = AD[k] || ""; el.addEventListener("input", () => { AD[k] = el.value; }); return el; };
  function admStartView() {
    const x = admAsk("status"), said = h("p.said", { role: "alert" });
    if (!x) return { title: "Start an incident", body: [admWait("status")] };
    const title = kept(h("input", { placeholder: "What people see, e.g. Weather alerts are late", maxlength: "100", "aria-label": "Title" }), "title");
    const text = kept(h("textarea", { rows: "3", maxlength: "600", placeholder: "What’s happening, in a sentence or two", "aria-label": "What’s happening" }), "text");
    const go = h("button.btn", { type: "submit" }, icon("share", 20, 2.2), "Post to the status page");
    return { title: "Start an incident", body: [
      h("form.form", { onsubmit: async (e) => {
        e.preventDefault(); say(said, "");
        try {
          const r = await admPost(go, "Posting…", "status-incident", { svcs: [...AD.pick], title: AD.title || "", text: AD.text || "" });
          AD.title = AD.text = ""; AD.pick = new Set(); DK.inc = r.incident.id; DK.kind = null; DK.text = ""; DK.vis = "pub"; admAsk("status", true); deskChanged(); toast("On the status page."); pushSheet(admIncidentView);
        } catch (err) { if (!err.quiet) say(said, err.message); }
      } }, h("h4.app-k", { text: "What’s affected" }), pickChips(x), h("label.field", {}, h("span", { text: "Title" }), title), h("label.field", {}, h("span", { text: "What’s happening" }), text), go),
      said,
      h("p.hint", { text: "It stays open until you post an update marked Resolved. Anything you name shows a banner in its app while it’s open." })] };
  }
  const DURS = [[15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"]];
  function admMaintView() {
    const x = admAsk("status"), said = h("p.said", { role: "alert" });
    if (!x) return { title: "Plan maintenance", body: [admWait("status")] };
    // (when, as this device's own time: tomorrow at 02:00 to begin with)
    if (!AD.when) { const d = new Date(Date.now() + 864e5); d.setHours(2, 0, 0, 0); AD.when = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); AD.dur = 30; }
    const when = h("input", { type: "datetime-local", value: AD.when, "aria-label": "Starts" });
    when.addEventListener("input", () => { AD.when = when.value; });
    const dur = h("select", { "aria-label": "How long" }, DURS.map(([m, t]) => h("option", { value: String(m), selected: AD.dur === m }, t)));
    dur.addEventListener("change", () => { AD.dur = Number(dur.value); });
    const title = kept(h("input", { placeholder: "e.g. Database upgrade", maxlength: "100", "aria-label": "Title" }), "title");
    const text = kept(h("textarea", { rows: "2", maxlength: "600", placeholder: "What people might notice (optional)", "aria-label": "What people might notice" }), "text");
    const go = h("button.btn", { type: "submit" }, icon("clock", 20, 2.2), "Plan it");
    return { title: "Plan maintenance", body: [
      h("form.form", { onsubmit: async (e) => {
        e.preventDefault(); say(said, "");
        const starts = new Date(AD.when).getTime();
        try {
          await admPost(go, "Planning…", "status-maint", { svcs: [...AD.pick], title: AD.title || "", text: AD.text || "", starts, ends: starts + (AD.dur || 30) * 6e4 });
          AD.title = AD.text = ""; AD.pick = new Set(); AD.when = null; admAsk("status", true); admChanged(); toast("Maintenance planned: it’s on the status page.");
        } catch (err) { if (!err.quiet) say(said, err.message); }
      } }, h("h4.app-k", { text: "What it covers" }), pickChips(x),
        h("div.adm-two", {}, h("label.field", {}, h("span", { text: "Starts" }), when), h("label.field", {}, h("span", { text: "How long" }), dur)),
        h("label.field", {}, h("span", { text: "Title" }), title), h("label.field", {}, h("span", { text: "What people might notice" }), text), go),
      said,
      h("p.hint", { text: "Nothing named covers everything. While it’s on, failures in what it covers open no incident and don’t count against uptime; each app it covers shows a banner." })] };
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
        // (the Incident Desk: the server, the status page, bug reports and deploys, in one place)
        ((n, live) => row({ icon: "wave", tint: live ? "red" : n ? "amber" : "green", title: "Incident Desk", sub: live ? `${nOf(live, "incident")} going on` : null, subWarn: !!live,
          value: n ? `${num(n)} need${n === 1 ? "s" : ""} you` : h("span.adm-ok", {}, icon("check", 15, 3), "All clear"), warn: !!n, onclick: () => deskOpen() }))(s.deskNeeds ?? 0, s.statusOpen?.length || 0),
        row({ icon: "clock", tint: "amber", title: "Admin log", value: s.logAt ? upper(when(s.logAt)) : null, onclick: () => pushSheet(admLogView) })),
      h("h4.app-k", { text: "Home page" }),
      // (Edit: there signed in as you, carried over just now, as the home page's sign-in is a cookie of its own site's,
      // which may have ended or be someone else's; and having shown it's you here, it's straight into editing)
      h("div.group", {},
        row({ icon: "home", tint: "green", title: "Home page", sub: [nOf(home.photos || 0, "photo"), home.editedAt && `words changed ${when(home.editedAt)}`].filter(Boolean).join(" · "),
          value: h("span.mini.go", { text: "Edit" }), onclick: () => { location.href = homeVia(siteUrl("") + "#edit", true); } })),
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

  // Insights: how Chat is used, in totals over everyone (functions/_insights.js), never who sent what to whom
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
  // Signing in, in counts only (functions/_signincount.js): each day's made and refused, and what went wrong, by kind
  const SIGNIN_SAID = { "bad-password": "Wrong password", "bad-passkey": "Passkey refused", "handback-failed": "Code back to an app no good",
    "hop-failed": "Carried to the home page, no good", "passkey-cancelled": "Passkey cancelled or none found", "passkey-unusable": "Passkey couldn’t be used here",
    offline: "Offline", "no-wasm": "No WebAssembly (Lockdown Mode)", error: "Something else went wrong" };
  function signinPart(si, grow, g) {
    if (!si) return [];
    const add = (ks) => (si[ks[0]] || []).map((_, i) => ks.reduce((n, k) => n + (si[k]?.[i] || 0), 0));
    const made = add(["ok-password", "ok-passkey", "ok-qr"]), bad = Object.keys(SIGNIN_SAID);
    const tot = (k) => (si[k] || []).reduce((a, b) => a + b, 0), wrong = bad.map((k) => [SIGNIN_SAID[k], tot(k)]).filter(([, n]) => n), wrongN = wrong.reduce((a, [, n]) => a + n, 0);
    return [h("h4.app-k", { text: "Signing in" }), admBars("Signed in", made, grow), admBars("Went wrong", add(bad), grow),
      wrong.length ? h("div.group.adm-meters" + g, {}, wrong.sort((a, b) => b[1] - a[1]).map(([l, n], j) => admMeter(l, n, wrongN, null, j))) : h("div.group", {}, h("div.empty", { text: "Nothing’s gone wrong signing in." }))];
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
      ...signinPart(x.signin, grow, g),
      ...(x.pepper?.on ? [h("div.group", {}, admInfo("Passwords’ pepper, kept for the move", x.pepper.kept ? "Yes" : x.pepper.key ? "Not yet" : "Needs PIGEON_PEPPER_KEY", !x.pepper.kept),
        x.pepper.key ? admInfo("Settings and secrets, kept for the move", x.keptSecrets ? String(x.keptSecrets) : "Not yet", !x.keptSecrets) : null)] : []),
      h("h4.app-k", { text: "Landing on time" }),
      h("div.group", {}, admInfo("In the air now", num(H.flying)), admInfo("Landed today", num(H.landed)), admInfo("Lost to Pigeon Death today", num(H.lost)),
        admInfo("Landings not told yet", H.late ? num(H.late) : "None", !!H.late)),
      h("div.group", {}, h("button.row.action", { type: "button", onclick: () => { admAsk("insights", true); redraw(); } }, AD.busy.insights ? "Counting…" : "Count again"))] };
  }

  // Storage: what's kept across the site, and how much, by app; each app's own page one tap on (functions/_retention.js)
  const bytes = (n) => (n == null ? "–" : n < 1024 ? `${Math.round(n)} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);
  const ST_APPS = [["fitness", "Fitness", "#f2552c"], ["inflight", "Chat", "#2f7bf6"], ["home", "Home page", "#a855f7"], ["weather", "Weather", "#3ab0f0"], ["account", "Accounts", "#8e8e93"]];
  const ST_KINDS = { photos: "Photos and voice", group: "Group photos", avatars: "Profile pictures", posters: "Card photos", bg: "Site backgrounds",
    rides: ["Ride and run files", "FIT, GPX and TCX"], garmin: "From Garmin, not yet read", strava: "From Strava, not yet read" };
  const ROWS = { fx_acts: "Activities", fx_well: "Nights and check-ins", fx_health: "From Apple Health", fx_health_key: "Apple Health links", fx_state: "Plans and settings",
    fx_garmin: "Linked to Garmin", fx_garmin_new: "Waiting from Garmin", fx_strava: "Linked to Strava", fx_strava_new: "Waiting from Strava", fx_push: "Phones with reminders", fx_meta: "Its own notes",
    wx_subs: "Places with notifications", wx_devs: "Devices", wx_accts: "Accounts’ places and settings", wx_obs: "Observations kept", wx_meta: "Its own notes",
    messages: "Messages from the contact form",
    pg_users: "People", pg_sessions: "Signed in", pg_passkeys: "Passkeys", pg_challenges: "Sign-ins under way", pg_resets: "Password resets", pg_handoff: "Into an app, signed in",
    pg_handback: "Back from an app, signed in", pg_handles_held: "Handles held", pg_invites: "Invites", pg_events: "Account emails’ links", pg_limits: "Rate limits",
    pg_errors: "Server errors", pg_admin_log: "Admin log", pg_meta: "Its own notes", pg_active: "Days active",
    pg_msgs: "Messages and letters", pg_gmsgs: "Group messages and letters", pg_gdeliv: "Group deliveries", pg_flights: "Flights", pg_reacts: "Reactions", pg_near: "Near misses", pg_flyover: "Fly-overs",
    pg_stamped: "Stamps", pg_passport: "Passport places", pg_postmarks: "Postmarks", pg_feathers: "Feathers", pg_birds: "Named pigeons", pg_kit: "Kit", pg_links: "Friends",
    pg_groups: "Groups", pg_group_members: "Group members", pg_gevents: "Group events", pg_push: "Phones with notifications", pg_streaks: "Streaks", pg_ids: "Message IDs",
    pg_wxcache: "Weather on the way", pg_vanish: "Vanishing chats",
    pg_ways: "Chat ways", pg_wayev: "Way changes", pg_pulse: "Change feed" };
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

  // Email: whether it's on, who it's from, and a test of every sender to your own inbox
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
      } }, "Send me one of each")) : h("p.hint", { text: "Add RESEND_API_KEY in Cloudflare to switch emails on." }),
      said] };
  }

  // The admin log: what's been done here (and by the site itself: unused accounts warned and deleted)
  const LOG = { "status-update": ["Status page updated", "wave", "green"], "status-incident": ["Incident started", "alert", "red"], "status-maint": ["Maintenance planned", "clock", "indigo"], "status-maint-off": ["Maintenance called off", "clock", "grey"], "pigeons-added": ["Pigeons given", "gift", "amber"], "test-email": ["Test email sent", "mail", "blue"], "reset-emailed": ["Reset link emailed", "mail", "blue"],
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

  return { adminRow, adminView, openTo };
}
